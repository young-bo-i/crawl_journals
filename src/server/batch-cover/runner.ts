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
import {
  performImageSearch,
  type ImageSearchResult,
} from "@/app/api/image-search/route";
import { broadcastMessage } from "@/server/ws/manager";

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
  filterParams: Record<string, string>,
  limit?: number
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

  console.log(`[batch-cover] ===== Task ${taskId} starting =====`);
  console.log(`[batch-cover] Filter params received:`, JSON.stringify(filterParams), `limit: ${limit ?? "unlimited"}`);

  // 启动后台处理（不阻塞响应）
  processInBackground(taskId, filterParams, limit).catch((err) => {
    console.error("[batch-cover] ===== UNCAUGHT ERROR =====", err);
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
    const clientCount = broadcastMessage({
      type: "batch_cover_event",
      event: { ...task.progress },
    } as any);
    // 首次或每 50 次打印一次广播日志
    if (force) {
      console.log(`[batch-cover] WS broadcast to ${clientCount} client(s), status=${task.progress.status}, current=${task.progress.current}/${task.progress.total}`);
    }
  } catch (err: any) {
    console.error("[batch-cover] WS broadcast error:", err?.message);
  }
}

// ============================================================
// 后台处理核心逻辑
// ============================================================

async function processInBackground(
  taskId: string,
  filterParams: Record<string, string>,
  limit?: number
) {
  const task = getTask();
  if (!task || task.taskId !== taskId) {
    console.log(`[batch-cover] Task mismatch or null, aborting. current=${getTask()?.taskId}, expected=${taskId}`);
    return;
  }

  console.log("[batch-cover] processInBackground() entered");

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
    // 如果设置了数量限制，收集够了就停止
    if (limit && allJournals.length >= limit) break;
    page++;
  }

  if (task.stopRequested) {
    task.progress.status = "stopped";
    broadcastProgress(true);
    console.log("[batch-cover] Task stopped during collection phase");
    return;
  }

  // 如果设置了数量限制，截断列表
  if (limit && limit > 0 && allJournals.length > limit) {
    allJournals.length = limit;
    console.log(`[batch-cover] Limited to ${limit} journals (from ${task.progress.total} total)`);
  }

  task.progress.total = allJournals.length;
  task.progress.currentName = `开始处理 ${allJournals.length} 个期刊...`;
  broadcastProgress(true);
  console.log(`[batch-cover] ===== Collection done: ${allJournals.length} journals in ${page} page(s) =====`);

  if (allJournals.length === 0) {
    task.progress.status = "completed";
    task.progress.currentName = "没有需要处理的期刊";
    broadcastProgress(true);
    return;
  }

  // ---- 2. 并发处理（并发 2，避免镜像站过载） ----
  const CONCURRENCY = 2;
  const MAX_PAGES = 5; // 每个期刊最多搜索 5 页

  let processedSoFar = 0;

  const processSingle = async (journal: { id: string; name: string }) => {
    if (task.stopRequested) return;

    const idx = ++processedSoFar;
    const logPrefix = `[batch-cover][${idx}/${allJournals.length}] ${journal.id}`;

    try {
      // 2a. 检查是否已有封面
      console.log(`${logPrefix} checking cover...`);
      const hasCover = await hasJournalCoverImage(journal.id);
      if (hasCover) {
        console.log(`${logPrefix} already has cover, skip`);
        task.progress.skipCount++;
        task.progress.current++;
        task.progress.currentName = `${journal.name}（已有封面，跳过）`;
        broadcastProgress();
        return;
      }

      const searchQuery = journal.name + " journal cover";
      let downloaded = false;

      // 2b. 逐页搜索 + 下载，每页尝试全部候选，最多 MAX_PAGES 页
      for (let pageIdx = 0; pageIdx < MAX_PAGES; pageIdx++) {
        if (task.stopRequested) break;

        console.log(`${logPrefix} searching page ${pageIdx + 1}/${MAX_PAGES} for: ${journal.name}`);
        const searchStart = Date.now();
        let results: ImageSearchResult[];
        try {
          results = await performImageSearch(searchQuery, pageIdx);
        } catch (searchErr: any) {
          console.warn(`${logPrefix} page ${pageIdx + 1} search error: ${searchErr?.message}`);
          break; // 搜索出错，停止翻页
        }
        console.log(`${logPrefix} page ${pageIdx + 1} returned ${results.length} results in ${Date.now() - searchStart}ms`);

        if (results.length === 0) {
          if (pageIdx === 0) {
            console.warn(`${logPrefix} FAILED: 搜索无结果 (${journal.name})`);
          } else {
            console.log(`${logPrefix} page ${pageIdx + 1} 无更多结果，停止翻页`);
          }
          break; // 无结果，停止翻页
        }

        if (task.stopRequested) break;

        // 候选图片按面积降序排序
        const sorted = results
          .map((r, i) => ({ ...r, _origIdx: i }))
          .sort(
            (a, b) =>
              (b.width || 0) * (b.height || 0) -
              (a.width || 0) * (a.height || 0)
          );

        // 优先尝试前 3 个候选
        const TOP_N = 3;
        const topCandidates = sorted.slice(0, TOP_N);
        const restCandidates = sorted.slice(TOP_N);

        let ok = await tryDownloadCandidates(journal, topCandidates, logPrefix, task);

        if (!ok && restCandidates.length > 0 && !task.stopRequested) {
          // 前 3 个都失败了，继续尝试该页剩余候选
          console.log(`${logPrefix} page ${pageIdx + 1} 前 ${TOP_N} 个候选失败，尝试剩余 ${restCandidates.length} 个...`);
          ok = await tryDownloadCandidates(journal, restCandidates, logPrefix, task);
        }

        if (ok) {
          downloaded = true;
          break; // 下载成功，停止翻页
        }

        console.log(`${logPrefix} page ${pageIdx + 1} 所有候选下载失败，继续下一页...`);
      }

      if (!downloaded && !task.stopRequested) {
        console.error(`${logPrefix} FAILED: ${MAX_PAGES} 页内所有候选均下载失败 | name=${journal.name}`);
        task.progress.failCount++;
      }
    } catch (err: any) {
      console.error(`${logPrefix} FAILED: ${err?.message} | name=${journal.name} | stack=${err?.stack?.split("\n")[1]?.trim() ?? ""}`);
      task.progress.failCount++;
    }

    task.progress.current++;
    task.progress.currentName = journal.name;
    broadcastProgress();
  };

  // 并发池执行
  console.log(`[batch-cover] ===== Starting processing, concurrency=${CONCURRENCY}, maxPages=${MAX_PAGES} =====`);
  await runConcurrentPool(allJournals.map((j) => () => processSingle(j)), CONCURRENCY, task);

  task.progress.status = task.stopRequested ? "stopped" : "completed";
  broadcastProgress(true);
  console.log(
    `[batch-cover] Task ${task.progress.status}: ` +
      `success=${task.progress.successCount}, fail=${task.progress.failCount}, skip=${task.progress.skipCount}`
  );
}

// ============================================================
// 通用：尝试从候选列表中下载图片并保存
// ============================================================

async function tryDownloadCandidates(
  journal: { id: string; name: string },
  candidates: Array<ImageSearchResult & { _origIdx: number }>,
  logPrefix: string,
  task: { stopRequested: boolean; progress: BatchCoverProgress }
): Promise<boolean> {
  for (let ci = 0; ci < candidates.length; ci++) {
    if (task.stopRequested) break;

    const candidate = candidates[ci];

    try {
      console.log(`${logPrefix} downloading candidate[${ci}/${candidates.length}]: ${candidate.url.substring(0, 100)}...`);
      const imgRes = await fetch(candidate.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.google.com/",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });

      if (!imgRes.ok) {
        console.warn(`${logPrefix} candidate[${ci}/${candidates.length}] HTTP ${imgRes.status}, trying next...`);
        continue;
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
        const ext = candidate.url
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

      // 跳过过大的图片（>5MB）
      if (buffer.length > 5 * 1024 * 1024) {
        console.warn(`${logPrefix} candidate[${ci}/${candidates.length}] too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), trying next...`);
        continue;
      }

      // 跳过过小的图片（<1KB，可能是占位图）
      if (buffer.length < 1024) {
        console.warn(`${logPrefix} candidate[${ci}/${candidates.length}] too small (${buffer.length}B), trying next...`);
        continue;
      }

      // 从 URL 提取文件名
      const urlPath = new URL(candidate.url).pathname;
      const fileName = urlPath.split("/").pop() || "cover.jpg";

      // 写入数据库
      console.log(`${logPrefix} saving cover (${(buffer.length / 1024).toFixed(0)}KB, ${mimeType})`);
      await updateJournalCoverImage(journal.id, buffer, mimeType, fileName);

      console.log(`${logPrefix} SUCCESS (candidate[${ci}/${candidates.length}])`);
      task.progress.successCount++;
      return true;
    } catch (dlErr: any) {
      console.warn(`${logPrefix} candidate[${ci}/${candidates.length}] failed: ${dlErr?.message}, trying next...`);
      continue;
    }
  }
  return false;
}

// ============================================================
// 通用并发池执行器
// ============================================================

async function runConcurrentPool(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
  taskState: { stopRequested: boolean }
) {
  const queue = [...tasks];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    if (taskState.stopRequested) break;

    while (running.length < concurrency && queue.length > 0) {
      const fn = queue.shift()!;
      const p = fn().then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }

    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  if (running.length > 0) {
    console.log(`[batch-cover] Waiting for ${running.length} remaining tasks...`);
    await Promise.all(running);
  }
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
