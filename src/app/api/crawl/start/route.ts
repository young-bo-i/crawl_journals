import { getCrawlManager } from "@/server/crawl/manager";
import type { CrawlParams } from "@/server/crawl/runner";
import { getLastStoppedRun, type SourceName, type FetchStatusType } from "@/server/db/repo";

export const runtime = "nodejs";

type StartRequest = {
  type?: "full" | "retry" | "continue";
  filter?: {
    sources?: SourceName[];
    statuses?: FetchStatusType[];
    journalIds?: string[];
  };
  concurrency?: number;
  maxPages?: number | null;
  serialMode?: boolean;
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

  const crawlType = body.type ?? "full";

  const params: CrawlParams = {
    type: crawlType,
    concurrency: body.concurrency,
    maxPages: body.maxPages,
    serialMode: body.serialMode,
  };

  if (crawlType === "retry" && body.filter) {
    params.filter = {
      sources: body.filter.sources,
      statuses: body.filter.statuses,
      journalIds: body.filter.journalIds,
    };
  }

  if (crawlType === "continue") {
    const lastRun = await getLastStoppedRun();
    if (!lastRun) {
      return Response.json(
        { error: "没有可以继续的任务记录" },
        { status: 400 },
      );
    }
    params.continueFromRun = lastRun;
  }

  const run = await manager.start(params);
  return Response.json({ run });
}
