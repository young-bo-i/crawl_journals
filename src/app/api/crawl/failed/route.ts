import { NextResponse } from "next/server";
import { getFailedFetchRecords, type SourceName } from "@/server/db/repo";

export const runtime = "nodejs";

/**
 * GET /api/crawl/failed
 * 获取失败的抓取记录列表
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") as SourceName | null;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));

    const result = await getFailedFetchRecords({
      source: source ?? undefined,
      page,
      pageSize,
    });

    return NextResponse.json({
      ok: true,
      total: result.total,
      page,
      pageSize,
      rows: result.rows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
