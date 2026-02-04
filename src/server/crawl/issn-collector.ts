import Bottleneck from "bottleneck";
import { normalizeIssn, uniq } from "./issn";
import { fetchOpenAlexList } from "./sources/openalex";
import {
  clearAllData,
  ensureJournal,
  generateVersion,
  initFetchStatusForJournal,
  setCurrentVersion,
  updateRun,
  upsertAlias,
} from "@/server/db/repo";
import { tryParseJson } from "@/server/util/json";
import { nowTimestamp } from "@/server/util/time";
import { extractOpenAlexListItem } from "./indexer";

export type CollectEvent =
  | { type: "collect_progress"; page: number; totalJournals: number; version: string; at: number }
  | { type: "collect_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "collect_done"; totalJournals: number; version: string; at: number };

export type CollectParams = {
  startCursor?: string;
  maxPages?: number | null;
  qps?: number;
  /** 断点续传时传入已有的版本号，不传则生成新版本号 */
  existingVersion?: string;
  /** 断点续传时传入已收集的期刊数量 */
  existingTotalJournals?: number;
};

export async function collectJournals(args: {
  runId: string;
  params: CollectParams;
  signal: AbortSignal;
  emit: (e: CollectEvent) => void;
}): Promise<{ totalJournals: number; lastCursor: string | null; version: string }> {
  const qps = args.params.qps ?? 1;
  const limiter = new Bottleneck({
    minTime: Math.ceil(1000 / qps),
    maxConcurrent: 1,
  });

  const shouldStop = () => args.signal.aborted;
  const emitLog = (level: "info" | "warn" | "error", message: string) =>
    args.emit({ type: "collect_log", level, message, at: nowTimestamp() });

  // 如果有传入版本号（断点续传），使用已有版本号；否则生成新版本号
  const isNewFullCrawl = !args.params.existingVersion;
  
  if (isNewFullCrawl) {
    // 新的全量抓取：清除所有旧数据
    emitLog("info", "开始新的全量抓取，正在清除旧数据...");
    await clearAllData();
    emitLog("info", "旧数据已清除");
  }

  const version = args.params.existingVersion ?? generateVersion();
  if (isNewFullCrawl) {
    await setCurrentVersion(version);
  }

  let cursor = args.params.startCursor ?? "*";
  let page = 0;
  let totalJournals = args.params.existingTotalJournals ?? 0;
  let lastCursor: string | null = null;

  const isContinue = Boolean(args.params.existingVersion);
  emitLog("info", `${isContinue ? "继续" : "开始"}收集期刊，版本号=${version}，起始 cursor=${cursor}${isContinue ? `，已有 ${totalJournals} 个期刊` : ""}`);

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
        break;
      }

      page += 1;
      await updateRun(args.runId, { openalex_cursor: cursor });

      const listJson = tryParseJson<any>(listRes.bodyText);
      const results: any[] = Array.isArray(listJson?.results) ? listJson.results : [];

      if (!listRes.ok) {
        emitLog("error", `OpenAlex list HTTP ${listRes.status}，中止。`);
        break;
      }

      // 处理当前页的所有期刊
      const pageJournalIds: string[] = [];
      for (const r of results) {
        const item = extractOpenAlexListItem(r);
        if (!item || !item.id) continue;

        const journalId = item.id; // OpenAlex ID 作为主键

        // 写入 journals 表
        await ensureJournal(journalId);

        // 初始化 fetch_status（所有数据源都设为 pending，并写入版本号）
        await initFetchStatusForJournal(journalId, version);

        // 写入 issn_aliases 表
        if (item.issn_l) {
          const normalizedIssnL = normalizeIssn(item.issn_l);
          if (normalizedIssnL) {
            await upsertAlias({
              issn: normalizedIssnL,
              journalId,
              kind: "linking",
              source: "openalex",
            });
          }
        }
        
        for (const issn of item.issns) {
          const normalizedIssn = normalizeIssn(issn);
          if (normalizedIssn) {
            // 判断是 print 还是 electronic（简单逻辑：以 issn_l 相同为 linking，其他为 unknown）
            const kind = normalizedIssn === normalizeIssn(item.issn_l) ? "linking" : "unknown";
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
      args.emit({
        type: "collect_progress",
        page,
        totalJournals,
        version,
        at: nowTimestamp(),
      });

      emitLog("info", `第 ${page} 页完成，本页 ${uniquePageJournals.length} 个期刊，累计 ${totalJournals} 个`);

      // 获取下一页 cursor
      const nextCursor = listJson?.meta?.next_cursor ?? null;
      if (!nextCursor) {
        emitLog("info", "已到达最后一页");
        break;
      }
      lastCursor = cursor;
      cursor = String(nextCursor);
    }

    emitLog("info", `期刊收集完成，共 ${totalJournals} 个期刊，版本号=${version}`);
    args.emit({ type: "collect_done", totalJournals, version, at: nowTimestamp() });

    return { totalJournals, lastCursor, version };
  } catch (err: any) {
    emitLog("error", `期刊收集失败：${err?.message ?? String(err)}`);
    throw err;
  }
}
