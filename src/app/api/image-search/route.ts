import https from "node:https";
import http from "node:http";
import { queryOne, RowDataPacket } from "@/server/db/mysql";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { ImageSearchMethod } from "@/app/api/settings/google-search/route";

export const runtime = "nodejs";

/**
 * Google 图片搜索 API
 *
 * 四种模式（在系统设置中切换）：
 *   1. scraper_proxy  — 直接爬 Google Images + SOCKS5 代理轮询（默认）
 *   2. google_api     — Google Custom Search 官方 API（多 Key 轮询）
 *   3. scraper_api    — 通过 ScraperAPI 第三方服务爬取（多 Key 轮询）
 *   4. serper_api     — 通过 Serper.dev API 搜索（推荐，返回结构化 JSON）
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
  serperApiKeys: string[];
  mirrorUrl: string;
};

// ============================================================
// 轮询计数器（模块级，进程内持久）
// ============================================================
let apiKeyIndex = 0;
let proxyIndex = 0;
let scraperKeyIndex = 0;
let serperKeyIndex = 0;

// ============================================================
// 从数据库读取配置
// ============================================================

async function getConfig(): Promise<GoogleSearchConfig> {
  const defaults: GoogleSearchConfig = {
    method: "scraper_proxy",
    apiKeys: [],
    proxies: [],
    scraperApiKeys: [],
    serperApiKeys: [],
    mirrorUrl: "",
  };
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = 'google_search_config'"
    );
    if (!row?.value) return defaults;
    const raw = JSON.parse(row.value);

    const method: ImageSearchMethod =
      raw.method && ["scraper_proxy", "google_api", "scraper_api", "serper_api", "mirror_scraper"].includes(raw.method)
        ? raw.method
        : raw.apiKeys?.length
          ? "google_api"
          : "scraper_proxy";

    return {
      method,
      apiKeys: Array.isArray(raw.apiKeys) ? raw.apiKeys.filter((k: any) => k?.apiKey && k?.cx) : [],
      proxies: Array.isArray(raw.proxies) ? raw.proxies.filter(Boolean) : [],
      scraperApiKeys: Array.isArray(raw.scraperApiKeys) ? raw.scraperApiKeys.filter(Boolean) : [],
      serperApiKeys: Array.isArray(raw.serperApiKeys) ? raw.serperApiKeys.filter(Boolean) : [],
      mirrorUrl: typeof raw.mirrorUrl === "string" ? raw.mirrorUrl.trim() : "",
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

function buildGoogleImagesUrl(query: string, page = 0): string {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("tbm", "isch");
  url.searchParams.set("ijn", String(page));
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
  proxies: string[],
  page = 0
): Promise<ImageSearchResult[]> {
  const googleUrl = buildGoogleImagesUrl(query, page);

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
  apiKeys: Array<{ apiKey: string; cx: string }>,
  page = 0
): Promise<ImageSearchResult[]> {
  const keyPair = apiKeys[apiKeyIndex % apiKeys.length];
  apiKeyIndex++;

  const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
  searchUrl.searchParams.set("key", keyPair.apiKey);
  searchUrl.searchParams.set("cx", keyPair.cx);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("searchType", "image");
  searchUrl.searchParams.set("num", "10");
  searchUrl.searchParams.set("start", String(page * 10 + 1));
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
  scraperApiKeys: string[],
  page = 0
): Promise<ImageSearchResult[]> {
  const key = scraperApiKeys[scraperKeyIndex % scraperApiKeys.length];
  scraperKeyIndex++;

  const googleUrl = buildGoogleImagesUrl(query, page);

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
// 模式四：Serper.dev API（serper_api）—— 推荐
// 直接返回结构化 JSON，无需解析 HTML，速度快（1-2 秒）
// 免费 2,500 次/月，之后 $0.30/千次
// ============================================================

async function searchViaSerper(
  query: string,
  serperApiKeys: string[],
  page = 0
): Promise<ImageSearchResult[]> {
  const maxRetries = Math.min(3, serperApiKeys.length); // 最多重试 3 次，且不超过 Key 数量
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyIdx = (serperKeyIndex + attempt) % serperApiKeys.length;
    const key = serperApiKeys[keyIdx];

    console.log(
      `[image-search] serper_api using key #${keyIdx + 1}` +
        (attempt > 0 ? ` (retry ${attempt}/${maxRetries - 1})` : "")
    );

    try {
      const res = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: {
          "X-API-KEY": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query,
          num: 10,
          page: page + 1, // Serper 页码从 1 开始
        }),
        signal: AbortSignal.timeout(15000),
      });

      // Key 额度耗尽或被限流 → 跳过此 Key，试下一个
      if (res.status === 429 || res.status === 403) {
        const errText = await res.text().catch(() => "");
        console.warn(
          `[image-search] Serper key #${keyIdx + 1} unavailable (${res.status}): ${errText.substring(0, 100)}`
        );
        lastError = new Error(
          res.status === 429 ? "RATE_LIMITED" : `SERPER_API_FAILED:${res.status}`
        );
        continue; // 尝试下一个 Key
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(
          `[image-search] Serper API error:`,
          res.status,
          errText.substring(0, 200)
        );
        throw new Error(`SERPER_API_FAILED:${res.status}`);
      }

      // 成功 → 更新轮询指针，使下次从下一个 Key 开始
      serperKeyIndex = keyIdx + 1;

      const data = await res.json();
      const images: any[] = data.images ?? [];

      return images.map((img) => ({
        url: img.imageUrl ?? "",
        thumbnail: img.thumbnailUrl ?? img.imageUrl ?? "",
        title: img.title ?? "",
        width: img.imageWidth ?? 0,
        height: img.imageHeight ?? 0,
        contextUrl: img.link ?? "",
      }));
    } catch (err: any) {
      // 网络超时等非 HTTP 错误也尝试下一个 Key
      if (err?.message?.includes("SERPER_API_FAILED")) throw err; // 非限流的 HTTP 错误直接抛出
      console.warn(
        `[image-search] Serper key #${keyIdx + 1} request failed:`,
        err?.message
      );
      lastError = err;
    }
  }

  // 所有 Key 都失败了
  throw lastError ?? new Error("RATE_LIMITED");
}

// ============================================================
// 模式五：自定义 Google 镜像站（mirror_scraper）
// 通过 Google 镜像站搜索图片，返回与 Google Images 相同的 HTML
// 无需代理、无需 API Key，依赖镜像站可用性
// ============================================================

async function searchViaMirror(
  query: string,
  mirrorUrl: string,
  page = 0
): Promise<ImageSearchResult[]> {
  // 从镜像站 URL 提取 origin，使用 /search 路径进行图片搜索
  // /imghp 是搜索首页（不含结果），/search 才返回实际搜索结果
  const parsed = new URL(mirrorUrl);
  const searchUrl = new URL(`${parsed.origin}/search`);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("tbm", "isch");
  searchUrl.searchParams.set("ijn", String(page));

  console.log(`[image-search] mirror_scraper: ${searchUrl.toString().substring(0, 120)}...`);

  const res = await fetch(searchUrl.toString(), {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`MIRROR_FAILED:${res.status}`);
  }

  let html = await res.text();

  // 检测反爬（镜像站也可能触发）
  if (
    html.includes("detected unusual traffic") ||
    html.includes("/sorry/") ||
    html.includes("captcha")
  ) {
    throw new Error("RATE_LIMITED");
  }

  // zmirror 会将所有 URL 重写为 http://内部地址/extdomains/domain.com/path 格式
  // 将内部地址替换为配置的外部镜像站地址，使图片可通过镜像代理下载
  const mirrorOrigin = new URL(mirrorUrl).origin; // e.g. http://younghome.fun:22978
  html = html.replace(
    /https?:\/\/[^\/\s"']+(?=\/extdomains\/)/g,
    mirrorOrigin
  );

  return parseGoogleImagesHtml(html);
}

// ============================================================
// 公共搜索接口（供后台批量任务直接调用，跳过 HTTP 层）
// ============================================================

export async function performImageSearch(
  query: string,
  page = 0
): Promise<ImageSearchResult[]> {
  const config = await getConfig();

  let method = config.method;
  if (method === "google_api" && config.apiKeys.length === 0) method = "scraper_proxy";
  if (method === "scraper_api" && config.scraperApiKeys.length === 0) method = "scraper_proxy";
  if (method === "serper_api" && config.serperApiKeys.length === 0) method = "scraper_proxy";
  if (method === "mirror_scraper" && !config.mirrorUrl) method = "scraper_proxy";

  switch (method) {
    case "google_api":
      return searchViaGoogleApi(query, config.apiKeys, page);
    case "scraper_api":
      return searchViaScraperApi(query, config.scraperApiKeys, page);
    case "serper_api":
      return searchViaSerper(query, config.serperApiKeys, page);
    case "mirror_scraper":
      return searchViaMirror(query, config.mirrorUrl, page);
    case "scraper_proxy":
    default:
      return searchViaScraperProxy(query, config.proxies, page);
  }
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
  if (method === "serper_api" && config.serperApiKeys.length === 0) {
    method = "scraper_proxy"; // 没有 Serper Key，降级到爬虫
  }
  if (method === "mirror_scraper" && !config.mirrorUrl) {
    method = "scraper_proxy"; // 没有镜像站 URL，降级到爬虫
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

      case "serper_api":
        console.log(
          `[image-search] Using Serper.dev API (${config.serperApiKeys.length} key(s))`
        );
        items = await searchViaSerper(q, config.serperApiKeys);
        break;

      case "mirror_scraper":
        console.log(
          `[image-search] Using mirror site: ${config.mirrorUrl}`
        );
        items = await searchViaMirror(q, config.mirrorUrl);
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

    if (
      message.startsWith("SCRAPE_FAILED") ||
      message.startsWith("SCRAPER_API_FAILED") ||
      message.startsWith("SERPER_API_FAILED") ||
      message.startsWith("MIRROR_FAILED")
    ) {
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
