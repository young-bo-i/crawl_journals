import { NextResponse } from "next/server";
import { queryOne, execute, RowDataPacket } from "@/server/db/mysql";
import { nowLocal } from "@/server/util/time";

export const runtime = "nodejs";

export type NlmKeysConfig = {
  keys: Array<{ apiKey: string; email: string }>;
};

const CONFIG_KEY = "nlm_api_keys";

/**
 * GET /api/settings/nlm-keys
 * 获取 NLM (NCBI) API Keys 配置
 */
export async function GET() {
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = ?",
      [CONFIG_KEY]
    );

    const config: NlmKeysConfig = row?.value
      ? JSON.parse(row.value)
      : { keys: [] };

    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/nlm-keys
 * 保存 NLM (NCBI) API Keys 配置
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const keys: NlmKeysConfig["keys"] = Array.isArray(body.keys)
      ? body.keys
          .map((k: any) => ({
            apiKey: typeof k.apiKey === "string" ? k.apiKey.trim() : "",
            email: typeof k.email === "string" ? k.email.trim() : "",
          }))
          .filter((k: { apiKey: string; email: string }) => k.apiKey)
      : [];

    const config: NlmKeysConfig = { keys };
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
