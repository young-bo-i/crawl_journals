import { EventEmitter } from "node:events";
import type { CrawlParams, CrawlEvent } from "./runner";
import { runCrawl } from "./runner";
import { createRun, getRun, updateRun, recoverStaleRunningRuns, clearAllData, type CrawlPhase } from "@/server/db/repo";
import { nowLocal } from "@/server/util/time";
import { broadcastCrawlEvent } from "@/server/ws/manager";

type RunState = {
  runId: string;
  controller: AbortController;
  emitter: EventEmitter;
};

const globalForManager = globalThis as unknown as { crawlManager?: CrawlManager };

export class CrawlManager {
  private runs = new Map<string, RunState>();
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化管理器：恢复服务重启后遗留的 running 状态任务
   */
  private async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = (async () => {
      try {
        console.log(`[CrawlManager] 开始初始化，检查遗留的 running 状态任务...`);
        const recovered = await recoverStaleRunningRuns();
        if (recovered > 0) {
          console.log(`[CrawlManager] 恢复了 ${recovered} 个遗留的 running 状态任务，已标记为 stopped`);
        } else {
          console.log(`[CrawlManager] 没有发现遗留的 running 状态任务`);
        }
      } catch (err) {
        console.error(`[CrawlManager] 恢复遗留任务时出错：${err}`);
      }
    })();
    
    return this.initPromise;
  }

  async start(params: CrawlParams) {
    console.log(`[CrawlManager.start] 开始启动任务, type=${params.type}`);
    await this.initialize();
    
    const runType = params.type === "full" ? "full" : "incremental";
    const initialPhase: CrawlPhase = params.type === "full" ? "collecting" : "fetching";
    
    // 全量模式：先清空所有旧数据（包括旧任务记录），再创建新任务
    if (params.type === "full") {
      console.log(`[CrawlManager.start] 全量模式，清空旧数据...`);
      await clearAllData();
    }
    
    console.log(`[CrawlManager.start] 调用 createRun, runType=${runType}`);
    const run = await createRun(params, runType);
    console.log(`[CrawlManager.start] createRun 返回: id=${run?.id}, status=${run?.status}`);
    const controller = new AbortController();
    const emitter = new EventEmitter();
    const state: RunState = { runId: run.id, controller, emitter };
    this.runs.set(run.id, state);

    // 创建 emit 函数，同时发送到 EventEmitter 和 WebSocket
    const emit = (e: CrawlEvent) => {
      emitter.emit("event", e);
      // 同时通过 WebSocket 广播
      broadcastCrawlEvent(run.id, e);
    };

    // 广播任务开始事件
    this.broadcastRunState(run.id, run);

    runCrawl({
      runId: run.id,
      params,
      signal: controller.signal,
      emit,
    }).finally(async () => {
      this.runs.delete(run.id);
      emitter.emit("end");
      emitter.removeAllListeners();
      // 广播任务结束
      const finalRun = await getRun(run.id);
      if (finalRun) {
        this.broadcastRunState(run.id, finalRun);
      }
    });

    return run;
  }

  async stop(runId: string) {
    const state = this.runs.get(runId);
    if (state) state.controller.abort();
    
    // 获取当前任务状态
    const currentRun = await getRun(runId);
    
    // 如果生产者还在运行（未完成），标记为暂停
    const producerStatus = currentRun?.producer_status;
    const shouldPauseProducer = producerStatus === "running";
    
    await updateRun(runId, { 
      status: "stopped", 
      phase: "stopped", 
      ended_at: nowLocal(),
      // 如果生产者正在运行，标记为暂停以便后续恢复
      ...(shouldPauseProducer ? { producer_status: "paused" } : {}),
    });
    
    console.log(`[CrawlManager.stop] 任务已停止, runId=${runId}, producerStatus=${producerStatus} -> ${shouldPauseProducer ? "paused" : producerStatus}`);
    
    // 广播状态变化
    const run = await getRun(runId);
    if (run) {
      this.broadcastRunState(runId, run);
    }
  }

  /**
   * 通过 WebSocket 广播任务状态
   */
  private broadcastRunState(runId: string, run: any) {
    broadcastCrawlEvent(runId, {
      type: "run_state",
      run,
      at: Date.now(),
    } as any);
  }

  getEmitter(runId: string) {
    return this.runs.get(runId)?.emitter ?? null;
  }

  async ensureInitialized() {
    await this.initialize();
  }

  async status(runId: string) {
    const run = await getRun(runId);
    if (!run) {
      console.log(`[CrawlManager.status] Run not found in DB for id=${runId}`);
    }
    return run;
  }

  isRunning(runId: string) {
    return this.runs.has(runId);
  }

  hasActiveRun() {
    return this.runs.size > 0;
  }

  getActiveRunId() {
    const first = this.runs.keys().next();
    return first.done ? null : first.value;
  }
}

export function getCrawlManager() {
  if (!globalForManager.crawlManager) {
    globalForManager.crawlManager = new CrawlManager();
  }
  return globalForManager.crawlManager;
}
