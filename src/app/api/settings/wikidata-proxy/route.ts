import { NextResponse } from "next/server";
import { queryOne, execute, RowDataPacket } from "@/server/db/mysql";
import { nowLocal } from "@/server/util/time";

export const runtime = "nodejs";

/**
 * Wikidata SOCKS5 代理配置
 *
 * enabled:  是否启用代理
 * proxies:  SOCKS5 代理地址列表，轮询使用
 *           格式: socks5://host:port 或 socks5://user:pass@host:port
 */
export type WikidataProxyConfig = {
  enabled: boolean;
  proxies: string[];
};

const CONFIG_KEY = "wikidata_proxy_config";

function normalizeConfig(raw: unknown): WikidataProxyConfig {
  if (!raw || typeof raw !== "object") return { enabled: false, proxies: [] };
  const obj = raw as Record<string, unknown>;
  return {
    enabled: !!obj.enabled,
    proxies: Array.isArray(obj.proxies)
      ? (obj.proxies as unknown[])
          .map((p) => (typeof p === "string" ? p.trim() : ""))
          .filter(Boolean)
      : [],
  };
}

/**
 * GET /api/settings/wikidata-proxy
 * 获取 Wikidata 代理配置
 */
export async function GET() {
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = ?",
      [CONFIG_KEY],
    );
    const config = normalizeConfig(row?.value ? JSON.parse(row.value) : null);
    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/settings/wikidata-proxy
 * 保存 Wikidata 代理配置
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const config: WikidataProxyConfig = {
      enabled: !!body.enabled,
      proxies: Array.isArray(body.proxies)
        ? body.proxies
            .map((p: unknown) => (typeof p === "string" ? p.trim() : ""))
            .filter(Boolean)
        : [],
    };

    const now = nowLocal();

    await execute(
      `INSERT INTO system_config(\`key\`, value, updated_at)
       VALUES(?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
      [CONFIG_KEY, JSON.stringify(config), now],
    );

    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
