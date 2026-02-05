/**
 * SCImago 数据统计 API
 * GET /api/scimago/stats
 * 
 * 返回已导入的年份和记录数统计
 */

import { NextResponse } from "next/server";
import { getScimagoStats, getScimagoTotalCount } from "@/server/scimago/importer";

export async function GET() {
  try {
    const [yearStats, totalCount] = await Promise.all([
      getScimagoStats(),
      getScimagoTotalCount(),
    ]);
    
    return NextResponse.json({
      success: true,
      totalCount,
      years: yearStats,
    });
  } catch (e: any) {
    console.error("[SCImago Stats] 获取统计失败:", e);
    return NextResponse.json(
      { error: e.message ?? "获取统计失败" },
      { status: 500 }
    );
  }
}
