/**
 * SCImago 回填 API
 * POST /api/scimago/backfill
 *
 * 全量回填 journal_scimago_cache 缓存表
 * 用于首次部署后的数据初始化，或数据修复
 */

import { NextResponse } from "next/server";
import { backfillInScimagoFlag } from "@/server/scimago/importer";

export async function POST() {
  try {
    console.log("[SCImago Backfill API] 开始全量回填缓存表");
    
    const result = await backfillInScimagoFlag();

    return NextResponse.json({
      success: true,
      total: result.total,
      matched: result.matched,
    });
  } catch (e: any) {
    console.error("[SCImago Backfill API] 回填失败:", e);
    return NextResponse.json(
      { error: e.message ?? "回填失败" },
      { status: 500 }
    );
  }
}
