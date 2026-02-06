import { NextResponse } from "next/server";
import { queryOne, execute, RowDataPacket } from "@/server/db/mysql";
import { nowLocal } from "@/server/util/time";

export const runtime = "nodejs";

/**
 * Google 图片搜索配置（新版 — 多 Key + 多代理）
 *
 * apiKeys: 多组 API Key + CX，轮询使用
 * proxies: 多个 SOCKS5 代理地址，爬虫模式轮询使用
 *          格式: socks5://host:port 或 socks5://user:pass@host:port
 */
export type GoogleSearchConfig = {
  apiKeys: Array<{ apiKey: string; cx: string }>;
  proxies: string[];
};

const CONFIG_KEY = "google_search_config";

// 兼容旧格式 {apiKey, cx} -> 新格式 {apiKeys, proxies}
function normalizeConfig(raw: any): GoogleSearchConfig {
  if (!raw) return { apiKeys: [], proxies: [] };

  // 已经是新格式
  if (Array.isArray(raw.apiKeys)) {
    return {
      apiKeys: raw.apiKeys.filter(
        (k: any) => k && (k.apiKey || k.cx)
      ),
      proxies: Array.isArray(raw.proxies)
        ? raw.proxies.filter((p: string) => !!p)
        : [],
    };
  }

  // 旧格式：单个 apiKey + cx
  const apiKeys: GoogleSearchConfig["apiKeys"] = [];
  if (raw.apiKey || raw.cx) {
    apiKeys.push({ apiKey: raw.apiKey || "", cx: raw.cx || "" });
  }
  return { apiKeys, proxies: [] };
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

    const config: GoogleSearchConfig = { apiKeys, proxies };
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
