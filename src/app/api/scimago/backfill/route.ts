/**
 * SCImago 回填 API
 * POST /api/scimago/backfill
 *
 * 全量回填 journals.in_scimago 标志列
 * 用于首次添加列后的历史数据迁移，或数据修复
 */

import { NextResponse } from "next/server";
import { backfillInScimagoFlag } from "@/server/scimago/importer";

// 回填可能需要较长时间
export const maxDuration = 300; // 5 分钟

export async function POST() {
  try {
    console.log("[SCImago Backfill API] 开始全量回填 in_scimago 标志");
    
    const result = await backfillInScimagoFlag((progress) => {
      if (progress.current % 5000 === 0) {
        console.log(
          `[SCImago Backfill API] 进度: ${progress.current}/${progress.total} (匹配 ${progress.matched})`
        );
      }
    });

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
