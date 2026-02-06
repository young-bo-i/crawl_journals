import { queryOne, RowDataPacket } from "@/server/db/mysql";

export const runtime = "nodejs";

/**
 * Google 图片搜索 API
 *
 * 双模式：
 *   1. 如果在系统设置中配置了 Google Custom Search API Key → 走官方 API（更稳定）
 *   2. 未配置 → 走 Google Images 爬虫（零配置即可用，但可能被限流）
 */

export type ImageSearchResult = {
  url: string;
  thumbnail: string;
  title: string;
  width: number;
  height: number;
  contextUrl: string;
};

// ============================================================
// 从数据库读取 Google 搜索配置
// ============================================================

async function getGoogleSearchConfig(): Promise<{ apiKey: string; cx: string }> {
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = 'google_search_config'"
    );
    if (row?.value) {
      const config = JSON.parse(row.value);
      return {
        apiKey: config.apiKey || "",
        cx: config.cx || "",
      };
    }
  } catch (err) {
    console.error("[image-search] Failed to read config from DB:", err);
  }
  return { apiKey: "", cx: "" };
}

// ============================================================
// 方式一：Google Custom Search 官方 API（需要 API Key）
// ============================================================

async function searchViaApi(
  query: string,
  apiKey: string,
  cx: string
): Promise<ImageSearchResult[]> {
  const searchQuery = `${query} journal cover`;
  const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("cx", cx);
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
    console.error("[image-search] Google API error:", res.status, errText);
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
// 方式二：Google Images 爬虫（无需 API Key）
// ============================================================

// 需要过滤掉的 Google 自有域名
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
  query: string
): Promise<ImageSearchResult[]> {
  const searchQuery = `${query} journal cover`;
  const googleUrl = new URL("https://www.google.com/search");
  googleUrl.searchParams.set("q", searchQuery);
  googleUrl.searchParams.set("tbm", "isch");
  googleUrl.searchParams.set("ijn", "0");

  const res = await fetch(googleUrl.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  // 429 = 被限流
  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!res.ok) {
    throw new Error(`SCRAPE_FAILED:${res.status}`);
  }

  const html = await res.text();

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
  // Google 在 script 标签中嵌入图片数据，格式为嵌套数组:
  //   ["https://example.com/img.jpg", width, height]
  // 注意：有时顺序是 [url, height, width]，我们取较大值为 width
  const arrayPattern =
    /\["(https?:\/\/[^"]{20,})"[^,]*,\s*(\d+)\s*,\s*(\d+)\s*\]/g;

  let match: RegExpExecArray | null;
  while ((match = arrayPattern.exec(html)) !== null) {
    let [, rawUrl, dim1Str, dim2Str] = match;

    // 反转义 Unicode（Google 经常用 \u003d 等转义）
    rawUrl = rawUrl.replace(
      /\\u([0-9a-fA-F]{4})/g,
      (_, hex: string) => String.fromCharCode(parseInt(hex, 16))
    );
    // 反转义反斜杠
    rawUrl = rawUrl.replace(/\\(.)/g, "$1");

    // 过滤 Google 自有域名
    if (isGoogleDomain(rawUrl)) continue;
    // 过滤 data URI 和 SVG
    if (rawUrl.startsWith("data:") || rawUrl.endsWith(".svg")) continue;

    const d1 = parseInt(dim1Str);
    const d2 = parseInt(dim2Str);
    // 过滤过小的图片（图标/按钮等）
    if (d1 < 80 || d2 < 80) continue;

    // 去重
    if (seenUrls.has(rawUrl)) continue;
    seenUrls.add(rawUrl);

    // 取较大值为 width，较小值为 height（Google 格式不固定）
    const width = Math.max(d1, d2);
    const height = Math.min(d1, d2);

    results.push({
      url: rawUrl,
      thumbnail: rawUrl, // 爬虫模式下直接用原图
      title: "",
      width,
      height,
      contextUrl: "",
    });

    if (results.length >= 20) break;
  }

  // ---- 策略 2: 兜底 —— 从 <img> 标签 data-src 中提取 ----
  // 如果策略1没拿到足够结果，再从 img 标签中提取
  if (results.length < 5) {
    const imgPattern =
      /data-src="(https?:\/\/[^"]+)"/g;
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

  // 读取数据库配置，判断走哪条路径
  const { apiKey, cx } = await getGoogleSearchConfig();
  const useApi = !!(apiKey && cx);

  try {
    let items: ImageSearchResult[];

    if (useApi) {
      // 优先走官方 API
      console.log("[image-search] Using Google Custom Search API");
      items = await searchViaApi(q, apiKey, cx);
    } else {
      // 无 API Key，走爬虫
      console.log("[image-search] Using Google Images scraper (no API key configured)");
      items = await scrapeGoogleImages(q);
    }

    return Response.json({
      results: items,
      source: useApi ? "api" : "scraper",
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error("[image-search] Error:", message);

    // 爬虫被限流
    if (message === "RATE_LIMITED") {
      return Response.json(
        {
          error: "rate_limited",
          message:
            "Google 图片搜索请求被限流，请稍后重试。如需更稳定的体验，可在「系统设置」中配置 Google API Key。",
        },
        { status: 429 }
      );
    }

    // 爬虫请求失败
    if (message.startsWith("SCRAPE_FAILED")) {
      return Response.json(
        {
          error: "scrape_failed",
          message: `Google 图片搜索页面访问失败 (${message})`,
        },
        { status: 502 }
      );
    }

    // 通用错误
    return Response.json(
      { error: "search_failed", message: message || "图片搜索失败" },
      { status: 502 }
    );
  }
}
