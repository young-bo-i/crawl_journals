import { getCrawlManager } from "@/server/crawl/manager";
import { getLastStoppedRun, getResumableRun, getPendingJournalCount, getCurrentVersion, getLatestRun } from "@/server/db/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const manager = getCrawlManager();
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  
  // 确保已初始化（恢复遗留任务）
  await manager.ensureInitialized();
  
  // 获取版本和 pending 数量
  const version = await getCurrentVersion();
  const pendingCount = version ? await getPendingJournalCount(version) : 0;
  
  // 如果请求特定 runId，直接返回该任务
  if (runId) {
    const run = await manager.status(runId);
    if (run) {
      const canContinue = run.status === "stopped" || run.status === "failed";
      return Response.json({ 
        run,
        producerStatus: run.producer_status,
        consumerStatus: run.consumer_status,
        producerError: run.producer_error,
        collectedCount: run.collected_count,
        pendingCount,
        canContinue,
        canResume: false,
      });
    }
  }
  
  // 检查是否有正在运行的任务
  const activeRunId = manager.getActiveRunId();
  if (activeRunId) {
    const activeRun = await manager.status(activeRunId);
    if (activeRun) {
      return Response.json({ 
        run: activeRun,
        producerStatus: activeRun.producer_status,
        consumerStatus: activeRun.consumer_status,
        producerError: activeRun.producer_error,
        collectedCount: activeRun.collected_count,
        pendingCount,
        canContinue: false,
        canResume: false,
      });
    }
  }
  
  // 没有活动任务，获取最近的任务（包括已停止的）
  const latestRun = await getLatestRun();
  
  console.log(`[/api/crawl/status] latestRun:`, latestRun ? {
    id: latestRun.id,
    status: latestRun.status,
    phase: latestRun.phase,
    producer_status: latestRun.producer_status,
  } : null);
  
  const canContinue = latestRun ? (latestRun.status === "stopped" || latestRun.status === "failed") : false;
  const canResume = latestRun ? latestRun.producer_status === "paused" : false;
  
  return Response.json({ 
    // 直接返回最近的任务作为 run，不论状态
    run: latestRun,
    producerStatus: latestRun?.producer_status ?? null,
    consumerStatus: latestRun?.consumer_status ?? null,
    producerError: latestRun?.producer_error ?? null,
    collectedCount: latestRun?.collected_count ?? 0,
    pendingCount,
    canContinue,
    canResume,
  });
}
