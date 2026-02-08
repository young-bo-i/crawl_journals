/**
 * 后台批量封面抓取运行器
 *
 * 接收筛选条件，在后台异步遍历所有匹配的无封面期刊，
 * 并发 5 个任务搜索 + 下载封面图片，
 * 通过 WebSocket 实时推送进度。
 *
 * 注意：直接调用数据库和搜索函数，不走内部 HTTP，避免请求卡死。
 */

import http from "node:http";
import https from "node:https";
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
  getDownloadProxy,
  type ImageSearchResult,
} from "@/app/api/image-search/route";
import { SocksProxyAgent } from "socks-proxy-agent";
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

  // ---- 2. 并发处理（并发 5） ----
  const CONCURRENCY = 5;
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
// 通用：通过 SOCKS5 代理或直连下载图片
// ============================================================

const DOWNLOAD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.google.com/",
};

async function downloadImage(
  imageUrl: string,
  proxyAddr: string
): Promise<{ buffer: Buffer; mimeType: string; status: number }> {
  if (proxyAddr) {
    // SOCKS5 代理下载
    const agent = new SocksProxyAgent(proxyAddr);
    return new Promise((resolve, reject) => {
      const isHttps = imageUrl.startsWith("https");
      const lib = isHttps ? https : http;
      const urlObj = new URL(imageUrl);
      const nodeReq = lib.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: "GET",
          agent,
          headers: DOWNLOAD_HEADERS,
          timeout: 20000,
        },
        (nodeRes) => {
          // 处理 3xx 重定向
          if (nodeRes.statusCode && nodeRes.statusCode >= 300 && nodeRes.statusCode < 400 && nodeRes.headers.location) {
            downloadImage(nodeRes.headers.location, proxyAddr).then(resolve).catch(reject);
            return;
          }
          const chunks: Buffer[] = [];
          nodeRes.on("data", (chunk: Buffer) => chunks.push(chunk));
          nodeRes.on("end", () => {
            resolve({
              buffer: Buffer.concat(chunks),
              mimeType: nodeRes.headers["content-type"]?.split(";")[0]?.trim() || "image/jpeg",
              status: nodeRes.statusCode || 502,
            });
          });
          nodeRes.on("error", reject);
        }
      );
      nodeReq.on("error", reject);
      nodeReq.on("timeout", () => {
        nodeReq.destroy();
        reject(new Error("Download timeout"));
      });
      nodeReq.end();
    });
  } else {
    // 直连下载
    const res = await fetch(imageUrl, {
      headers: DOWNLOAD_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: contentType,
      status: res.status,
    };
  }
}

// ============================================================
// 通用：通过文件魔数 (magic bytes) 检测真实图片类型
// ============================================================

/** 检查 buffer 前几个字节判断是否为图片，返回 MIME 或 null */
function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "image/jpeg";
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "image/png";
  // GIF: 47 49 46 38
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  )
    return "image/gif";
  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "image/webp";
  return null;
}

/** 明确的非图片 Content-Type，遇到时直接拒绝 */
const REJECT_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "text/xml",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "text/css",
];

// ============================================================
// 通用：尝试从候选列表中下载图片并保存
// ============================================================

/** thumbnail 回退时要求的最小像素（宽/高均需达到） */
const THUMBNAIL_MIN_DIMENSION = 200;

/**
 * 尝试下载并验证单个 URL，返回验证通过的 { buffer, mimeType } 或 null。
 * 验证逻辑：HTTP 状态码 + 严格拒绝非图片 Content-Type + 魔数校验 + 大小校验 + 可选分辨率校验。
 *
 * @param minWidth  最小宽度（像素），0 表示不检查
 * @param minHeight 最小高度（像素），0 表示不检查
 */
async function tryDownloadSingleUrl(
  url: string,
  proxyAddr: string,
  label: string,
  logPrefix: string,
  minWidth = 0,
  minHeight = 0
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const imgResult = await downloadImage(url, proxyAddr);

  // 1. HTTP 状态码
  if (imgResult.status < 200 || imgResult.status >= 400) {
    console.warn(`${logPrefix} ${label} HTTP ${imgResult.status}, skip`);
    return null;
  }

  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const serverMime = imgResult.mimeType;
  let mimeType: string;

  if (ALLOWED_MIME.includes(serverMime)) {
    // 2a. Content-Type 已经是合法图片类型
    mimeType = serverMime;
  } else if (REJECT_CONTENT_TYPES.some((t) => serverMime.startsWith(t))) {
    // 2b. Content-Type 是明确的非图片类型（如 text/html）→ 直接拒绝
    console.warn(`${logPrefix} ${label} rejected: Content-Type=${serverMime} (non-image)`);
    return null;
  } else {
    // 2c. 未知 Content-Type → 用魔数检测
    const detected = detectImageMime(imgResult.buffer);
    if (detected) {
      mimeType = detected;
    } else {
      console.warn(`${logPrefix} ${label} rejected: Content-Type=${serverMime}, magic bytes unrecognized`);
      return null;
    }
  }

  // 3. 再用魔数做二次校验（即使 Content-Type 合法，内容也可能不对）
  const magicMime = detectImageMime(imgResult.buffer);
  if (!magicMime) {
    console.warn(`${logPrefix} ${label} rejected: Content-Type=${serverMime} but magic bytes invalid`);
    return null;
  }

  const buffer = imgResult.buffer;

  // 4. 文件大小校验
  if (buffer.length > 5 * 1024 * 1024) {
    console.warn(`${logPrefix} ${label} too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), skip`);
    return null;
  }
  if (buffer.length < 1024) {
    console.warn(`${logPrefix} ${label} too small (${buffer.length}B), skip`);
    return null;
  }

  // 5. 分辨率校验（用于 thumbnail 等可能低分辨率的来源）
  if (minWidth > 0 || minHeight > 0) {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w < minWidth || h < minHeight) {
        console.warn(
          `${logPrefix} ${label} resolution too low (${w}x${h}, need >=${minWidth}x${minHeight}), skip`
        );
        return null;
      }
    } catch (metaErr: any) {
      console.warn(`${logPrefix} ${label} failed to read image dimensions: ${metaErr?.message}, skip`);
      return null;
    }
  }

  return { buffer, mimeType };
}

async function tryDownloadCandidates(
  journal: { id: string; name: string },
  candidates: Array<ImageSearchResult & { _origIdx: number }>,
  logPrefix: string,
  task: { stopRequested: boolean; progress: BatchCoverProgress }
): Promise<boolean> {
  // 获取代理配置（每批次开始时读一次）
  let proxyAddr = "";
  try {
    proxyAddr = await getDownloadProxy();
  } catch { /* 读不到配置就直连 */ }

  for (let ci = 0; ci < candidates.length; ci++) {
    if (task.stopRequested) break;

    const candidate = candidates[ci];
    const tag = `candidate[${ci}/${candidates.length}]`;

    // --- 尝试原始 URL ---
    let result: { buffer: Buffer; mimeType: string } | null = null;
    let usedUrl = candidate.url;

    try {
      console.log(`${logPrefix} downloading ${tag}${proxyAddr ? " (via proxy)" : ""}: ${candidate.url.substring(0, 100)}...`);
      result = await tryDownloadSingleUrl(candidate.url, proxyAddr, tag, logPrefix);
    } catch (dlErr: any) {
      console.warn(`${logPrefix} ${tag} original URL failed: ${dlErr?.message}`);
    }

    // --- 原始 URL 失败，尝试 thumbnail 回退（带最小分辨率检查） ---
    if (
      !result &&
      candidate.thumbnail &&
      candidate.thumbnail !== candidate.url
    ) {
      try {
        // Google gstatic.com 缩略图对代理 IP 限制严格，优先直连
        const isGstatic = candidate.thumbnail.includes("gstatic.com");
        const thumbProxy = isGstatic ? "" : proxyAddr;
        console.log(`${logPrefix} ${tag} falling back to thumbnail${isGstatic ? " (direct, skip proxy for gstatic)" : ""}: ${candidate.thumbnail.substring(0, 100)}...`);
        result = await tryDownloadSingleUrl(
          candidate.thumbnail,
          thumbProxy,
          `${tag}(thumbnail)`,
          logPrefix,
          THUMBNAIL_MIN_DIMENSION,
          THUMBNAIL_MIN_DIMENSION
        );
        if (result) usedUrl = candidate.thumbnail;
      } catch (dlErr: any) {
        console.warn(`${logPrefix} ${tag} thumbnail also failed: ${dlErr?.message}`);
      }
    }

    if (!result) continue;

    // --- 下载成功，保存 ---
    try {
      // 从 URL 提取文件名
      const urlPath = new URL(usedUrl).pathname;
      const fileName = urlPath.split("/").pop() || "cover.jpg";

      console.log(`${logPrefix} saving cover (${(result.buffer.length / 1024).toFixed(0)}KB, ${result.mimeType})`);
      await updateJournalCoverImage(journal.id, result.buffer, result.mimeType, fileName);

      console.log(`${logPrefix} SUCCESS (${tag}${usedUrl !== candidate.url ? " via thumbnail" : ""})`);
      task.progress.successCount++;
      return true;
    } catch (saveErr: any) {
      console.warn(`${logPrefix} ${tag} save failed: ${saveErr?.message}, trying next...`);
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
