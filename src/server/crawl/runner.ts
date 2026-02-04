import {
  type CrawlPhase,
  type CrawlRunRow,
  type FetchFilter,
  getCurrentVersion,
  updateRun,
} from "@/server/db/repo";
import { collectJournals, type CollectEvent, type CollectParams } from "./issn-collector";
import { fetchDetails, type FetchEvent, type FetchParams } from "./detail-fetcher";
import { nowLocal, nowTimestamp } from "@/server/util/time";

export type CrawlParams = {
  type: "full" | "retry" | "continue";
  // 阶段一参数（仅 full 模式）
  startCursor?: string;
  maxPages?: number | null;
  collectQps?: number;
  // 阶段二参数
  concurrency?: number;
  qps?: FetchParams["qps"];
  // 重试模式的过滤条件
  filter?: FetchFilter;
  // 断点续传模式：上次的运行记录
  continueFromRun?: CrawlRunRow;
  // 串行模式
  serialMode?: boolean;
};

export type CrawlEvent =
  | CollectEvent
  | FetchEvent
  | { type: "phase_change"; phase: CrawlPhase; at: number }
  | { type: "run_done"; at: number };

export async function runCrawl(args: {
  runId: string;
  params: CrawlParams;
  signal: AbortSignal;
  emit: (e: CrawlEvent) => void;
}) {
  const start = Date.now();
  const shouldStop = () => args.signal.aborted;

  const emitPhase = (phase: CrawlPhase) => {
    args.emit({ type: "phase_change", phase, at: nowTimestamp() });
  };

  try {
    if (args.params.type === "full") {
      // 全量模式：先收集期刊，再抓取详情

      // 阶段一：收集期刊
      emitPhase("collecting");
      await updateRun(args.runId, { phase: "collecting" });

      const collectResult = await collectJournals({
        runId: args.runId,
        params: {
          startCursor: args.params.startCursor,
          maxPages: args.params.maxPages,
          qps: args.params.collectQps,
        },
        signal: args.signal,
        emit: args.emit,
      });

      if (shouldStop()) {
        await updateRun(args.runId, {
          status: "stopped",
          phase: "stopped",
          ended_at: nowLocal(),
        });
        return;
      }

      // 阶段二：抓取详情
      emitPhase("fetching");
      await updateRun(args.runId, { phase: "fetching", total_journals: collectResult.totalJournals });

      await fetchDetails({
        runId: args.runId,
        params: {
          concurrency: args.params.concurrency,
          qps: args.params.qps,
          filter: { statuses: ["pending"] },
          version: collectResult.version,
          serialMode: args.params.serialMode,
        },
        signal: args.signal,
        emit: args.emit,
      });
    } else if (args.params.type === "continue") {
      // 断点续传模式
      const prevRun = args.params.continueFromRun;
      if (!prevRun) {
        throw new Error("断点续传模式需要提供上次的运行记录");
      }

      const version = await getCurrentVersion();
      if (!version) {
        throw new Error("无法获取版本号，可能上次运行未正常初始化");
      }

      if (prevRun.phase === "collecting") {
        // 从收集阶段继续
        const startCursor = prevRun.openalex_cursor ?? "*";
        const existingTotalJournals = prevRun.total_journals ?? 0;

        emitPhase("collecting");
        await updateRun(args.runId, { phase: "collecting" });

        const collectResult = await collectJournals({
          runId: args.runId,
          params: {
            startCursor,
            maxPages: args.params.maxPages,
            qps: args.params.collectQps,
            existingVersion: version,
            existingTotalJournals,
          },
          signal: args.signal,
          emit: args.emit,
        });

        if (shouldStop()) {
          await updateRun(args.runId, {
            status: "stopped",
            phase: "stopped",
            ended_at: nowLocal(),
          });
          return;
        }

        emitPhase("fetching");
        await updateRun(args.runId, { phase: "fetching", total_journals: collectResult.totalJournals });

        await fetchDetails({
          runId: args.runId,
          params: {
            concurrency: args.params.concurrency,
            qps: args.params.qps,
            filter: { statuses: ["pending"] },
            version: collectResult.version,
            serialMode: args.params.serialMode,
          },
          signal: args.signal,
          emit: args.emit,
        });
      } else {
        // 从抓取阶段继续
        emitPhase("fetching");
        await updateRun(args.runId, { phase: "fetching", total_journals: prevRun.total_journals });

        await fetchDetails({
          runId: args.runId,
          params: {
            concurrency: args.params.concurrency,
            qps: args.params.qps,
            filter: { statuses: ["pending"] },
            version,
            serialMode: args.params.serialMode,
          },
          signal: args.signal,
          emit: args.emit,
        });
      }
    } else {
      // 重试模式
      emitPhase("fetching");
      await updateRun(args.runId, { phase: "fetching" });

      await fetchDetails({
        runId: args.runId,
        params: {
          concurrency: args.params.concurrency,
          qps: args.params.qps,
          filter: args.params.filter,
          serialMode: args.params.serialMode,
        },
        signal: args.signal,
        emit: args.emit,
      });
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    args.emit({ type: "run_done", at: nowTimestamp() });
    
    await updateRun(args.runId, {
      status: shouldStop() ? "stopped" : "completed",
      phase: shouldStop() ? "stopped" : "completed",
      ended_at: nowLocal(),
    });

    console.log(`[runCrawl] 完成，耗时 ${elapsed}s`);
  } catch (err: any) {
    console.error(`[runCrawl] 失败：${err?.message ?? String(err)}`);
    await updateRun(args.runId, {
      status: "failed",
      phase: "failed",
      ended_at: nowLocal(),
      last_error: err?.message ?? String(err),
    });
  }
}
