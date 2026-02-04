import { NextResponse } from "next/server";
import { query, queryOne, execute, RowDataPacket } from "@/server/db/mysql";
import { nowLocal } from "@/server/util/time";

export const runtime = "nodejs";

type OpenAlexKeysConfig = {
  keys: string[];
};

/**
 * GET /api/settings/openalex-keys
 * 获取 OpenAlex API Keys 配置
 */
export async function GET() {
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = 'openalex_api_keys'"
    );
    
    const config: OpenAlexKeysConfig = row?.value 
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
 * POST /api/settings/openalex-keys
 * 保存 OpenAlex API Keys 配置
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const keys = body.keys as string[];
    
    if (!Array.isArray(keys)) {
      return NextResponse.json(
        { ok: false, error: "keys 必须是数组" },
        { status: 400 }
      );
    }
    
    const cleanKeys = [...new Set(keys.filter(k => typeof k === "string" && k.trim().length > 0))];
    const config: OpenAlexKeysConfig = { keys: cleanKeys };
    const now = nowLocal();
    
    await execute(
      `INSERT INTO system_config(\`key\`, value, updated_at)
       VALUES('openalex_api_keys', ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
      [JSON.stringify(config), now]
    );
    
    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
