import Bottleneck from "bottleneck";
import pLimit from "p-limit";
import {
  FETCH_SOURCES,
  type FetchFilter,
  type FetchStatusType,
  type SourceName,
  type JournalRow,
  bumpRunCounters,
  getCurrentVersion,
  getFetchStatusForJournal,
  getFetchStatsBySource,
  getJournal,
  getJournalIdsForFetch,
  getSourcesForJournal,
  getPendingJournalCount,
  getTotalJournalCount,
  isProducerCompleted,
  updateRun,
  updateConsumerStatus,
  upsertFetchStatus,
  upsertJournal,
} from "@/server/db/repo";
import { fetchCrossrefJournal } from "./sources/crossref";
import { fetchDoajJournalByIssn, fetchDoajJournalByTitle } from "./sources/doaj";
import { fetchNlmEsearch, fetchNlmEsearchByTitle } from "./sources/nlm";
import { fetchWikidataByIssn, fetchWikidataByTitle } from "./sources/wikidata";
import {
  extractCrossref,
  extractDoaj,
  extractNlmEsearch,
  extractWikidata,
  mergeJournalData,
} from "./indexer";
import { tryParseJson } from "@/server/util/json";
import { nowTimestamp } from "@/server/util/time";

export type SourceStats = {
  source: string;
  pending: number;
  success: number;
  no_data: number;
  failed: number;
};

export type FetchEvent =
  | { type: "fetch_progress"; processed: number; total: number; currentJournalId: string; at: number }
  | { type: "fetch_source"; journalId: string; source: SourceName; status: FetchStatusType; httpStatus: number | null; at: number }
  | { type: "fetch_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "fetch_done"; processed: number; at: number }
  | { type: "fetch_waiting"; reason: string; at: number }
  | { type: "stats_update"; stats: SourceStats[]; totalJournals: number; at: number };

export type FetchParams = {
  concurrency?: number;
  qps?: Partial<Record<SourceName, number>>;
  filter?: FetchFilter;
  version?: string;
  serialMode?: boolean;
  /** 流水线模式：等待生产者产生数据 */
  pipelineMode?: boolean;
  /** 轮询间隔（毫秒） */
  pollIntervalMs?: number;
};

export type FetchResult = {
  status: "completed" | "stopped";
  processed: number;
};

/**
 * 判断请求结果的状态
 */
function determineStatus(
  source: SourceName,
  httpStatus: number | null,
  bodyText: string | null,
): FetchStatusType {
  if (httpStatus === null) return "failed";
  if (httpStatus === 200) {
    if (hasData(source, bodyText)) return "success";
    return "no_data";
  }
  // Crossref 404 表示无记录
  if (source === "crossref" && httpStatus === 404) {
    return "no_data";
  }
  return "failed";
}

function hasData(source: SourceName, bodyText: string | null): boolean {
  if (!bodyText) return false;
  const json = tryParseJson<any>(bodyText);
  if (!json) return false;

  switch (source) {
    case "crossref":
      return Boolean(json?.message?.ISSN || json?.message?.title);
    case "doaj":
      return Array.isArray(json?.results) && json.results.length > 0;
    case "nlm":
      return Array.isArray(json?.esearchresult?.idlist) && json.esearchresult.idlist.length > 0;
    case "wikidata":
      return Array.isArray(json?.results?.bindings) && json.results.bindings.length > 0;
    default:
      return false;
  }
}

export async function fetchDetails(args: {
  runId: string;
  params: FetchParams;
  signal: AbortSignal;
  emit: (e: FetchEvent) => void;
}): Promise<FetchResult> {
  const concurrency = Math.max(1, Math.min(100, args.params.concurrency ?? 30));
  const pollIntervalMs = args.params.pollIntervalMs ?? 5000; // 默认 5 秒轮询

  // QPS 限制（不含 openalex）
  const defaultQps: Partial<Record<SourceName, number>> = {
    crossref: 8,
    doaj: 8,
    nlm: 10,
    wikidata: 5,
    wikipedia: 3,
  };
  
  const qps = { ...defaultQps, ...(args.params.qps || {}) };

  // 为每个数据源配置独立的并发控制（不含 openalex）
  const limiterConfigs: Partial<Record<SourceName, { minTime: number; maxConcurrent: number }>> = {
    crossref: { minTime: Math.ceil(1000 / (qps.crossref ?? 8)), maxConcurrent: 25 },
    doaj: { minTime: Math.ceil(1000 / (qps.doaj ?? 8)), maxConcurrent: 25 },
    nlm: { minTime: Math.ceil(1000 / (qps.nlm ?? 10)), maxConcurrent: 30 },
    wikidata: { minTime: Math.ceil(1000 / (qps.wikidata ?? 5)), maxConcurrent: 20 },
    wikipedia: { minTime: Math.ceil(1000 / (qps.wikipedia ?? 3)), maxConcurrent: 10 },
  };

  const limiters: Partial<Record<SourceName, Bottleneck>> = {};
  for (const source of FETCH_SOURCES) {
    limiters[source] = new Bottleneck(limiterConfigs[source]!);
  }

  const shouldStop = () => args.signal.aborted;
  const isAbortError = (e: any) =>
    Boolean(
      e &&
        (e.name === "AbortError" ||
          e.code === "ABORT_ERR" ||
          String(e.message ?? "").toLowerCase().includes("aborted")),
    );

  const emitLog = (level: "info" | "warn" | "error", message: string) =>
    args.emit({ type: "fetch_log", level, message, at: nowTimestamp() });

  // 统计数据推送（带节流，最多每 3s 推送一次，减少聚合查询压力）
  let lastStatsEmitTime = 0;
  const STATS_THROTTLE_MS = 3000;
  const emitStatsUpdate = async () => {
    const now = Date.now();
    if (now - lastStatsEmitTime < STATS_THROTTLE_MS) return;
    lastStatsEmitTime = now;
    
    try {
      const [stats, totalJournals] = await Promise.all([
        getFetchStatsBySource(),
        getTotalJournalCount(),
      ]);
      args.emit({
        type: "stats_update",
        stats,
        totalJournals,
        at: nowTimestamp(),
      });
    } catch (e) {
      // 忽略统计查询错误，不影响主流程
    }
  };
  
  // 发送 fetch_source 事件并同时推送统计数据
  const emitFetchSource = async (journalId: string, source: SourceName, status: FetchStatusType, httpStatus: number | null) => {
    args.emit({ type: "fetch_source", journalId, source, status, httpStatus, at: nowTimestamp() });
    await emitStatsUpdate();
  };

  // 获取当前版本号
  const version = args.params.version ?? await getCurrentVersion();

  // 设置消费者状态为 running
  await updateConsumerStatus(args.runId, "running");

  const modeDesc = args.params.serialMode ? "串行模式" : "并行模式";
  const pipelineDesc = args.params.pipelineMode ? "（流水线模式）" : "";
  emitLog("info", `开始详情抓取${pipelineDesc}，版本号=${version ?? "无"}，${modeDesc}，并发数 ${concurrency}`);

  let processed = 0;
  let totalProcessed = 0;

  // current_journal_id 更新节流（仅用于 UI 展示，无需每个期刊都写）
  let lastRunUpdateTime = 0;
  const RUN_UPDATE_THROTTLE_MS = 2000;
  const throttledUpdateCurrentJournal = async (journalId: string) => {
    const now = Date.now();
    if (now - lastRunUpdateTime < RUN_UPDATE_THROTTLE_MS) return;
    lastRunUpdateTime = now;
    await updateRun(args.runId, { current_journal_id: journalId });
  };

  async function processJournal(journalId: string) {
    if (shouldStop()) return;

    await throttledUpdateCurrentJournal(journalId);

    // 获取现有期刊数据（包含已保存的 OpenAlex 数据）
    const existingJournal = await getJournal(journalId);
    const issn_l = existingJournal?.issn_l;
    const issns = existingJournal?.issns ?? [];
    const primaryIssn = issn_l ?? issns[0] ?? null;

    // 获取需要抓取的数据源
    // 默认抓取 pending 状态，但如果传入了 filter.statuses（如 ["failed"]），则使用传入的状态
    const targetStatuses = args.params.filter?.statuses ?? ["pending"];
    const sourcesToFetch = await getSourcesForJournal(journalId, {
      ...args.params.filter,
      sources: FETCH_SOURCES,
      statuses: targetStatuses,
      version: version ?? undefined,
    });
    if (sourcesToFetch.length === 0) return;

    // 用于存储各数据源的结果
    const sourceResults: Partial<Record<SourceName, { status: FetchStatusType; httpStatus: number | null; bodyText: string | null }>> = {};

    // 获取标题（从已保存的 OpenAlex 数据中获取）
    const journalTitle: string | null = existingJournal?.oa_display_name ?? null;

    // Crossref 抓取任务（需要 ISSN）
    const fetchCrossrefTask = () => limiters.crossref!.schedule(async () => {
      if (shouldStop()) throw new Error("aborted");
      
      if (!primaryIssn) {
        await upsertFetchStatus({
          journalId,
          source: "crossref",
          status: "no_data",
          httpStatus: null,
          errorMessage: "No ISSN available",
          version,
        });
        await emitFetchSource(journalId, "crossref", "no_data", null);
        return { status: "no_data" as FetchStatusType, httpStatus: null, bodyText: null };
      }
      
      try {
        const res = await fetchCrossrefJournal({ issn: primaryIssn, signal: args.signal });
        const status = determineStatus("crossref", res.status, res.bodyText);
        
        await upsertFetchStatus({
          journalId,
          source: "crossref",
          status,
          httpStatus: res.status,
          errorMessage: res.ok ? null : `HTTP ${res.status}`,
          version,
        });
        
        await emitFetchSource(journalId, "crossref", status, res.status);
        return { status, httpStatus: res.status, bodyText: res.bodyText };
      } catch (e: any) {
        if (shouldStop() || isAbortError(e)) throw e;
        await upsertFetchStatus({
          journalId,
          source: "crossref",
          status: "failed",
          httpStatus: null,
          errorMessage: e?.message ?? String(e),
          version,
        });
        await emitFetchSource(journalId, "crossref", "failed", null);
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // DOAJ 抓取任务
    const fetchDoajTask = () => limiters.doaj!.schedule(async () => {
      if (shouldStop()) throw new Error("aborted");
      
      try {
        // 优先使用 ISSN，否则使用标题
        const res = primaryIssn
          ? await fetchDoajJournalByIssn({ issn: primaryIssn, signal: args.signal })
          : journalTitle
            ? await fetchDoajJournalByTitle({ title: journalTitle, signal: args.signal })
            : null;
        
        if (!res) {
          await upsertFetchStatus({
            journalId,
            source: "doaj",
            status: "no_data",
            httpStatus: null,
            errorMessage: "No ISSN or title available",
            version,
          });
          await emitFetchSource(journalId, "doaj", "no_data", null);
          return { status: "no_data" as FetchStatusType, httpStatus: null, bodyText: null };
        }
        
        const status = determineStatus("doaj", res.status, res.bodyText);
        await upsertFetchStatus({
          journalId,
          source: "doaj",
          status,
          httpStatus: res.status,
          errorMessage: res.ok ? null : `HTTP ${res.status}`,
          version,
        });
        
        await emitFetchSource(journalId, "doaj", status, res.status);
        return { status, httpStatus: res.status, bodyText: res.bodyText };
      } catch (e: any) {
        if (shouldStop() || isAbortError(e)) throw e;
        await upsertFetchStatus({
          journalId,
          source: "doaj",
          status: "failed",
          httpStatus: null,
          errorMessage: e?.message ?? String(e),
          version,
        });
        await emitFetchSource(journalId, "doaj", "failed", null);
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // NLM 抓取任务
    const fetchNlmTask = () => limiters.nlm!.schedule(async () => {
      if (shouldStop()) throw new Error("aborted");
      
      try {
        const res = primaryIssn
          ? await fetchNlmEsearch({ issn: primaryIssn, signal: args.signal })
          : journalTitle
            ? await fetchNlmEsearchByTitle({ title: journalTitle, signal: args.signal })
            : null;
        
        if (!res) {
          await upsertFetchStatus({
            journalId,
            source: "nlm",
            status: "no_data",
            httpStatus: null,
            errorMessage: "No ISSN or title available",
            version,
          });
          await emitFetchSource(journalId, "nlm", "no_data", null);
          return { status: "no_data" as FetchStatusType, httpStatus: null, bodyText: null };
        }
        
        const status = determineStatus("nlm", res.status, res.bodyText);
        await upsertFetchStatus({
          journalId,
          source: "nlm",
          status,
          httpStatus: res.status,
          errorMessage: res.ok ? null : `HTTP ${res.status}`,
          version,
        });
        
        await emitFetchSource(journalId, "nlm", status, res.status);
        return { status, httpStatus: res.status, bodyText: res.bodyText };
      } catch (e: any) {
        if (shouldStop() || isAbortError(e)) throw e;
        await upsertFetchStatus({
          journalId,
          source: "nlm",
          status: "failed",
          httpStatus: null,
          errorMessage: e?.message ?? String(e),
          version,
        });
        await emitFetchSource(journalId, "nlm", "failed", null);
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // Wikidata 抓取任务
    const fetchWikidataTask = () => limiters.wikidata!.schedule(async () => {
      if (shouldStop()) throw new Error("aborted");
      
      try {
        const res = primaryIssn
          ? await fetchWikidataByIssn({ issn: primaryIssn, signal: args.signal })
          : journalTitle
            ? await fetchWikidataByTitle({ title: journalTitle, signal: args.signal })
            : null;
        
        if (!res) {
          await upsertFetchStatus({
            journalId,
            source: "wikidata",
            status: "no_data",
            httpStatus: null,
            errorMessage: "No ISSN or title available",
            version,
          });
          await emitFetchSource(journalId, "wikidata", "no_data", null);
          return { status: "no_data" as FetchStatusType, httpStatus: null, bodyText: null };
        }
        
        const status = determineStatus("wikidata", res.status, res.bodyText);
        await upsertFetchStatus({
          journalId,
          source: "wikidata",
          status,
          httpStatus: res.status,
          errorMessage: res.ok ? null : `HTTP ${res.status}`,
          version,
        });
        
        await emitFetchSource(journalId, "wikidata", status, res.status);
        return { status, httpStatus: res.status, bodyText: res.bodyText };
      } catch (e: any) {
        if (shouldStop() || isAbortError(e)) throw e;
        await upsertFetchStatus({
          journalId,
          source: "wikidata",
          status: "failed",
          httpStatus: null,
          errorMessage: e?.message ?? String(e),
          version,
        });
        await emitFetchSource(journalId, "wikidata", "failed", null);
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // 4 个数据源完全并行执行
    const tasks: Promise<{ status: FetchStatusType; httpStatus: number | null; bodyText: string | null }>[] = [];
    const taskSources: SourceName[] = [];

    if (sourcesToFetch.includes("crossref")) {
      tasks.push(fetchCrossrefTask());
      taskSources.push("crossref");
    }
    if (sourcesToFetch.includes("doaj")) {
      tasks.push(fetchDoajTask());
      taskSources.push("doaj");
    }
    if (sourcesToFetch.includes("nlm")) {
      tasks.push(fetchNlmTask());
      taskSources.push("nlm");
    }
    if (sourcesToFetch.includes("wikidata")) {
      tasks.push(fetchWikidataTask());
      taskSources.push("wikidata");
    }

    const results = await Promise.all(tasks);
    for (let i = 0; i < taskSources.length; i++) {
      sourceResults[taskSources[i]] = results[i];
    }

    // 从已有数据中补充未抓取的数据源（一次查询替代逐条查询）
    const missingSources = FETCH_SOURCES.filter((s) => !sourceResults[s]);
    if (missingSources.length > 0) {
      const allStatuses = await getFetchStatusForJournal(journalId);
      const statusMap = new Map(allStatuses.map((s) => [s.source, s]));
      for (const source of missingSources) {
        const existing = statusMap.get(source);
        sourceResults[source] = {
          status: existing?.status ?? "pending",
          httpStatus: existing?.http_status ?? null,
          bodyText: null,
        };
      }
    }

    // 检查本次抓取是否有新的成功数据（有 bodyText 的成功结果）
    const hasNewSuccessData = taskSources.some((src, i) =>
      results[i].status === "success" && results[i].bodyText
    );

    // 仅在有新数据时才执行提取、合并和写入，避免无意义的全量 upsert
    if (hasNewSuccessData) {
      // 提取各数据源的数据
      const crossrefData = extractCrossref(sourceResults.crossref?.bodyText ?? null);
      const doajData = extractDoaj(sourceResults.doaj?.bodyText ?? null);
      const nlmData = extractNlmEsearch(sourceResults.nlm?.bodyText ?? null);
      const wikidataData = extractWikidata(sourceResults.wikidata?.bodyText ?? null);

      // 合并数据（使用已有的 existingJournal 作为 OpenAlex 数据）
      const merged = mergeJournalData({
        existing: existingJournal ?? undefined,
        crossref: crossrefData,
        doaj: doajData.inDoaj ? doajData : undefined,
        nlm: nlmData,
        wikidata: wikidataData.hasWikidata ? wikidataData : undefined,
      });

      // 更新期刊数据
      await upsertJournal({
        id: journalId,
        ...merged,
      });
    }

    // 计算是否成功（只检查 FETCH_SOURCES）
    const allSuccess = Object.values(sourceResults).every(
      (r) => r.status === "success" || r.status === "no_data"
    );
    await bumpRunCounters(args.runId, {
      processed: 1,
      succeeded: allSuccess ? 1 : 0,
      failed: allSuccess ? 0 : 1,
    });

    processed += 1;
    // 注意：total 在流水线模式下可能不准确，因为生产者还在产生数据
    args.emit({
      type: "fetch_progress",
      processed,
      total: totalProcessed + processed, // 使用已知的处理总数
      currentJournalId: journalId,
      at: nowTimestamp(),
    });
    
    // 每处理完一个期刊，推送统计数据
    await emitStatsUpdate();
  }

  try {
    // 流水线模式：循环轮询 pending 状态的期刊
    if (args.params.pipelineMode) {
      emitLog("info", "流水线模式：等待生产者产生数据...");
      
      let consecutiveEmptyPolls = 0;
      const maxEmptyPolls = 3; // 连续 3 次空轮询后检查生产者状态
      
      while (!shouldStop()) {
        // 获取当前 pending 的期刊
        const filterWithVersion: FetchFilter = {
          ...args.params.filter,
          sources: FETCH_SOURCES,
          statuses: ["pending"],
          version: version ?? undefined,
        };
        const journalIds = await getJournalIdsForFetch(filterWithVersion);
        
        if (journalIds.length === 0) {
          // 没有待处理的数据
          const producerDone = await isProducerCompleted(args.runId);
          
          if (producerDone) {
            // 生产者已完成，消费者也完成
            emitLog("info", "生产者已完成，所有数据处理完毕");
            break;
          }
          
          consecutiveEmptyPolls++;
          
          if (consecutiveEmptyPolls >= maxEmptyPolls) {
            // 等待生产者产生新数据
            await updateConsumerStatus(args.runId, "waiting");
            args.emit({ type: "fetch_waiting", reason: "等待生产者产生新数据", at: nowTimestamp() });
            emitLog("info", `等待生产者产生新数据，${pollIntervalMs / 1000}s 后重试...`);
          }
          
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          continue;
        }
        
        consecutiveEmptyPolls = 0;
        await updateConsumerStatus(args.runId, "running");
        
        // 更新总数
        await updateRun(args.runId, { total_journals: totalProcessed + journalIds.length });
        
        // 处理当前批次
        if (args.params.serialMode) {
          for (const journalId of journalIds) {
            if (shouldStop()) break;
            await processJournal(journalId);
          }
        } else {
          const limit = pLimit(concurrency);
          await Promise.allSettled(journalIds.map((id) => limit(() => processJournal(id))));
        }
        
        totalProcessed += processed;
        processed = 0;
      }
      
      processed = totalProcessed;
    } else {
      // 非流水线模式：一次性获取所有期刊
      const filterWithVersion: FetchFilter = {
        ...args.params.filter,
        sources: FETCH_SOURCES,
        version: version ?? undefined,
      };
      const journalIds = await getJournalIdsForFetch(filterWithVersion);
      const total = journalIds.length;
      
      emitLog("info", `共 ${total} 个期刊待处理`);
      await updateRun(args.runId, { total_journals: total });
      
      if (args.params.serialMode) {
        emitLog("info", "使用串行模式处理期刊");
        for (const journalId of journalIds) {
          if (shouldStop()) {
            emitLog("info", "收到停止信号，中断处理");
            break;
          }
          await processJournal(journalId);
        }
      } else {
        emitLog("info", "使用并行模式处理期刊");
        const limit = pLimit(concurrency);
        await Promise.allSettled(journalIds.map((id) => limit(() => processJournal(id))));
      }
    }

    // 检查是否是手动停止
    if (shouldStop()) {
      emitLog("info", `详情抓取被手动停止，共处理 ${processed} 个期刊`);
      return { status: "stopped", processed };
    }

    // 正常完成
    await updateConsumerStatus(args.runId, "completed");
    emitLog("info", `详情抓取完成，共处理 ${processed} 个期刊`);
    args.emit({ type: "fetch_done", processed, at: nowTimestamp() });

    return { status: "completed", processed };
  } catch (err: any) {
    emitLog("error", `详情抓取失败：${err?.message ?? String(err)}`);
    throw err;
  }
}
