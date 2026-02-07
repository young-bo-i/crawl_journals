/**
 * 封面图片迁移 API
 * POST /api/journals/migrate-covers
 *
 * 批量将 journals 表中的封面 BLOB 迁移到 journal_covers 表。
 * 支持断点续传：先清理上次中断的残留，再继续迁移剩余的。
 */

import { NextResponse } from "next/server";
import { migrateCoverImages } from "@/server/db/repo";

// 迁移可能需要较长时间
export const maxDuration = 300; // 5 分钟

export async function POST() {
  try {
    console.log("[Cover Migration API] 开始迁移封面数据...");

    const migrated = await migrateCoverImages((count) => {
      if (count % 500 === 0) {
        console.log(`[Cover Migration API] 已迁移 ${count} 条`);
      }
    });

    console.log(`[Cover Migration API] 完成: 共迁移 ${migrated} 条`);

    return NextResponse.json({
      success: true,
      migrated,
    });
  } catch (e: any) {
    console.error("[Cover Migration API] 迁移失败:", e);
    return NextResponse.json(
      { error: e.message ?? "迁移失败" },
      { status: 500 }
    );
  }
}
