import { NextResponse } from "next/server";
import { queryOne, execute, RowDataPacket } from "@/server/db/mysql";
import { nowLocal } from "@/server/util/time";

export const runtime = "nodejs";

/**
 * Google 图片搜索配置
 *
 * method: 搜索方式
 *   - "scraper_proxy" : 直接爬虫 + SOCKS5 代理（默认）
 *   - "google_api"    : Google Custom Search 官方 API
 *   - "scraper_api"   : ScraperAPI 第三方代理搜索
 *
 * apiKeys: Google Custom Search API Key + CX 组，轮询使用
 * proxies: SOCKS5 代理地址列表，爬虫模式轮询使用
 * scraperApiKeys: ScraperAPI 的 API Key 列表，轮询使用
 */
export type ImageSearchMethod = "scraper_proxy" | "google_api" | "scraper_api";

export type GoogleSearchConfig = {
  method: ImageSearchMethod;
  apiKeys: Array<{ apiKey: string; cx: string }>;
  proxies: string[];
  scraperApiKeys: string[];
};

const CONFIG_KEY = "google_search_config";

const VALID_METHODS: ImageSearchMethod[] = ["scraper_proxy", "google_api", "scraper_api"];

// 兼容旧格式 {apiKey, cx} -> 新格式
function normalizeConfig(raw: any): GoogleSearchConfig {
  const defaults: GoogleSearchConfig = {
    method: "scraper_proxy",
    apiKeys: [],
    proxies: [],
    scraperApiKeys: [],
  };

  if (!raw) return defaults;

  // 解析 method
  let method: ImageSearchMethod = "scraper_proxy";
  if (raw.method && VALID_METHODS.includes(raw.method)) {
    method = raw.method;
  } else if (Array.isArray(raw.apiKeys) && raw.apiKeys.length > 0) {
    // 旧配置兼容：有 apiKeys → 推断为 google_api
    method = "google_api";
  }

  // 解析各字段
  const apiKeys = Array.isArray(raw.apiKeys)
    ? raw.apiKeys.filter((k: any) => k && (k.apiKey || k.cx))
    : raw.apiKey && raw.cx
      ? [{ apiKey: raw.apiKey, cx: raw.cx }]
      : [];

  const proxies = Array.isArray(raw.proxies)
    ? raw.proxies.filter((p: string) => !!p)
    : [];

  const scraperApiKeys = Array.isArray(raw.scraperApiKeys)
    ? raw.scraperApiKeys.filter((k: string) => !!k)
    : [];

  return { method, apiKeys, proxies, scraperApiKeys };
}

/**
 * GET /api/settings/google-search
 * 获取 Google 图片搜索配置
 */
export async function GET() {
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = ?",
      [CONFIG_KEY]
    );

    const config = normalizeConfig(row?.value ? JSON.parse(row.value) : null);

    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/google-search
 * 保存 Google 图片搜索配置
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const method: ImageSearchMethod =
      body.method && VALID_METHODS.includes(body.method)
        ? body.method
        : "scraper_proxy";

    const apiKeys: GoogleSearchConfig["apiKeys"] = Array.isArray(body.apiKeys)
      ? body.apiKeys
          .map((k: any) => ({
            apiKey: typeof k.apiKey === "string" ? k.apiKey.trim() : "",
            cx: typeof k.cx === "string" ? k.cx.trim() : "",
          }))
          .filter((k: { apiKey: string; cx: string }) => k.apiKey || k.cx)
      : [];

    const proxies: string[] = Array.isArray(body.proxies)
      ? body.proxies
          .map((p: any) => (typeof p === "string" ? p.trim() : ""))
          .filter(Boolean)
      : [];

    const scraperApiKeys: string[] = Array.isArray(body.scraperApiKeys)
      ? body.scraperApiKeys
          .map((k: any) => (typeof k === "string" ? k.trim() : ""))
          .filter(Boolean)
      : [];

    const config: GoogleSearchConfig = { method, apiKeys, proxies, scraperApiKeys };
    const now = nowLocal();

    await execute(
      `INSERT INTO system_config(\`key\`, value, updated_at)
       VALUES(?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
      [CONFIG_KEY, JSON.stringify(config), now]
    );

    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
