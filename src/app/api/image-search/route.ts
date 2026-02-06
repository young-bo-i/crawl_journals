import https from "node:https";
import http from "node:http";
import { queryOne, RowDataPacket } from "@/server/db/mysql";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { ImageSearchMethod } from "@/app/api/settings/google-search/route";

export const runtime = "nodejs";

/**
 * Google 图片搜索 API
 *
 * 三种模式（在系统设置中切换）：
 *   1. scraper_proxy  — 直接爬 Google Images + SOCKS5 代理轮询（默认）
 *   2. google_api     — Google Custom Search 官方 API（多 Key 轮询）
 *   3. scraper_api    — 通过 ScraperAPI 第三方服务爬取（多 Key 轮询）
 */

export type ImageSearchResult = {
  url: string;
  thumbnail: string;
  title: string;
  width: number;
  height: number;
  contextUrl: string;
};

type GoogleSearchConfig = {
  method: ImageSearchMethod;
  apiKeys: Array<{ apiKey: string; cx: string }>;
  proxies: string[];
  scraperApiKeys: string[];
};

// ============================================================
// 轮询计数器（模块级，进程内持久）
// ============================================================
let apiKeyIndex = 0;
let proxyIndex = 0;
let scraperKeyIndex = 0;

// ============================================================
// 从数据库读取配置
// ============================================================

async function getConfig(): Promise<GoogleSearchConfig> {
  const defaults: GoogleSearchConfig = {
    method: "scraper_proxy",
    apiKeys: [],
    proxies: [],
    scraperApiKeys: [],
  };
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = 'google_search_config'"
    );
    if (!row?.value) return defaults;
    const raw = JSON.parse(row.value);

    const method: ImageSearchMethod =
      raw.method && ["scraper_proxy", "google_api", "scraper_api"].includes(raw.method)
        ? raw.method
        : raw.apiKeys?.length
          ? "google_api"
          : "scraper_proxy";

    return {
      method,
      apiKeys: Array.isArray(raw.apiKeys) ? raw.apiKeys.filter((k: any) => k?.apiKey && k?.cx) : [],
      proxies: Array.isArray(raw.proxies) ? raw.proxies.filter(Boolean) : [],
      scraperApiKeys: Array.isArray(raw.scraperApiKeys) ? raw.scraperApiKeys.filter(Boolean) : [],
    };
  } catch (err) {
    console.error("[image-search] Failed to read config:", err);
    return defaults;
  }
}

// ============================================================
// 通用 HTTP 请求（支持可选 SOCKS5 代理）
// ============================================================

function fetchWithOptionalProxy(
  url: string,
  headers: Record<string, string>,
  proxyUrl?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: { ...headers, Host: parsed.hostname },
      timeout: 15000,
    };

    if (proxyUrl) {
      options.agent = new SocksProxyAgent(proxyUrl);
    }

    const req = mod.request(options, (res) => {
      if (
        res.statusCode &&
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        fetchWithOptionalProxy(redirectUrl, headers, proxyUrl)
          .then(resolve)
          .catch(reject);
        return;
      }

      let data = "";
      res.setEncoding("utf-8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

// ============================================================
// Google Images HTML 解析器（共享，scraper_proxy 和 scraper_api 均使用）
// ============================================================

const GOOGLE_DOMAINS = [
  "encrypted-tbn",
  "gstatic.com",
  "google.com",
  "googleapis.com",
  "googleusercontent.com",
  "ggpht.com",
  "youtube.com",
  "ytimg.com",
];

function isGoogleDomain(url: string): boolean {
  return GOOGLE_DOMAINS.some((d) => url.includes(d));
}

function parseGoogleImagesHtml(html: string): ImageSearchResult[] {
  const results: ImageSearchResult[] = [];
  const seenUrls = new Set<string>();

  // 策略 1: 从 AF_initDataCallback 数据中提取
  const arrayPattern =
    /\["(https?:\/\/[^"]{20,})"[^,]*,\s*(\d+)\s*,\s*(\d+)\s*\]/g;

  let match: RegExpExecArray | null;
  while ((match = arrayPattern.exec(html)) !== null) {
    let [, rawUrl, dim1Str, dim2Str] = match;

    rawUrl = rawUrl.replace(
      /\\u([0-9a-fA-F]{4})/g,
      (_, hex: string) => String.fromCharCode(parseInt(hex, 16))
    );
    rawUrl = rawUrl.replace(/\\(.)/g, "$1");

    if (isGoogleDomain(rawUrl)) continue;
    if (rawUrl.startsWith("data:") || rawUrl.endsWith(".svg")) continue;

    const d1 = parseInt(dim1Str);
    const d2 = parseInt(dim2Str);
    if (d1 < 80 || d2 < 80) continue;
    if (seenUrls.has(rawUrl)) continue;
    seenUrls.add(rawUrl);

    results.push({
      url: rawUrl,
      thumbnail: rawUrl,
      title: "",
      width: Math.max(d1, d2),
      height: Math.min(d1, d2),
      contextUrl: "",
    });

    if (results.length >= 20) break;
  }

  // 策略 2: 兜底 — <img> data-src
  if (results.length < 5) {
    const imgPattern = /data-src="(https?:\/\/[^"]+)"/g;
    while ((match = imgPattern.exec(html)) !== null) {
      const [, imgUrl] = match;
      if (isGoogleDomain(imgUrl)) continue;
      if (seenUrls.has(imgUrl)) continue;
      seenUrls.add(imgUrl);

      results.push({
        url: imgUrl,
        thumbnail: imgUrl,
        title: "",
        width: 0,
        height: 0,
        contextUrl: "",
      });
      if (results.length >= 20) break;
    }
  }

  return results;
}

// ============================================================
// 构造 Google Images 搜索 URL
// ============================================================

function buildGoogleImagesUrl(query: string): string {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("tbm", "isch");
  url.searchParams.set("ijn", "0");
  return url.toString();
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ============================================================
// 模式一：直接爬虫 + SOCKS5 代理（scraper_proxy）
// ============================================================

async function searchViaScraperProxy(
  query: string,
  proxies: string[]
): Promise<ImageSearchResult[]> {
  const googleUrl = buildGoogleImagesUrl(query);

  let proxyUrl: string | undefined;
  if (proxies.length > 0) {
    proxyUrl = proxies[proxyIndex % proxies.length];
    proxyIndex++;
    console.log(
      `[image-search] scraper_proxy using proxy #${((proxyIndex - 1) % proxies.length) + 1}: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`
    );
  }

  const { status, body: html } = await fetchWithOptionalProxy(
    googleUrl,
    BROWSER_HEADERS,
    proxyUrl
  );

  if (status === 429) throw new Error("RATE_LIMITED");
  if (status < 200 || status >= 300) throw new Error(`SCRAPE_FAILED:${status}`);
  if (
    html.includes("detected unusual traffic") ||
    html.includes("/sorry/") ||
    html.includes("captcha")
  ) {
    throw new Error("RATE_LIMITED");
  }

  return parseGoogleImagesHtml(html);
}

// ============================================================
// 模式二：Google Custom Search 官方 API（google_api）
// ============================================================

async function searchViaGoogleApi(
  query: string,
  apiKeys: Array<{ apiKey: string; cx: string }>
): Promise<ImageSearchResult[]> {
  const keyPair = apiKeys[apiKeyIndex % apiKeys.length];
  apiKeyIndex++;

  const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
  searchUrl.searchParams.set("key", keyPair.apiKey);
  searchUrl.searchParams.set("cx", keyPair.cx);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("searchType", "image");
  searchUrl.searchParams.set("num", "12");
  searchUrl.searchParams.set("safe", "active");
  searchUrl.searchParams.set("imgType", "photo");

  const res = await fetch(searchUrl.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(
      `[image-search] Google API error (key#${((apiKeyIndex - 1) % apiKeys.length) + 1}):`,
      res.status,
      errText
    );
    throw new Error(`Google API 返回错误 (${res.status})`);
  }

  const data = await res.json();
  return (data.items ?? []).map((item: any) => ({
    url: item.link,
    thumbnail: item.image?.thumbnailLink ?? item.link,
    title: item.title ?? "",
    width: item.image?.width ?? 0,
    height: item.image?.height ?? 0,
    contextUrl: item.image?.contextLink ?? "",
  }));
}

// ============================================================
// 模式三：ScraperAPI 第三方代理（scraper_api）
// ============================================================

async function searchViaScraperApi(
  query: string,
  scraperApiKeys: string[]
): Promise<ImageSearchResult[]> {
  const key = scraperApiKeys[scraperKeyIndex % scraperApiKeys.length];
  scraperKeyIndex++;

  const googleUrl = buildGoogleImagesUrl(query);

  // ScraperAPI endpoint: 传入目标 URL，返回原始 HTML
  // 必须启用 render=true (JS 渲染)，否则 Google Images 不会加载图片数据
  // 注：render=true 消耗 5 credits/请求，普通请求 1 credit
  const scraperUrl = new URL("https://api.scraperapi.com");
  scraperUrl.searchParams.set("api_key", key);
  scraperUrl.searchParams.set("url", googleUrl);
  scraperUrl.searchParams.set("render", "true");

  console.log(
    `[image-search] scraper_api using key #${((scraperKeyIndex - 1) % scraperApiKeys.length) + 1}`
  );

  const res = await fetch(scraperUrl.toString(), {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(60000), // render=true 模式需要更长时间（约 30-50 秒）
  });

  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[image-search] ScraperAPI error:`, res.status, errText.substring(0, 200));
    throw new Error(`SCRAPER_API_FAILED:${res.status}`);
  }

  const html = await res.text();

  // ScraperAPI 返回的是 Google 原始页面 HTML，检测反爬
  if (
    html.includes("detected unusual traffic") ||
    html.includes("/sorry/") ||
    html.includes("captcha")
  ) {
    throw new Error("RATE_LIMITED");
  }

  return parseGoogleImagesHtml(html);
}

// ============================================================
// GET /api/image-search?q=...
// ============================================================

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q) {
    return Response.json(
      { error: "Missing query parameter: q" },
      { status: 400 }
    );
  }

  const config = await getConfig();

  // 根据 method 选择搜索方式，如果当前方式缺少必要配置则降级
  let method = config.method;
  if (method === "google_api" && config.apiKeys.length === 0) {
    method = "scraper_proxy"; // 没有 API Key，降级到爬虫
  }
  if (method === "scraper_api" && config.scraperApiKeys.length === 0) {
    method = "scraper_proxy"; // 没有 ScraperAPI Key，降级到爬虫
  }

  try {
    let items: ImageSearchResult[];

    switch (method) {
      case "google_api":
        console.log(
          `[image-search] Using Google Custom Search API (${config.apiKeys.length} key(s))`
        );
        items = await searchViaGoogleApi(q, config.apiKeys);
        break;

      case "scraper_api":
        console.log(
          `[image-search] Using ScraperAPI (${config.scraperApiKeys.length} key(s))`
        );
        items = await searchViaScraperApi(q, config.scraperApiKeys);
        break;

      case "scraper_proxy":
      default:
        console.log(
          `[image-search] Using direct scraper` +
            (config.proxies.length > 0
              ? ` (${config.proxies.length} proxy/proxies)`
              : " (direct)")
        );
        items = await searchViaScraperProxy(q, config.proxies);
        break;
    }

    return Response.json({
      results: items,
      source: method,
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error("[image-search] Error:", message);

    if (message === "RATE_LIMITED") {
      return Response.json(
        {
          error: "rate_limited",
          message:
            "Google 图片搜索请求被限流，请稍后重试。可在「系统设置」中切换搜索方式或配置代理。",
        },
        { status: 429 }
      );
    }

    if (message.startsWith("SCRAPE_FAILED") || message.startsWith("SCRAPER_API_FAILED")) {
      return Response.json(
        {
          error: "scrape_failed",
          message: `图片搜索页面访问失败 (${message})`,
        },
        { status: 502 }
      );
    }

    return Response.json(
      { error: "search_failed", message: message || "图片搜索失败" },
      { status: 502 }
    );
  }
}
