import { fetchTextWithTimeout } from "../http";
import { getOpenAlexKeyManager } from "../openalex-key-manager";

const OPENALEX_BASE = "https://api.openalex.org";
const MAX_RETRIES = 3; // 最大重试次数（用于 429 错误切换密钥）

/**
 * 构建带 API Key 的 URL
 */
async function buildUrlWithApiKey(baseUrl: string): Promise<string> {
  const keyManager = getOpenAlexKeyManager();
  const apiKey = await keyManager.getCurrentKey();
  
  if (!apiKey) {
    return baseUrl;
  }
  
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}api_key=${encodeURIComponent(apiKey)}`;
}

/**
 * 执行请求，支持 429 错误时自动切换密钥重试
 */
async function fetchWithKeyRotation(
  baseUrl: string,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }
) {
  const keyManager = getOpenAlexKeyManager();
  let lastError: any = null;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const url = await buildUrlWithApiKey(baseUrl);
      const result = await fetchTextWithTimeout(url, options);

      // 如果成功或不是 429 错误，直接返回
      if (result.status !== 429) {
        return result;
      }

      // 遇到 429 限流错误
      console.warn(`[OpenAlex] 遇到 429 限流错误 (尝试 ${retryCount + 1}/${MAX_RETRIES})`);
      lastError = new Error(`HTTP 429: Rate limited`);

      // 尝试切换到下一个密钥
      const switched = await keyManager.switchToNextKey();
      if (!switched) {
        // 如果无法切换（只有一个或没有密钥），直接返回 429 结果
        console.warn(`[OpenAlex] 无法切换密钥，返回 429 错误`);
        return result;
      }

      // 切换成功，继续重试
      retryCount++;
      console.log(`[OpenAlex] 已切换密钥，准备重试 (${retryCount}/${MAX_RETRIES})`);
      
      // 短暂延迟后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err: any) {
      // 网络错误或其他异常，直接抛出
      throw err;
    }
  }

  // 达到最大重试次数
  console.error(`[OpenAlex] 达到最大重试次数 (${MAX_RETRIES})，所有密钥都被限流`);
  throw lastError ?? new Error("Max retries reached");
}

export async function fetchOpenAlexList(args: {
  cursor: string;
  perPage?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const perPage = args.perPage ?? 200;
  const baseUrl = `${OPENALEX_BASE}/sources?filter=type:journal&per-page=${perPage}&cursor=${encodeURIComponent(
    args.cursor,
  )}`;
  
  return fetchWithKeyRotation(baseUrl, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: {
      accept: "application/json",
      "user-agent": "crawl_journals/0.1",
    },
  });
}

export async function fetchOpenAlexDetail(args: { 
  issn: string; 
  timeoutMs?: number; 
  signal?: AbortSignal;
}) {
  const baseUrl = `${OPENALEX_BASE}/sources/issn:${encodeURIComponent(args.issn)}`;
  
  return fetchWithKeyRotation(baseUrl, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: { 
      accept: "application/json", 
      "user-agent": "crawl_journals/0.1" 
    },
  });
}

/**
 * 根据 OpenAlex ID 获取期刊详情（用于非 ISSN 期刊）
 * @param openalexId - OpenAlex ID，如 "S1234567" 或完整 URL "https://openalex.org/S1234567"
 */
export async function fetchOpenAlexDetailById(args: { 
  openalexId: string; 
  timeoutMs?: number; 
  signal?: AbortSignal;
}) {
  // 提取短 ID（去掉 URL 前缀）
  const shortId = args.openalexId.replace("https://openalex.org/", "");
  const baseUrl = `${OPENALEX_BASE}/sources/${encodeURIComponent(shortId)}`;
  
  return fetchWithKeyRotation(baseUrl, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: { 
      accept: "application/json", 
      "user-agent": "crawl_journals/0.1" 
    },
  });
}
