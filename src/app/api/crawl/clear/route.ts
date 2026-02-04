import { getCrawlManager } from "@/server/crawl/manager";
import { clearAllData } from "@/server/db/repo";

export const runtime = "nodejs";

export async function POST() {
  const manager = getCrawlManager();

  // 检查是否有运行中的任务
  if (manager.hasActiveRun()) {
    return Response.json(
      { error: "有正在运行的抓取任务，请先停止任务再清空数据", activeRunId: manager.getActiveRunId() },
      { status: 409 },
    );
  }

  try {
    await clearAllData();
    return Response.json({ success: true, message: "已清空所有期刊数据" });
  } catch (err: any) {
    return Response.json(
      { error: `清空数据失败: ${err?.message ?? String(err)}` },
      { status: 500 },
    );
  }
}
