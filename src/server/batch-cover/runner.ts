/**
 * 后台批量封面抓取运行器
 *
 * 接收筛选条件，在后台异步遍历所有匹配的无封面期刊，
 * 并发 5 个任务搜索 + 下载封面图片，
 * 通过 WebSocket 实时推送进度。
 *
 * 注意：直接调用数据库和搜索函数，不走内部 HTTP，避免请求卡死。
 */

import {
  queryJournals,
  hasJournalCoverImage,
  updateJournalCoverImage,
  type QueryJournalsArgs,
  type SortField,
  type SortOrder,
} from "@/server/db/repo";
import { performImageSearch } from "@/app/api/image-search/route";
import { getWsManager } from "@/server/ws/manager";

// ============================================================
// 类型定义
// ============================================================

export type BatchCoverProgress = {
  taskId: string;
  status: "running" | "completed" | "stopped" | "error";
  total: number;
  current: number;
  successCount: number;
  failCount: number;
  skipCount: number;
  currentName: string;
  startedAt: string;
  error?: string;
};

type BatchCoverTask = {
  taskId: string;
  stopRequested: boolean;
  progress: BatchCoverProgress;
};

// ============================================================
// 全局状态（进程内单例）
// ============================================================

const globalForBatch = globalThis as unknown as {
  __batchCoverTask?: BatchCoverTask | null;
};

function getTask(): BatchCoverTask | null {
  return globalForBatch.__batchCoverTask ?? null;
}

function setTask(task: BatchCoverTask | null) {
  globalForBatch.__batchCoverTask = task;
}

// ============================================================
// 公开 API
// ============================================================

/** 获取当前任务进度 */
export function getBatchCoverStatus(): BatchCoverProgress | null {
  return getTask()?.progress ?? null;
}

/** 停止当前任务 */
export function stopBatchCover(): boolean {
  const task = getTask();
  if (task && task.progress.status === "running") {
    task.stopRequested = true;
    return true;
  }
  return false;
}

/** 启动批量封面抓取 */
export async function startBatchCover(
  filterParams: Record<string, string>
): Promise<string> {
  const task = getTask();
  if (task?.progress.status === "running") {
    throw new Error("已有批量任务在运行中");
  }

  const taskId = `batch_cover_${Date.now()}`;
  const newTask: BatchCoverTask = {
    taskId,
    stopRequested: false,
    progress: {
      taskId,
      status: "running",
      total: 0,
      current: 0,
      successCount: 0,
      failCount: 0,
      skipCount: 0,
      currentName: "正在查询匹配的期刊...",
      startedAt: new Date().toISOString(),
    },
  };

  setTask(newTask);
  broadcastProgress(true);

  // 启动后台处理（不阻塞响应）
  processInBackground(taskId, filterParams).catch((err) => {
    console.error("[batch-cover] Unexpected error:", err);
    const t = getTask();
    if (t?.taskId === taskId) {
      t.progress.status = "error";
      t.progress.error = err?.message ?? String(err);
      broadcastProgress(true);
    }
  });

  return taskId;
}

// ============================================================
// WS 广播（带节流）
// ============================================================

let lastBroadcastTime = 0;
const BROADCAST_THROTTLE_MS = 300;

function broadcastProgress(force = false) {
  const task = getTask();
  if (!task) return;

  const now = Date.now();
  if (!force && now - lastBroadcastTime < BROADCAST_THROTTLE_MS) return;
  lastBroadcastTime = now;

  try {
    getWsManager().broadcast({
      type: "batch_cover_event",
      event: { ...task.progress },
    } as any);
  } catch {
    // WS 可能未初始化
  }
}

// ============================================================
// 后台处理核心逻辑
// ============================================================

async function processInBackground(
  taskId: string,
  filterParams: Record<string, string>
) {
  const task = getTask();
  if (!task || task.taskId !== taskId) return;

  // ---- 1. 收集所有符合条件的无封面期刊 ----
  const allJournals: Array<{ id: string; name: string }> = [];
  // 每页 5000 条以减少分页次数（只选 4 个轻量字段，内存占用很小）
  const PAGE_SIZE = 5000;
  let page = 1;
  const queryArgs = buildQueryArgs(filterParams);

  // 打印实际使用的筛选条件，方便排查
  const activeFilters = Object.entries(filterParams).filter(([, v]) => !!v);
  console.log(
    `[batch-cover] Filters: ${activeFilters.length > 0 ? activeFilters.map(([k, v]) => `${k}=${v}`).join(", ") : "(none)"}`
  );
  console.log("[batch-cover] Collecting journals without covers...");

  while (true) {
    if (task.stopRequested) break;

    const startMs = Date.now();
    const { total, rows } = await queryJournals({
      ...queryArgs,
      hasCover: false, // 强制只查无封面的
      page,
      pageSize: PAGE_SIZE,
      fields: ["id", "oa_display_name", "cr_title", "doaj_title"],
    });
    const elapsed = Date.now() - startMs;

    for (const row of rows) {
      allJournals.push({
        id: String(row.id),
        name: String(
          row.oa_display_name || row.cr_title || row.doaj_title || "Unknown"
        ),
      });
    }

    console.log(
      `[batch-cover] Page ${page}: fetched ${rows.length} rows in ${elapsed}ms (total: ${allJournals.length}/${total})`
    );

    // 更新收集阶段的进度
    task.progress.total = total;
    task.progress.currentName = `正在收集期刊列表... (${allJournals.length}/${total})`;
    broadcastProgress(page === 1); // 第一页强制推送

    if (rows.length < PAGE_SIZE || allJournals.length >= total) break;
    page++;
  }

  if (task.stopRequested) {
    task.progress.status = "stopped";
    broadcastProgress(true);
    console.log("[batch-cover] Task stopped during collection phase");
    return;
  }

  task.progress.total = allJournals.length;
  task.progress.currentName = `开始处理 ${allJournals.length} 个期刊...`;
  broadcastProgress(true);
  console.log(`[batch-cover] Collected ${allJournals.length} journals in ${page} page(s)`);

  if (allJournals.length === 0) {
    task.progress.status = "completed";
    task.progress.currentName = "没有需要处理的期刊";
    broadcastProgress(true);
    return;
  }

  // ---- 2. 并发处理（并发 5） ----
  const CONCURRENCY = 5;

  const processSingle = async (journal: { id: string; name: string }) => {
    if (task.stopRequested) return;

    try {
      // 2a. 检查是否已有封面（防止重复，直接查数据库）
      const hasCover = await hasJournalCoverImage(journal.id);
      if (hasCover) {
        task.progress.skipCount++;
        task.progress.current++;
        task.progress.currentName = `${journal.name}（已有封面，跳过）`;
        broadcastProgress();
        return;
      }

      // 2b. 搜索图片（直接调用搜索函数，不走 HTTP）
      const results = await performImageSearch(
        journal.name + " journal cover"
      );

      if (results.length === 0) {
        task.progress.failCount++;
      } else if (!task.stopRequested) {
        // 2c. 从前 3 张中选尺寸最大的一张
        const candidates = results.slice(0, 3);
        const best = candidates.reduce((a, b) =>
          (a.width || 0) * (a.height || 0) >= (b.width || 0) * (b.height || 0)
            ? a
            : b
        );

        // 2d. 下载图片
        const imgRes = await fetch(best.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; JournalCoverBot/1.0)",
            Accept: "image/*",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!imgRes.ok) {
          throw new Error(`下载图片失败 (${imgRes.status})`);
        }

        // 检测 MIME
        let mimeType =
          imgRes.headers.get("content-type")?.split(";")[0]?.trim() ??
          "image/jpeg";
        const ALLOWED = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ];
        if (!ALLOWED.includes(mimeType)) {
          const ext = best.url
            .split("?")[0]
            .split(".")
            .pop()
            ?.toLowerCase();
          const extMap: Record<string, string> = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            gif: "image/gif",
            webp: "image/webp",
          };
          mimeType = (ext && extMap[ext]) || "image/jpeg";
        }

        const buffer = Buffer.from(await imgRes.arrayBuffer());

        // 限制 5MB
        if (buffer.length > 5 * 1024 * 1024) {
          throw new Error("图片过大");
        }

        // 从 URL 提取文件名
        const urlPath = new URL(best.url).pathname;
        const fileName = urlPath.split("/").pop() || "cover.jpg";

        // 2e. 直接写入数据库（不走 HTTP）
        await updateJournalCoverImage(
          journal.id,
          buffer,
          mimeType,
          fileName
        );

        task.progress.successCount++;
      }
    } catch (err: any) {
      console.error(
        `[batch-cover] Error for ${journal.id} (${journal.name}):`,
        err?.message
      );
      task.progress.failCount++;
    }

    task.progress.current++;
    task.progress.currentName = journal.name;
    broadcastProgress();
  };

  // 并发池
  const queue = [...allJournals];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    if (task.stopRequested) break;

    // 填满并发池
    while (running.length < CONCURRENCY && queue.length > 0) {
      const journal = queue.shift()!;
      const p = processSingle(journal).then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }

    // 等待任一任务完成
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  // 等待剩余任务完成
  if (running.length > 0) {
    await Promise.all(running);
  }

  task.progress.status = task.stopRequested ? "stopped" : "completed";
  broadcastProgress(true);
  console.log(
    `[batch-cover] Task ${task.progress.status}: ` +
      `success=${task.progress.successCount}, fail=${task.progress.failCount}, skip=${task.progress.skipCount}`
  );
}

// ============================================================
// 筛选参数转换
// ============================================================

function parseBool(v: string | undefined): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function parseNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function buildQueryArgs(
  params: Record<string, string>
): Omit<QueryJournalsArgs, "page" | "pageSize"> {
  return {
    q: params.q || undefined,
    inDoaj: parseBool(params.inDoaj),
    inNlm: parseBool(params.inNlm),
    hasWikidata: parseBool(params.hasWikidata),
    hasWikipedia: parseBool(params.hasWikipedia),
    isOpenAccess: parseBool(params.isOpenAccess),
    isCore: parseBool(params.isCore),
    isOa: parseBool(params.isOa),
    inScielo: parseBool(params.inScielo),
    isOjs: parseBool(params.isOjs),
    doajBoai: parseBool(params.doajBoai),
    inScimago: parseBool(params.inScimago),
    // hasCover 由 processInBackground 强制设置为 false
    country: params.country || undefined,
    oaType:
      params.oaType && params.oaType !== "all" ? params.oaType : undefined,
    minWorksCount: parseNum(params.minWorksCount),
    maxWorksCount: parseNum(params.maxWorksCount),
    minCitedByCount: parseNum(params.minCitedByCount),
    maxCitedByCount: parseNum(params.maxCitedByCount),
    minFirstYear: parseNum(params.minFirstYear),
    maxFirstYear: parseNum(params.maxFirstYear),
    sortBy: undefined as SortField | undefined,
    sortOrder: undefined as SortOrder | undefined,
  };
}
