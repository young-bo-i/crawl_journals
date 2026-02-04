import { getCrawlManager } from "@/server/crawl/manager";
import { getLastStoppedRun } from "@/server/db/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const manager = getCrawlManager();
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  
  // 如果请求特定 runId
  if (runId) {
    const run = await manager.status(runId);
    return Response.json({ run });
  }
  
  // 没有 runId 时，确保已初始化（恢复遗留任务），然后返回最近可续传的记录
  console.log("[status API] 开始初始化检查...");
  await manager.ensureInitialized();
  console.log("[status API] 初始化完成");
  
  const lastStoppedRun = await getLastStoppedRun();
  
  return Response.json({ 
    run: null,
    canContinue: Boolean(lastStoppedRun),
    lastStoppedRun,
  });
}
