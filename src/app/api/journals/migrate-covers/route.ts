/**
 * 封面图片迁移 API
 * POST /api/journals/migrate-covers
 *
 * 将 journals 表中的封面 BLOB 迁移到 journal_covers 表，
 * 然后分批清空旧 BLOB 释放空间。
 */

import { NextResponse } from "next/server";
import { migrateCoverImages, cleanupOldCoverBlobs } from "@/server/db/repo";

// 迁移可能需要较长时间
export const maxDuration = 300; // 5 分钟

export async function POST() {
  try {
    // 1. 迁移数据到 journal_covers 表
    console.log("[Cover Migration API] 开始迁移封面数据...");
    const migrated = await migrateCoverImages();

    // 2. 分批清空旧 BLOB（每批 100 行，避免长时间锁表）
    console.log("[Cover Migration API] 开始清理旧 BLOB 数据...");
    let totalCleaned = 0;
    let batch: number;
    do {
      batch = await cleanupOldCoverBlobs(100);
      totalCleaned += batch;
      if (totalCleaned % 1000 === 0 && totalCleaned > 0) {
        console.log(`[Cover Migration API] 已清理 ${totalCleaned} 条旧 BLOB`);
      }
    } while (batch > 0);

    console.log(
      `[Cover Migration API] 完成: 迁移 ${migrated} 条, 清理 ${totalCleaned} 条旧 BLOB`
    );

    return NextResponse.json({
      success: true,
      migrated,
      cleaned: totalCleaned,
    });
  } catch (e: any) {
    console.error("[Cover Migration API] 迁移失败:", e);
    return NextResponse.json(
      { error: e.message ?? "迁移失败" },
      { status: 500 }
    );
  }
}
