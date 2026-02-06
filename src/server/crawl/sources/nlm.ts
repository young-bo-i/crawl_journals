import { fetchTextWithTimeout } from "../http";
import { queryOne, RowDataPacket } from "@/server/db/mysql";

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const MAX_RETRIES = 3;

// 轮询计数器（模块级，进程内持久）
let nlmKeyIndex = 0;

type NlmKeyEntry = { apiKey: string; email: string };

// 缓存 Key 列表，避免每次请求都读数据库
let cachedKeys: NlmKeyEntry[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 秒缓存

/**
 * 从数据库读取 NLM API Key 配置（带缓存）
 */
async function getNlmKeys(): Promise<NlmKeyEntry[]> {
  const now = Date.now();
  if (cachedKeys !== null && now - cacheTime < CACHE_TTL) {
    return cachedKeys;
  }

  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = 'nlm_api_keys'"
    );
    if (row?.value) {
      const config = JSON.parse(row.value);
      if (Array.isArray(config.keys)) {
        cachedKeys = config.keys.filter((k: any) => k && k.apiKey);
        cacheTime = now;
        return cachedKeys!;
      }
    }
  } catch (err) {
    console.error("[nlm] Failed to read API keys from DB:", err);
  }

  cachedKeys = [];
  cacheTime = now;
  return [];
}

/**
 * 构建请求参数，使用指定的 Key 索引
 */
function buildParams(dbKeys: NlmKeyEntry[], keyIdx: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set("tool", process.env.NCBI_TOOL?.trim() || "crawl_journals");

  if (dbKeys.length > 0) {
    const entry = dbKeys[keyIdx % dbKeys.length];
    params.set("api_key", entry.apiKey);
    if (entry.email) {
      params.set("email", entry.email);
    }
  } else {
    // 兜底：读取环境变量
    const email = process.env.NCBI_EMAIL?.trim();
    const apiKey = process.env.NCBI_API_KEY?.trim();
    if (apiKey) params.set("api_key", apiKey);
    if (email) params.set("email", email);
  }

  return params;
}

/**
 * 带重试的 NLM 请求：失败时自动换 Key 重试，最多 MAX_RETRIES 次
 */
async function fetchWithRetry(
  buildUrl: (params: URLSearchParams) => string,
  opts: { timeoutMs?: number; signal?: AbortSignal }
) {
  const dbKeys = await getNlmKeys();
  const totalKeys = Math.max(dbKeys.length, 1); // 至少尝试 1 次
  const retries = Math.min(MAX_RETRIES, totalKeys); // 重试次数不超过 Key 数量

  let lastError: any = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    const keyIdx = nlmKeyIndex;
    nlmKeyIndex++;

    const params = buildParams(dbKeys, keyIdx);
    const url = buildUrl(params);

    try {
      const result = await fetchTextWithTimeout(url, {
        timeoutMs: opts.timeoutMs ?? 30_000,
        signal: opts.signal,
        headers: { accept: "application/json", "user-agent": "crawl_journals/0.1" },
      });

      // 检查是否是 API Key 无效或限流错误
      if (!result.ok) {
        const isKeyError =
          result.status === 429 ||
          result.status === 403 ||
          result.bodyText.includes("API key invalid") ||
          result.bodyText.includes("api key") ||
          result.bodyText.includes("Too Many Requests");

        if (isKeyError && attempt < retries - 1) {
          const keyNum = dbKeys.length > 0 ? (keyIdx % dbKeys.length) + 1 : 0;
          console.warn(
            `[nlm] Request failed with key#${keyNum} (HTTP ${result.status}), retrying with next key (attempt ${attempt + 1}/${retries})...`
          );
          continue;
        }
      }

      // 成功或非 Key 相关错误，直接返回
      return result;
    } catch (err: any) {
      lastError = err;

      // AbortSignal 触发的取消不重试
      if (err?.name === "AbortError" || opts.signal?.aborted) {
        throw err;
      }

      // 网络/超时错误，换 Key 重试
      if (attempt < retries - 1) {
        const keyNum = dbKeys.length > 0 ? (keyIdx % dbKeys.length) + 1 : 0;
        console.warn(
          `[nlm] Request error with key#${keyNum}: ${err?.message}, retrying with next key (attempt ${attempt + 1}/${retries})...`
        );
        continue;
      }
    }
  }

  // 所有重试都失败
  throw lastError || new Error("NLM request failed after retries");
}

export async function fetchNlmEsearch(args: { issn: string; timeoutMs?: number; signal?: AbortSignal }) {
  return fetchWithRetry(
    (params) => {
      params.set("db", "nlmcatalog");
      params.set("term", `${args.issn}[ISSN]`);
      params.set("retmode", "json");
      return `${NCBI_BASE}/esearch.fcgi?${params.toString()}`;
    },
    { timeoutMs: args.timeoutMs, signal: args.signal }
  );
}

/**
 * 根据期刊标题搜索 NLM Catalog（用于非 ISSN 期刊）
 */
export async function fetchNlmEsearchByTitle(args: { title: string; timeoutMs?: number; signal?: AbortSignal }) {
  return fetchWithRetry(
    (params) => {
      params.set("db", "nlmcatalog");
      params.set("term", `${args.title}[Title]`);
      params.set("retmode", "json");
      return `${NCBI_BASE}/esearch.fcgi?${params.toString()}`;
    },
    { timeoutMs: args.timeoutMs, signal: args.signal }
  );
}

export async function fetchNlmEsummary(args: { uids: string[]; timeoutMs?: number; signal?: AbortSignal }) {
  return fetchWithRetry(
    (params) => {
      params.set("db", "nlmcatalog");
      params.set("id", args.uids.join(","));
      params.set("retmode", "json");
      return `${NCBI_BASE}/esummary.fcgi?${params.toString()}`;
    },
    { timeoutMs: args.timeoutMs, signal: args.signal }
  );
}
