import { NextResponse } from "next/server";
import { queryOne, execute, RowDataPacket } from "@/server/db/mysql";
import { nowLocal } from "@/server/util/time";

export const runtime = "nodejs";

export type GoogleSearchConfig = {
  apiKey: string;
  cx: string;
};

const CONFIG_KEY = "google_search_config";

/**
 * GET /api/settings/google-search
 * 获取 Google Custom Search 配置
 */
export async function GET() {
  try {
    const row = await queryOne<RowDataPacket>(
      "SELECT value FROM system_config WHERE `key` = ?",
      [CONFIG_KEY]
    );

    const config: GoogleSearchConfig = row?.value
      ? JSON.parse(row.value)
      : { apiKey: "", cx: "" };

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
 * 保存 Google Custom Search 配置
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const cx = typeof body.cx === "string" ? body.cx.trim() : "";

    const config: GoogleSearchConfig = { apiKey, cx };
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
