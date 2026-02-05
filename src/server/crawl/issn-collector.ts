import Bottleneck from "bottleneck";
import { normalizeIssn, uniq } from "./issn";
import { fetchOpenAlexList } from "./sources/openalex";
import {
  FETCH_SOURCES,
  generateVersion,
  getFetchStatsBySource,
  getTotalJournalCount,
  initFetchStatusForJournal,
  setCurrentVersion,
  updateRun,
  updateProducerStatus,
  bumpCollectedCount,
  upsertAlias,
  upsertFetchStatus,
  upsertJournal,
} from "@/server/db/repo";
import { tryParseJson } from "@/server/util/json";
import { nowTimestamp } from "@/server/util/time";
import { extractOpenAlex } from "./indexer";

export type SourceStats = {
  source: string;
  pending: number;
  success: number;
  no_data: number;
  failed: number;
};

export type CollectEvent =
  | { type: "collect_progress"; page: number; totalJournals: number; version: string; at: number }
  | { type: "collect_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "collect_done"; totalJournals: number; version: string; at: number }
  | { type: "collect_paused"; reason: string; cursor: string; totalJournals: number; at: number }
  | { type: "stats_update"; stats: SourceStats[]; totalJournals: number; at: number };

export type CollectResult = {
  status: "completed" | "paused" | "stopped";
  totalJournals: number;
  lastCursor: string | null;
  version: string;
  pauseReason?: string;
};

export type CollectParams = {
  startCursor?: string;
  maxPages?: number | null;
  qps?: number;
  /** 断点续传时传入已有的版本号，不传则生成新版本号 */
  existingVersion?: string;
  /** 断点续传时传入已收集的期刊数量 */
  existingTotalJournals?: number;
  /** 断点续传时传入已收集的页数 */
  existingPages?: number;
};

export async function collectJournals(args: {
  runId: string;
  params: CollectParams;
  signal: AbortSignal;
  emit: (e: CollectEvent) => void;
}): Promise<CollectResult> {
  const qps = args.params.qps ?? 1;
  const limiter = new Bottleneck({
    minTime: Math.ceil(1000 / qps),
    maxConcurrent: 1,
  });

  const shouldStop = () => args.signal.aborted;
  const emitLog = (level: "info" | "warn" | "error", message: string) =>
    args.emit({ type: "collect_log", level, message, at: nowTimestamp() });

  // 统计数据推送（带节流，最多每秒推送一次）
  let lastStatsEmitTime = 0;
  const emitStatsUpdate = async () => {
    const now = Date.now();
    if (now - lastStatsEmitTime < 1000) return;
    lastStatsEmitTime = now;
    
    try {
      const [stats, total] = await Promise.all([
        getFetchStatsBySource(),
        getTotalJournalCount(),
      ]);
      args.emit({
        type: "stats_update",
        stats,
        totalJournals: total,
        at: nowTimestamp(),
      });
    } catch {
      // 忽略统计查询错误
    }
  };

  // 如果有传入版本号（断点续传），使用已有版本号；否则生成新版本号
  const isNewFullCrawl = !args.params.existingVersion;
  // 注意：数据清空已在 manager.start() 中完成，这里不再重复清空

  const version = args.params.existingVersion ?? generateVersion();
  if (isNewFullCrawl) {
    await setCurrentVersion(version);
  }

  let cursor = args.params.startCursor ?? "*";
  let page = args.params.existingPages ?? 0;
  let totalJournals = args.params.existingTotalJournals ?? 0;
  let lastCursor: string | null = null;

  const isContinue = Boolean(args.params.existingVersion);
  emitLog("info", `${isContinue ? "继续" : "开始"}收集期刊，版本号=${version}，起始 cursor=${cursor}${isContinue ? `，已有 ${totalJournals} 个期刊，已完成 ${page} 页` : ""}`);

  try {
    while (!shouldStop()) {
      if (args.params.maxPages && page >= args.params.maxPages) break;

      let listRes;
      try {
        if (shouldStop()) break;
        listRes = await limiter.schedule(() =>
          fetchOpenAlexList({ cursor, perPage: 200, signal: args.signal }),
        );
      } catch (e: any) {
        if (shouldStop()) break;
        emitLog("error", `OpenAlex list error: ${e?.message ?? String(e)}`);
        // 网络错误，暂停生产者
        const reason = `网络错误: ${e?.message ?? String(e)}`;
        await updateProducerStatus(args.runId, "paused", reason);
        await updateRun(args.runId, { openalex_cursor: cursor });
        args.emit({ type: "collect_paused", reason, cursor, totalJournals, at: nowTimestamp() });
        return { status: "paused", totalJournals, lastCursor: cursor, version, pauseReason: reason };
      }

      page += 1;
      // 注意：cursor 保存移到处理完当前页之后，保存 nextCursor

      const listJson = tryParseJson<any>(listRes.bodyText);
      const results: any[] = Array.isArray(listJson?.results) ? listJson.results : [];

      // 429 限流错误：立即暂停生产者
      if (listRes.status === 429) {
        const reason = "OpenAlex API 限流 (HTTP 429)";
        emitLog("warn", `${reason}，生产者暂停，cursor=${cursor}`);
        await updateProducerStatus(args.runId, "paused", reason);
        args.emit({ type: "collect_paused", reason, cursor, totalJournals, at: nowTimestamp() });
        return { status: "paused", totalJournals, lastCursor: cursor, version, pauseReason: reason };
      }

      // 其他错误
      if (!listRes.ok) {
        const reason = `OpenAlex API 错误 (HTTP ${listRes.status})`;
        emitLog("error", `${reason}，生产者暂停`);
        await updateProducerStatus(args.runId, "paused", reason);
        args.emit({ type: "collect_paused", reason, cursor, totalJournals, at: nowTimestamp() });
        return { status: "paused", totalJournals, lastCursor: cursor, version, pauseReason: reason };
      }

      // 处理当前页的所有期刊
      const pageJournalIds: string[] = [];
      for (const r of results) {
        // 提取完整的 OpenAlex 数据
        const openalexData = extractOpenAlex(JSON.stringify(r));
        if (!openalexData.id) continue;

        const journalId = openalexData.id;

        // 直接保存完整的 OpenAlex 数据到 journals 表
        await upsertJournal({ id: journalId, ...openalexData });

        // OpenAlex 数据已保存，标记为 success
        await upsertFetchStatus({
          journalId,
          source: "openalex",
          status: "success",
          httpStatus: 200,
          version,
        });

        // 只初始化其他 4 个数据源为 pending（不含 openalex）
        await initFetchStatusForJournal(journalId, version, FETCH_SOURCES);

        // 写入 issn_aliases 表
        if (openalexData.issn_l) {
          const normalizedIssnL = normalizeIssn(openalexData.issn_l);
          if (normalizedIssnL) {
            await upsertAlias({
              issn: normalizedIssnL,
              journalId,
              kind: "linking",
              source: "openalex",
            });
          }
        }
        
        const issns = openalexData.issns ?? [];
        for (const issn of issns) {
          const normalizedIssn = normalizeIssn(issn);
          if (normalizedIssn) {
            const kind = normalizedIssn === normalizeIssn(openalexData.issn_l) ? "linking" : "unknown";
            await upsertAlias({
              issn: normalizedIssn,
              journalId,
              kind: kind as "print" | "electronic" | "linking" | "unknown",
              source: "openalex",
            });
          }
        }

        pageJournalIds.push(journalId);
      }

      const uniquePageJournals = uniq(pageJournalIds);
      totalJournals += uniquePageJournals.length;

      // 更新进度
      await updateRun(args.runId, { total_journals: totalJournals });
      await bumpCollectedCount(args.runId, uniquePageJournals.length);
      args.emit({
        type: "collect_progress",
        page,
        totalJournals,
        version,
        at: nowTimestamp(),
      });
      
      // 推送统计数据更新
      await emitStatsUpdate();

      emitLog("info", `第 ${page} 页完成，本页 ${uniquePageJournals.length} 个期刊，累计 ${totalJournals} 个`);

      // 获取下一页 cursor
      const nextCursor = listJson?.meta?.next_cursor ?? null;
      if (!nextCursor) {
        emitLog("info", "已到达最后一页");
        // 保存当前状态，下次继续时会检测到无 nextCursor 而结束
        await updateRun(args.runId, { openalex_cursor: null });
        break;
      }
      lastCursor = cursor;
      cursor = String(nextCursor);
      
      // 处理完当前页后，保存下一页的 cursor
      // 这样暂停后继续时，会从下一页开始，不会重复处理当前页
      await updateRun(args.runId, { openalex_cursor: cursor });
    }

    // 检查是否是手动停止
    if (shouldStop()) {
      emitLog("info", `收集被手动停止，共收集 ${totalJournals} 个期刊`);
      return { status: "stopped", totalJournals, lastCursor: cursor, version };
    }

    // 正常完成
    emitLog("info", `期刊收集完成，共 ${totalJournals} 个期刊，版本号=${version}`);
    await updateProducerStatus(args.runId, "completed");
    args.emit({ type: "collect_done", totalJournals, version, at: nowTimestamp() });

    return { status: "completed", totalJournals, lastCursor, version };
  } catch (err: any) {
    const reason = `期刊收集失败：${err?.message ?? String(err)}`;
    emitLog("error", reason);
    await updateProducerStatus(args.runId, "paused", reason);
    args.emit({ type: "collect_paused", reason, cursor, totalJournals, at: nowTimestamp() });
    return { status: "paused", totalJournals, lastCursor: cursor, version, pauseReason: reason };
  }
}
