import { EventEmitter } from "node:events";
import type { CrawlParams, CrawlEvent } from "./runner";
import { runCrawl } from "./runner";
import { createRun, getRun, updateRun, recoverStaleRunningRuns, type CrawlPhase } from "@/server/db/repo";
import { nowLocal } from "@/server/util/time";

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
    await this.initialize();
    
    const runType = params.type === "full" ? "full" : "incremental";
    const initialPhase: CrawlPhase = params.type === "full" ? "collecting" : "fetching";
    const run = await createRun(params, runType);
    const controller = new AbortController();
    const emitter = new EventEmitter();
    const state: RunState = { runId: run.id, controller, emitter };
    this.runs.set(run.id, state);

    const emit = (e: CrawlEvent) => emitter.emit("event", e);

    runCrawl({
      runId: run.id,
      params,
      signal: controller.signal,
      emit,
    }).finally(async () => {
      this.runs.delete(run.id);
      emitter.emit("end");
      emitter.removeAllListeners();
    });

    return run;
  }

  async stop(runId: string) {
    const state = this.runs.get(runId);
    if (state) state.controller.abort();
    await updateRun(runId, { status: "stopped", phase: "stopped", ended_at: nowLocal() });
  }

  getEmitter(runId: string) {
    return this.runs.get(runId)?.emitter ?? null;
  }

  async ensureInitialized() {
    await this.initialize();
  }

  async status(runId: string) {
    return getRun(runId);
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
