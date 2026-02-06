import { fetchTextWithTimeout } from "../http";
import { queryOne, RowDataPacket } from "@/server/db/mysql";

// ===== 代理配置缓存 =====
type WikidataProxyConfig = { enabled: boolean; proxies: string[] };

let _cachedConfig: WikidataProxyConfig | null = null;
let _cachedAt = 0;
let _proxyIndex = 0;

const CACHE_TTL_MS = 60_000; // 60 秒缓存

async function getProxyConfig(): Promise<WikidataProxyConfig> {
  if (_cachedConfig && Date.now() - _cachedAt < CACHE_TTL_MS) return _cachedConfig;
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = ?",
      ["wikidata_proxy_config"],
    );
    _cachedConfig = row?.value
      ? JSON.parse(row.value)
      : { enabled: false, proxies: [] };
  } catch {
    _cachedConfig = { enabled: false, proxies: [] };
  }
  _cachedAt = Date.now();
  return _cachedConfig!;
}

/** 获取下一个代理地址（轮询），未启用时返回 undefined */
function pickProxy(config: WikidataProxyConfig): string | undefined {
  if (!config.enabled || config.proxies.length === 0) return undefined;
  const proxy = config.proxies[_proxyIndex % config.proxies.length];
  _proxyIndex++;
  return proxy;
}

// ===== SPARQL 构建 =====

export function buildIssnSparql(issn: string) {
  return `
    SELECT ?item ?itemLabel ?officialWebsite WHERE {
      ?item wdt:P236 "${issn}" .
      OPTIONAL { ?item wdt:P856 ?officialWebsite . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en,zh". }
    }
    LIMIT 50
  `.trim();
}

/**
 * 构建按标题搜索的 SPARQL 查询（用于非 ISSN 期刊）
 */
export function buildTitleSparql(title: string) {
  // 转义特殊字符
  const escapedTitle = title.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  return `
    SELECT ?item ?itemLabel ?officialWebsite WHERE {
      ?item wdt:P31/wdt:P279* wd:Q5633421 .
      ?item rdfs:label ?label .
      FILTER(CONTAINS(LCASE(?label), LCASE("${escapedTitle}")))
      OPTIONAL { ?item wdt:P856 ?officialWebsite . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en,zh". }
    }
    LIMIT 10
  `.trim();
}

// ===== 公开的抓取函数 =====

export async function fetchWikidataByIssn(args: { issn: string; timeoutMs?: number; signal?: AbortSignal }) {
  const endpoint = (process.env.WIKIDATA_ENDPOINT ?? "https://query.wikidata.org/sparql").trim();
  const query = buildIssnSparql(args.issn);
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("query", query);
  const url = `${endpoint}?${params.toString()}`;

  const config = await getProxyConfig();
  const proxyUrl = pickProxy(config);
  if (proxyUrl) {
    console.log(`[wikidata] Using proxy: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`);
  }

  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 45_000,
    signal: args.signal,
    proxyUrl,
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "crawl_journals/0.1",
    },
  });
}

/**
 * 根据期刊标题搜索 Wikidata（用于非 ISSN 期刊）
 */
export async function fetchWikidataByTitle(args: { title: string; timeoutMs?: number; signal?: AbortSignal }) {
  const endpoint = (process.env.WIKIDATA_ENDPOINT ?? "https://query.wikidata.org/sparql").trim();
  const query = buildTitleSparql(args.title);
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("query", query);
  const url = `${endpoint}?${params.toString()}`;

  const config = await getProxyConfig();
  const proxyUrl = pickProxy(config);
  if (proxyUrl) {
    console.log(`[wikidata] Using proxy: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`);
  }

  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 45_000,
    signal: args.signal,
    proxyUrl,
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "crawl_journals/0.1",
    },
  });
}
