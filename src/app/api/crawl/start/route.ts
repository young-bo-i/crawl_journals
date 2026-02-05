import { getCrawlManager } from "@/server/crawl/manager";
import type { CrawlParams } from "@/server/crawl/runner";
import { getLastStoppedRun, getResumableRun, type SourceName, type FetchStatusType } from "@/server/db/repo";

export const runtime = "nodejs";

type StartRequest = {
  type?: "full" | "retry" | "continue" | "resume";
  filter?: {
    sources?: SourceName[];
    statuses?: FetchStatusType[];
    journalIds?: string[];
  };
  concurrency?: number;
  maxPages?: number | null;
  serialMode?: boolean;
  /** 轮询间隔（毫秒） */
  pollIntervalMs?: number;
};

export async function POST(req: Request) {
  const manager = getCrawlManager();

  if (manager.hasActiveRun()) {
    return Response.json(
      { error: "已有正在运行的抓取任务", activeRunId: manager.getActiveRunId() },
      { status: 409 },
    );
  }

  let body: StartRequest = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let crawlType = body.type ?? "full";

  // 检查是否有可恢复的任务（生产者暂停）
  if (crawlType === "resume") {
    const resumableRun = await getResumableRun();
    if (!resumableRun) {
      return Response.json(
        { error: "没有可恢复的任务（没有生产者暂停的任务）" },
        { status: 400 },
      );
    }
    // 转换为 continue 模式
    crawlType = "continue";
    body.type = "continue";
  }

  const params: CrawlParams = {
    type: crawlType as "full" | "retry" | "continue",
    concurrency: body.concurrency,
    maxPages: body.maxPages,
    serialMode: body.serialMode,
    pollIntervalMs: body.pollIntervalMs,
  };

  if (crawlType === "retry" && body.filter) {
    params.filter = {
      sources: body.filter.sources,
      statuses: body.filter.statuses,
      journalIds: body.filter.journalIds,
    };
  }

  if (crawlType === "continue") {
    // 优先检查可恢复的任务（生产者暂停）
    let targetRun = await getResumableRun();
    if (!targetRun) {
      // 否则检查已停止的任务
      targetRun = await getLastStoppedRun();
    }
    
    if (!targetRun) {
      return Response.json(
        { error: "没有可以继续的任务记录" },
        { status: 400 },
      );
    }
    params.continueFromRun = targetRun;
    
    // 从上次任务中恢复 maxPages 参数（如果当前请求没有指定）
    if (params.maxPages === undefined && targetRun.params_json) {
      try {
        const prevParams = typeof targetRun.params_json === "string" 
          ? JSON.parse(targetRun.params_json) 
          : targetRun.params_json;
        if (prevParams.maxPages !== undefined) {
          params.maxPages = prevParams.maxPages;
          console.log(`[/api/crawl/start] 从上次任务恢复 maxPages=${params.maxPages}`);
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  const run = await manager.start(params);
  return Response.json({ run });
}
