import {
  startBatchCover,
  stopBatchCover,
  getBatchCoverStatus,
} from "@/server/batch-cover/runner";

export const runtime = "nodejs";

/**
 * GET /api/batch-cover
 * 获取当前批量封面抓取任务的状态
 */
export async function GET() {
  const status = getBatchCoverStatus();
  return Response.json({ ok: true, status });
}

/**
 * POST /api/batch-cover
 * 启动后台批量封面抓取任务
 *
 * Body: { filters: Record<string, string> }
 * filters 是与 /api/journals 查询参数相同格式的筛选条件
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filters: Record<string, string> = body.filters ?? {};

    console.log("[batch-cover] POST /api/batch-cover, filters:", JSON.stringify(filters));

    const taskId = await startBatchCover(filters);

    return Response.json({ ok: true, taskId });
  } catch (err: any) {
    const message = err?.message ?? String(err);

    // 如果是"已有任务在运行"，返回 409 Conflict
    if (message.includes("已有批量任务在运行中")) {
      return Response.json({ ok: false, error: message }, { status: 409 });
    }

    console.error("[batch-cover] Failed to start:", err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/batch-cover
 * 停止当前批量封面抓取任务
 */
export async function DELETE() {
  const stopped = stopBatchCover();
  if (stopped) {
    return Response.json({ ok: true, message: "任务正在停止..." });
  }
  return Response.json(
    { ok: false, error: "没有正在运行的任务" },
    { status: 404 }
  );
}
