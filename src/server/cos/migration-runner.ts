/**
 * COS 封面迁移运行器
 *
 * 将 journal_covers 表中的 BLOB 数据批量上传到腾讯 COS，
 * 上传成功后再清空本地 BLOB，释放数据库空间。
 *
 * 支持：启动 / 停止 / 查询进度，后台异步执行，支持断点续传。
 */

import { execute, queryOne } from "@/server/db/mysql";
import { isCosConfigured, uploadCover } from "@/server/cos/client";
import type { RowDataPacket } from "mysql2";

// ============ 类型 ============

export type CosMigrationProgress = {
  taskId: string;
  status: "running" | "completed" | "stopped" | "error";
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
  freedBytes: number;
  currentJournalId: string;
  startedAt: string;
  error?: string;
};

type CosMigrationTask = {
  taskId: string;
  stopRequested: boolean;
  progress: CosMigrationProgress;
};

// ============ 全局单例任务 ============

let currentTask: CosMigrationTask | null = null;

const BATCH_SIZE = 100;
const CONCURRENCY = 5;

// ============ 公开 API ============

export function getCosMigrationStatus(): CosMigrationProgress | null {
  return currentTask?.progress ?? null;
}

export function stopCosMigration(): boolean {
  if (currentTask && currentTask.progress.status === "running") {
    currentTask.stopRequested = true;
    return true;
  }
  return false;
}

export async function startCosMigration(): Promise<string> {
  if (!isCosConfigured()) {
    throw new Error("COS 未配置，请检查环境变量 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION");
  }

  if (currentTask && currentTask.progress.status === "running") {
    throw new Error("已有迁移任务在运行中，请等待完成或先停止");
  }

  const taskId = `cos-migrate-${Date.now()}`;

  const task: CosMigrationTask = {
    taskId,
    stopRequested: false,
    progress: {
      taskId,
      status: "running",
      total: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      freedBytes: 0,
      currentJournalId: "",
      startedAt: new Date().toISOString(),
    },
  };

  currentTask = task;

  // 后台异步执行，不阻塞请求
  runMigration(task).catch((err) => {
    console.error("[COS Migration] Fatal error:", err);
    task.progress.status = "error";
    task.progress.error = err?.message ?? String(err);
  });

  return taskId;
}

// ============ 内部实现 ============

async function runMigration(task: CosMigrationTask) {
  const { progress } = task;

  try {
    // 统计待迁移总量
    const countRow = await queryOne<RowDataPacket>(
      "SELECT COUNT(*) AS cnt FROM journal_covers WHERE cos_key IS NULL AND image IS NOT NULL"
    );
    progress.total = Number(countRow?.cnt ?? 0);

    console.log(`[COS Migration] 开始迁移，待处理 ${progress.total} 条`);

    if (progress.total === 0) {
      progress.status = "completed";
      console.log("[COS Migration] 没有需要迁移的数据");
      return;
    }

    // 分批处理
    while (!task.stopRequested) {
      // 每批取一组待迁移的 ID
      const [rows] = await execute(
        `SELECT journal_id FROM journal_covers WHERE cos_key IS NULL AND image IS NOT NULL LIMIT ?`,
        [BATCH_SIZE]
      );
      const ids: string[] = (rows as RowDataPacket[]).map((r) => r.journal_id);

      if (ids.length === 0) break; // 全部迁移完成

      // 分组并发处理
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        if (task.stopRequested) break;

        const chunk = ids.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((id) => migrateOne(id, task)));
      }
    }

    // 最终状态
    if (task.stopRequested) {
      progress.status = "stopped";
      console.log(
        `[COS Migration] 用户停止，已迁移 ${progress.migrated}/${progress.total}，` +
        `失败 ${progress.failed}，释放 ${formatBytes(progress.freedBytes)}`
      );
    } else {
      progress.status = "completed";
      console.log(
        `[COS Migration] 迁移完成，成功 ${progress.migrated}/${progress.total}，` +
        `失败 ${progress.failed}，释放 ${formatBytes(progress.freedBytes)}`
      );
    }
  } catch (err: any) {
    progress.status = "error";
    progress.error = err?.message ?? String(err);
    console.error("[COS Migration] Error:", err);
  }
}

async function migrateOne(journalId: string, task: CosMigrationTask) {
  const { progress } = task;
  progress.currentJournalId = journalId;

  try {
    // 读取 BLOB 数据
    const row = await queryOne<RowDataPacket>(
      "SELECT image, image_type, image_name FROM journal_covers WHERE journal_id = ? AND cos_key IS NULL AND image IS NOT NULL",
      [journalId]
    );

    if (!row?.image) {
      progress.skipped++;
      return;
    }

    const imageBuffer: Buffer = row.image;
    const mimeType: string = row.image_type || "image/jpeg";
    const originalSize = imageBuffer.length;

    // 上传到 COS（内部自动转 WebP）
    const { cosKey, finalMimeType, finalFileName } = await uploadCover(
      journalId,
      imageBuffer,
      mimeType
    );

    // 上传成功 → 更新 cos_key，清空 BLOB
    await execute(
      "UPDATE journal_covers SET cos_key = ?, image = NULL, image_type = ?, image_name = ? WHERE journal_id = ?",
      [cosKey, finalMimeType, finalFileName, journalId]
    );

    progress.migrated++;
    progress.freedBytes += originalSize;

    // 定期打印日志
    if (progress.migrated % 50 === 0) {
      const elapsed = (Date.now() - new Date(progress.startedAt).getTime()) / 1000;
      const rate = (progress.migrated / elapsed).toFixed(1);
      console.log(
        `[COS Migration] ${progress.migrated}/${progress.total} ` +
        `(${((progress.migrated / progress.total) * 100).toFixed(1)}%) ` +
        `${rate}/s, 释放 ${formatBytes(progress.freedBytes)}`
      );
    }
  } catch (err: any) {
    progress.failed++;
    console.error(`[COS Migration] Failed ${journalId}: ${err?.message?.slice(0, 120)}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
