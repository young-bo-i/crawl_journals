import https from "node:https";
import http from "node:http";
import { queryOne, RowDataPacket } from "@/server/db/mysql";
import { SocksProxyAgent } from "socks-proxy-agent";

export const runtime = "nodejs";

/**
 * Google 图片搜索 API
 *
 * 双模式 + 多 Key 轮询 + SOCKS5 代理：
 *   1. 如果在系统设置中配置了 Google Custom Search API Key → 走官方 API（多 Key 轮询）
 *   2. 未配置 → 走 Google Images 爬虫（支持 SOCKS5 代理轮询）
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
  apiKeys: Array<{ apiKey: string; cx: string }>;
  proxies: string[];
};

// ============================================================
// 轮询计数器（模块级，进程内持久）
// ============================================================
let apiKeyIndex = 0;
let proxyIndex = 0;

// ============================================================
// 从数据库读取配置（兼容新旧格式）
// ============================================================

async function getGoogleSearchConfig(): Promise<GoogleSearchConfig> {
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = 'google_search_config'"
    );
    if (row?.value) {
      const raw = JSON.parse(row.value);

      // 新格式
      if (Array.isArray(raw.apiKeys)) {
        return {
          apiKeys: raw.apiKeys.filter(
            (k: any) => k && k.apiKey && k.cx
          ),
          proxies: Array.isArray(raw.proxies)
            ? raw.proxies.filter(Boolean)
            : [],
        };
      }

      // 旧格式兼容: {apiKey, cx}
      if (raw.apiKey && raw.cx) {
        return {
          apiKeys: [{ apiKey: raw.apiKey, cx: raw.cx }],
          proxies: [],
        };
      }
    }
  } catch (err) {
    console.error("[image-search] Failed to read config from DB:", err);
  }
  return { apiKeys: [], proxies: [] };
}

// ============================================================
// 通过 SOCKS5 代理 或 直连 发起 HTTPS 请求
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
      headers: {
        ...headers,
        Host: parsed.hostname,
      },
      timeout: 15000,
    };

    if (proxyUrl) {
      options.agent = new SocksProxyAgent(proxyUrl);
    }

    const req = mod.request(options, (res) => {
      // 处理重定向
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
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body: data })
      );
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
// 方式一：Google Custom Search 官方 API（多 Key 轮询）
// ============================================================

async function searchViaApi(
  query: string,
  apiKeys: Array<{ apiKey: string; cx: string }>
): Promise<ImageSearchResult[]> {
  // 轮询选择一组 Key
  const keyPair = apiKeys[apiKeyIndex % apiKeys.length];
  apiKeyIndex++;

  const searchQuery = `${query} journal cover`;
  const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
  searchUrl.searchParams.set("key", keyPair.apiKey);
  searchUrl.searchParams.set("cx", keyPair.cx);
  searchUrl.searchParams.set("q", searchQuery);
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
      `[image-search] Google API error (key#${(apiKeyIndex - 1) % apiKeys.length + 1}):`,
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
// 方式二：Google Images 爬虫（支持 SOCKS5 代理轮询）
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

async function scrapeGoogleImages(
  query: string,
  proxies: string[]
): Promise<ImageSearchResult[]> {
  const searchQuery = `${query} journal cover`;
  const googleUrl = new URL("https://www.google.com/search");
  googleUrl.searchParams.set("q", searchQuery);
  googleUrl.searchParams.set("tbm", "isch");
  googleUrl.searchParams.set("ijn", "0");

  // 选择代理（轮询），无代理则直连
  let proxyUrl: string | undefined;
  if (proxies.length > 0) {
    proxyUrl = proxies[proxyIndex % proxies.length];
    proxyIndex++;
    console.log(
      `[image-search] Scraper using proxy #${((proxyIndex - 1) % proxies.length) + 1}: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`
    );
  }

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const { status, body: html } = await fetchWithOptionalProxy(
    googleUrl.toString(),
    headers,
    proxyUrl
  );

  // 429 = 被限流
  if (status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (status < 200 || status >= 300) {
    throw new Error(`SCRAPE_FAILED:${status}`);
  }

  // 检测 CAPTCHA / 异常流量拦截
  if (
    html.includes("detected unusual traffic") ||
    html.includes("/sorry/") ||
    html.includes("captcha")
  ) {
    throw new Error("RATE_LIMITED");
  }

  const results: ImageSearchResult[] = [];
  const seenUrls = new Set<string>();

  // ---- 策略 1: 从 AF_initDataCallback 数据中提取 ----
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

    const width = Math.max(d1, d2);
    const height = Math.min(d1, d2);

    results.push({
      url: rawUrl,
      thumbnail: rawUrl,
      title: "",
      width,
      height,
      contextUrl: "",
    });

    if (results.length >= 20) break;
  }

  // ---- 策略 2: 兜底 —— 从 <img> 标签 data-src 中提取 ----
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

  // 读取数据库配置
  const config = await getGoogleSearchConfig();
  const hasApiKeys = config.apiKeys.length > 0;

  try {
    let items: ImageSearchResult[];

    if (hasApiKeys) {
      // 优先走官方 API（多 Key 轮询）
      console.log(
        `[image-search] Using Google Custom Search API (${config.apiKeys.length} key(s), round-robin)`
      );
      items = await searchViaApi(q, config.apiKeys);
    } else {
      // 无 API Key，走爬虫（支持 SOCKS5 代理轮询）
      console.log(
        `[image-search] Using Google Images scraper` +
          (config.proxies.length > 0
            ? ` (${config.proxies.length} proxy/proxies)`
            : " (direct)")
      );
      items = await scrapeGoogleImages(q, config.proxies);
    }

    return Response.json({
      results: items,
      source: hasApiKeys ? "api" : "scraper",
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error("[image-search] Error:", message);

    if (message === "RATE_LIMITED") {
      return Response.json(
        {
          error: "rate_limited",
          message:
            "Google 图片搜索请求被限流，请稍后重试。如需更稳定的体验，可在「系统设置」中配置 Google API Key 或 SOCKS5 代理。",
        },
        { status: 429 }
      );
    }

    if (message.startsWith("SCRAPE_FAILED")) {
      return Response.json(
        {
          error: "scrape_failed",
          message: `Google 图片搜索页面访问失败 (${message})`,
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
