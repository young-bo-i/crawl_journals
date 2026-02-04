import Bottleneck from "bottleneck";
import pLimit from "p-limit";
import {
  CORE_SOURCES,
  type FetchFilter,
  type FetchStatusType,
  type SourceName,
  type JournalRow,
  bumpRunCounters,
  getCurrentVersion,
  getFetchStatus,
  getJournal,
  getJournalIdsForFetch,
  getSourcesForJournal,
  updateRun,
  upsertFetchStatus,
  upsertJournal,
} from "@/server/db/repo";
import { fetchOpenAlexDetail, fetchOpenAlexDetailById } from "./sources/openalex";
import { fetchCrossrefJournal } from "./sources/crossref";
import { fetchDoajJournalByIssn, fetchDoajJournalByTitle } from "./sources/doaj";
import { fetchNlmEsearch, fetchNlmEsearchByTitle } from "./sources/nlm";
import { fetchWikidataByIssn, fetchWikidataByTitle } from "./sources/wikidata";
import {
  extractCrossref,
  extractDoaj,
  extractNlmEsearch,
  extractOpenAlex,
  extractWikidata,
  mergeJournalData,
} from "./indexer";
import { tryParseJson } from "@/server/util/json";
import { nowTimestamp } from "@/server/util/time";

export type FetchEvent =
  | { type: "fetch_progress"; processed: number; total: number; currentJournalId: string; at: number }
  | { type: "fetch_source"; journalId: string; source: SourceName; status: FetchStatusType; httpStatus: number | null; at: number }
  | { type: "fetch_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "fetch_done"; processed: number; at: number };

export type FetchParams = {
  concurrency?: number;
  qps?: Partial<Record<SourceName, number>>;
  filter?: FetchFilter;
  version?: string;
  serialMode?: boolean;
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
    case "openalex":
      return Boolean(json.id);
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
}): Promise<{ processed: number }> {
  const concurrency = Math.max(1, Math.min(100, args.params.concurrency ?? 30));

  // QPS 限制
  const defaultQps: Record<SourceName, number> = {
    openalex: 10,
    crossref: 8,
    doaj: 8,
    nlm: 10,
    wikidata: 5,
    wikipedia: 3,
  };
  
  const qps = { ...defaultQps, ...(args.params.qps || {}) };

  // 为每个数据源配置独立的并发控制
  const limiterConfigs: Record<SourceName, { minTime: number; maxConcurrent: number }> = {
    openalex: { minTime: Math.ceil(1000 / qps.openalex), maxConcurrent: 30 },
    crossref: { minTime: Math.ceil(1000 / qps.crossref), maxConcurrent: 25 },
    doaj: { minTime: Math.ceil(1000 / qps.doaj), maxConcurrent: 25 },
    nlm: { minTime: Math.ceil(1000 / qps.nlm), maxConcurrent: 30 },
    wikidata: { minTime: Math.ceil(1000 / qps.wikidata), maxConcurrent: 20 },
    wikipedia: { minTime: Math.ceil(1000 / qps.wikipedia), maxConcurrent: 10 },
  };

  const limiters: Record<SourceName, Bottleneck> = {} as any;
  for (const source of CORE_SOURCES) {
    limiters[source] = new Bottleneck(limiterConfigs[source]);
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

  // 获取当前版本号
  const version = args.params.version ?? await getCurrentVersion();

  // 获取要处理的期刊 ID 列表
  const filterWithVersion: FetchFilter = {
    ...args.params.filter,
    version: version ?? undefined,
  };
  const journalIds = await getJournalIdsForFetch(filterWithVersion);
  const total = journalIds.length;

  const modeDesc = args.params.serialMode ? "串行模式" : "并行模式";
  emitLog("info", `开始详情抓取，版本号=${version ?? "无"}，共 ${total} 个期刊，${modeDesc}，并发数 ${concurrency}`);
  await updateRun(args.runId, { total_journals: total });

  let processed = 0;

  async function processJournal(journalId: string) {
    if (shouldStop()) return;

    await updateRun(args.runId, { current_journal_id: journalId });

    // 获取现有期刊数据
    const existingJournal = await getJournal(journalId);
    const issn_l = existingJournal?.issn_l;
    const issns = existingJournal?.issns ?? [];
    const primaryIssn = issn_l ?? issns[0] ?? null;

    // 获取需要抓取的数据源
    const sourcesToFetch = await getSourcesForJournal(journalId, args.params.filter);
    if (sourcesToFetch.length === 0) return;

    // 用于存储各数据源的结果
    const sourceResults: Record<SourceName, { status: FetchStatusType; httpStatus: number | null; bodyText: string | null }> = {} as any;

    // 用于存储标题（供其他数据源使用）
    let journalTitle: string | null = existingJournal?.oa_display_name ?? existingJournal?.title ?? null;

    // OpenAlex 抓取任务
    const fetchOpenAlexTask = () => limiters.openalex.schedule(async () => {
      if (shouldStop()) throw new Error("aborted");
      try {
        // 使用 OpenAlex ID 查询
        const res = await fetchOpenAlexDetailById({ openalexId: journalId, signal: args.signal });
        const status = determineStatus("openalex", res.status, res.bodyText);
        
        await upsertFetchStatus({
          journalId,
          source: "openalex",
          status,
          httpStatus: res.status,
          errorMessage: res.ok ? null : `HTTP ${res.status}`,
          version,
        });
        
        args.emit({ type: "fetch_source", journalId, source: "openalex", status, httpStatus: res.status, at: nowTimestamp() });
        
        if (status === "success" && res.bodyText) {
          const data = tryParseJson<any>(res.bodyText);
          journalTitle = data?.display_name ?? journalTitle;
        }
        
        return { status, httpStatus: res.status, bodyText: res.bodyText };
      } catch (e: any) {
        if (shouldStop() || isAbortError(e)) throw e;
        await upsertFetchStatus({
          journalId,
          source: "openalex",
          status: "failed",
          httpStatus: null,
          errorMessage: e?.message ?? String(e),
          version,
        });
        args.emit({ type: "fetch_source", journalId, source: "openalex", status: "failed", httpStatus: null, at: nowTimestamp() });
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // Crossref 抓取任务（需要 ISSN）
    const fetchCrossrefTask = () => limiters.crossref.schedule(async () => {
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
        args.emit({ type: "fetch_source", journalId, source: "crossref", status: "no_data", httpStatus: null, at: nowTimestamp() });
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
        
        args.emit({ type: "fetch_source", journalId, source: "crossref", status, httpStatus: res.status, at: nowTimestamp() });
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
        args.emit({ type: "fetch_source", journalId, source: "crossref", status: "failed", httpStatus: null, at: nowTimestamp() });
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // DOAJ 抓取任务
    const fetchDoajTask = () => limiters.doaj.schedule(async () => {
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
          args.emit({ type: "fetch_source", journalId, source: "doaj", status: "no_data", httpStatus: null, at: nowTimestamp() });
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
        
        args.emit({ type: "fetch_source", journalId, source: "doaj", status, httpStatus: res.status, at: nowTimestamp() });
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
        args.emit({ type: "fetch_source", journalId, source: "doaj", status: "failed", httpStatus: null, at: nowTimestamp() });
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // NLM 抓取任务
    const fetchNlmTask = () => limiters.nlm.schedule(async () => {
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
          args.emit({ type: "fetch_source", journalId, source: "nlm", status: "no_data", httpStatus: null, at: nowTimestamp() });
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
        
        args.emit({ type: "fetch_source", journalId, source: "nlm", status, httpStatus: res.status, at: nowTimestamp() });
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
        args.emit({ type: "fetch_source", journalId, source: "nlm", status: "failed", httpStatus: null, at: nowTimestamp() });
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // Wikidata 抓取任务
    const fetchWikidataTask = () => limiters.wikidata.schedule(async () => {
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
          args.emit({ type: "fetch_source", journalId, source: "wikidata", status: "no_data", httpStatus: null, at: nowTimestamp() });
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
        
        args.emit({ type: "fetch_source", journalId, source: "wikidata", status, httpStatus: res.status, at: nowTimestamp() });
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
        args.emit({ type: "fetch_source", journalId, source: "wikidata", status: "failed", httpStatus: null, at: nowTimestamp() });
        return { status: "failed" as FetchStatusType, httpStatus: null, bodyText: null };
      }
    });

    // 先执行 OpenAlex 获取基础信息
    if (sourcesToFetch.includes("openalex")) {
      sourceResults.openalex = await fetchOpenAlexTask();
    }

    // 并行执行其他数据源
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

    // 从已有数据中补充未抓取的数据源
    for (const source of CORE_SOURCES) {
      if (!sourceResults[source]) {
        const existingStatus = await getFetchStatus(journalId, source);
        sourceResults[source] = {
          status: existingStatus?.status ?? "pending",
          httpStatus: existingStatus?.http_status ?? null,
          bodyText: null,
        };
      }
    }

    // 提取各数据源的数据
    const openalexData = extractOpenAlex(sourceResults.openalex?.bodyText ?? null);
    const crossrefData = extractCrossref(sourceResults.crossref?.bodyText ?? null);
    const doajData = extractDoaj(sourceResults.doaj?.bodyText ?? null);
    const nlmData = extractNlmEsearch(sourceResults.nlm?.bodyText ?? null);
    const wikidataData = extractWikidata(sourceResults.wikidata?.bodyText ?? null);

    // 合并数据
    const merged = mergeJournalData({
      openalex: openalexData,
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

    // 计算是否成功
    const allSuccess = Object.values(sourceResults).every(
      (r) => r.status === "success" || r.status === "no_data"
    );
    await bumpRunCounters(args.runId, {
      processed: 1,
      succeeded: allSuccess ? 1 : 0,
      failed: allSuccess ? 0 : 1,
    });

    processed += 1;
    args.emit({
      type: "fetch_progress",
      processed,
      total,
      currentJournalId: journalId,
      at: nowTimestamp(),
    });
  }

  try {
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

    emitLog("info", `详情抓取完成，共处理 ${processed} 个期刊`);
    args.emit({ type: "fetch_done", processed, at: nowTimestamp() });

    return { processed };
  } catch (err: any) {
    emitLog("error", `详情抓取失败：${err?.message ?? String(err)}`);
    throw err;
  }
}
