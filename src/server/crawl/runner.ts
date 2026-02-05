import {
  type CrawlPhase,
  type CrawlRunRow,
  type FetchFilter,
  getCurrentVersion,
  getRun,
  updateRun,
  updateConsumerStatus,
  updateProducerStatus,
} from "@/server/db/repo";
import { collectJournals, type CollectEvent, type CollectParams, type CollectResult } from "./issn-collector";
import { fetchDetails, type FetchEvent, type FetchParams, type FetchResult } from "./detail-fetcher";
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
  // 轮询间隔（毫秒）
  pollIntervalMs?: number;
};

export type CrawlEvent =
  | CollectEvent
  | FetchEvent
  | { type: "phase_change"; phase: CrawlPhase; at: number }
  | { type: "pipeline_status"; producerStatus: string; consumerStatus: string; at: number }
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

  const emitPipelineStatus = (producerStatus: string, consumerStatus: string) => {
    args.emit({ type: "pipeline_status", producerStatus, consumerStatus, at: nowTimestamp() });
  };

  try {
    if (args.params.type === "full") {
      // 全量模式：生产者和消费者并行执行（流水线模式）
      emitPhase("collecting");
      await updateRun(args.runId, { phase: "collecting" });

      // 生产者 Promise（OpenAlex 收集）
      const producerPromise = collectJournals({
        runId: args.runId,
        params: {
          startCursor: args.params.startCursor,
          maxPages: args.params.maxPages,
          qps: args.params.collectQps,
        },
        signal: args.signal,
        emit: args.emit,
      });

      // 等待生产者开始产生数据（延迟启动消费者）
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取版本号
      const version = await getCurrentVersion();

      // 消费者 Promise（其他数据源抓取，流水线模式）
      const consumerPromise = fetchDetails({
        runId: args.runId,
        params: {
          concurrency: args.params.concurrency,
          qps: args.params.qps,
          filter: { statuses: ["pending"] },
          version: version ?? undefined,
          serialMode: args.params.serialMode,
          pipelineMode: true, // 启用流水线模式
          pollIntervalMs: args.params.pollIntervalMs,
        },
        signal: args.signal,
        emit: args.emit,
      });

      // 并行执行生产者和消费者
      const [producerResult, consumerResult] = await Promise.allSettled([
        producerPromise,
        consumerPromise,
      ]);

      // 分析结果
      const producerOk = producerResult.status === "fulfilled";
      const consumerOk = consumerResult.status === "fulfilled";

      let finalStatus: "completed" | "failed" | null = "completed";
      let finalPhase: CrawlPhase = "completed";
      let keepRunning = false; // 是否保持 running 状态（生产者暂停等待恢复）

      if (shouldStop()) {
        // 被手动停止，状态已由 manager.stop() 更新为 "stopped"
        // 只发送 run_done 事件，不再更新数据库状态
        console.log(`[runCrawl] 任务被手动停止`);
        args.emit({ type: "run_done", at: nowTimestamp() });
        return;
      } else if (!producerOk || !consumerOk) {
        // 检查是否是生产者暂停（不是真正的失败）
        if (producerOk) {
          const pResult = producerResult.value as CollectResult;
          if (pResult.status === "paused") {
            // 生产者暂停，但消费者可能已经处理完所有数据
            if (consumerOk) {
              const cResult = consumerResult.value as FetchResult;
              if (cResult.status === "completed") {
                // 消费者完成，任务暂停等待恢复
                keepRunning = true;
                finalStatus = null; // 不更新 status
                finalPhase = "fetching";
                emitPipelineStatus("paused", "completed");
              }
            }
          }
        }
        
        if (!keepRunning && finalStatus === "completed") {
          finalStatus = "failed";
          finalPhase = "failed";
        }
      }

      // 更新最终状态
      if (!keepRunning && finalStatus) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        args.emit({ type: "run_done", at: nowTimestamp() });
        
        await updateRun(args.runId, {
          status: finalStatus,
          phase: finalPhase,
          ended_at: finalStatus === "completed" ? nowLocal() : null,
          last_error: !producerOk 
            ? (producerResult as PromiseRejectedResult).reason?.message 
            : !consumerOk 
              ? (consumerResult as PromiseRejectedResult).reason?.message 
              : null,
        });

        console.log(`[runCrawl] ${finalStatus}，耗时 ${elapsed}s`);
      } else if (keepRunning) {
        // 保持 running 状态，只更新 phase
        await updateRun(args.runId, { phase: finalPhase });
        console.log(`[runCrawl] 生产者暂停，消费者已完成，等待恢复`);
      }

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

      // 检查生产者状态
      const producerNeedsResume = prevRun.producer_status === "paused";
      
      if (producerNeedsResume) {
        // 需要恢复生产者
        const startCursor = prevRun.openalex_cursor ?? "*";
        const existingTotalJournals = prevRun.collected_count ?? prevRun.total_journals ?? 0;
        // 计算已完成的页数（每页 200 个期刊）
        const existingPages = Math.ceil(existingTotalJournals / 200);
        
        console.log(`[runCrawl] 恢复生产者: cursor=${startCursor}, existingPages=${existingPages}, existingTotalJournals=${existingTotalJournals}, maxPages=${args.params.maxPages}`);

        emitPhase("collecting");
        await updateRun(args.runId, { phase: "collecting" });
        await updateProducerStatus(args.runId, "running");

        // 生产者 Promise
        const producerPromise = collectJournals({
          runId: args.runId,
          params: {
            startCursor,
            maxPages: args.params.maxPages,
            qps: args.params.collectQps,
            existingVersion: version,
            existingTotalJournals,
            existingPages,
          },
          signal: args.signal,
          emit: args.emit,
        });

        // 消费者 Promise（流水线模式）
        const consumerPromise = fetchDetails({
          runId: args.runId,
          params: {
            concurrency: args.params.concurrency,
            qps: args.params.qps,
            filter: { statuses: ["pending"] },
            version,
            serialMode: args.params.serialMode,
            pipelineMode: true,
            pollIntervalMs: args.params.pollIntervalMs,
          },
          signal: args.signal,
          emit: args.emit,
        });

        // 并行执行
        await Promise.allSettled([producerPromise, consumerPromise]);

      } else {
        // 只需要恢复消费者
        emitPhase("fetching");
        await updateRun(args.runId, { phase: "fetching", total_journals: prevRun.total_journals });
        await updateConsumerStatus(args.runId, "running");

        await fetchDetails({
          runId: args.runId,
          params: {
            concurrency: args.params.concurrency,
            qps: args.params.qps,
            filter: { statuses: ["pending"] },
            version,
            serialMode: args.params.serialMode,
            pipelineMode: false, // 非流水线模式，一次性处理
          },
          signal: args.signal,
          emit: args.emit,
        });
      }

      // 检查最终状态
      const finalRun = await getRun(args.runId);
      const producerDone = finalRun?.producer_status === "completed";
      const consumerDone = finalRun?.consumer_status === "completed";

      if (shouldStop()) {
        // 被手动停止，状态已由 manager.stop() 更新，只发送事件
        console.log(`[runCrawl] 继续任务被手动停止`);
        args.emit({ type: "run_done", at: nowTimestamp() });
        return;
      } else if (producerDone && consumerDone) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        args.emit({ type: "run_done", at: nowTimestamp() });
        
        await updateRun(args.runId, {
          status: "completed",
          phase: "completed",
          ended_at: nowLocal(),
        });

        console.log(`[runCrawl] 完成，耗时 ${elapsed}s`);
      }

    } else {
      // 重试模式（不使用流水线）
      emitPhase("fetching");
      await updateRun(args.runId, { phase: "fetching" });
      await updateProducerStatus(args.runId, "completed"); // 重试模式无需生产者
      await updateConsumerStatus(args.runId, "running");

      await fetchDetails({
        runId: args.runId,
        params: {
          concurrency: args.params.concurrency,
          qps: args.params.qps,
          filter: args.params.filter,
          serialMode: args.params.serialMode,
          pipelineMode: false,
        },
        signal: args.signal,
        emit: args.emit,
      });

      const elapsed = Math.round((Date.now() - start) / 1000);
      
      if (shouldStop()) {
        // 被手动停止，状态已由 manager.stop() 更新，只发送事件
        console.log(`[runCrawl] 重试任务被手动停止`);
        args.emit({ type: "run_done", at: nowTimestamp() });
        return;
      }
      
      args.emit({ type: "run_done", at: nowTimestamp() });
      
      await updateRun(args.runId, {
        status: "completed",
        phase: "completed",
        ended_at: nowLocal(),
      });

      console.log(`[runCrawl] 完成，耗时 ${elapsed}s`);
    }
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
