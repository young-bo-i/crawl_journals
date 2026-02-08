/**
 * 封面图片 COS 迁移 API
 *
 * POST   /api/journals/migrate-covers  — 启动迁移任务
 * GET    /api/journals/migrate-covers  — 查询迁移进度
 * DELETE /api/journals/migrate-covers  — 停止迁移任务
 *
 * 将 journal_covers 表中的 BLOB 数据批量上传到腾讯 COS，
 * 上传成功后清空本地 BLOB，释放数据库空间。
 * 支持断点续传：中断后再次 POST 即可继续未完成的部分。
 */

import {
  startCosMigration,
  stopCosMigration,
  getCosMigrationStatus,
} from "@/server/cos/migration-runner";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟

/**
 * GET — 查询迁移进度
 */
export async function GET() {
  const status = getCosMigrationStatus();
  if (!status) {
    return Response.json({ ok: true, status: null, message: "没有迁移任务" });
  }
  return Response.json({ ok: true, status });
}

/**
 * POST — 启动迁移任务
 */
export async function POST() {
  try {
    const taskId = await startCosMigration();
    return Response.json({ ok: true, taskId, message: "迁移任务已启动" });
  } catch (err: any) {
    const message = err?.message ?? String(err);

    // 已有任务在运行 → 409
    if (message.includes("已有迁移任务在运行中")) {
      return Response.json({ ok: false, error: message }, { status: 409 });
    }

    // COS 未配置 → 400
    if (message.includes("COS 未配置")) {
      return Response.json({ ok: false, error: message }, { status: 400 });
    }

    console.error("[COS Migration API] Failed to start:", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE — 停止迁移任务
 */
export async function DELETE() {
  const stopped = stopCosMigration();
  if (stopped) {
    return Response.json({ ok: true, message: "迁移任务正在停止..." });
  }
  return Response.json(
    { ok: false, error: "没有正在运行的迁移任务" },
    { status: 404 }
  );
}
