import crypto from "node:crypto";
import { getDb, query, queryOne, execute, RowDataPacket } from "./mysql";
import { nowLocal } from "@/server/util/time";

// ============ 类型定义 ============

export type CrawlRunStatus = "running" | "stopped" | "completed" | "failed";
export type CrawlPhase = "collecting" | "fetching" | "completed" | "failed" | "stopped";
export type SourceName = "openalex" | "crossref" | "doaj" | "nlm" | "wikidata" | "wikipedia";
export type FetchStatusType = "pending" | "success" | "no_data" | "failed";

// 核心数据源（常规爬取使用，不包含 Wikipedia）
export const CORE_SOURCES: SourceName[] = [
  "openalex",
  "crossref",
  "doaj",
  "nlm",
  "wikidata",
];

// 详情抓取数据源（不含 openalex，用于消费者线程）
export const FETCH_SOURCES: SourceName[] = [
  "crossref",
  "doaj",
  "nlm",
  "wikidata",
];

// 所有数据源
export const ALL_SOURCES: SourceName[] = [...CORE_SOURCES, "wikipedia"];

// 生产者状态（OpenAlex 收集线程）
export type ProducerStatus = "running" | "paused" | "completed";

// 消费者状态（其他数据源抓取线程）
export type ConsumerStatus = "running" | "waiting" | "completed";

// ============ 期刊数据类型 ============

export type JournalRow = {
  id: string;
  issn_l: string | null;
  issns: string[] | null;
  
  // OpenAlex 字段（基础数据）
  oa_display_name: string | null;
  oa_type: string | null;
  oa_alternate_titles: string[] | null;
  oa_host_organization: string | null;
  oa_host_organization_id: string | null;
  oa_host_organization_lineage: any[] | null;
  oa_country_code: string | null;
  oa_homepage_url: string | null;
  oa_works_count: number | null;
  oa_cited_by_count: number | null;
  oa_works_api_url: string | null;
  oa_apc_prices: any[] | null;
  oa_apc_usd: number | null;
  oa_counts_by_year: any[] | null;
  oa_first_publication_year: number | null;
  oa_last_publication_year: number | null;
  oa_is_core: boolean | null;
  oa_is_oa: boolean | null;
  oa_is_high_oa_rate: boolean | null;
  oa_is_high_oa_rate_since_year: number | null;
  oa_is_in_doaj: boolean | null;
  oa_is_in_doaj_since_year: number | null;
  oa_is_in_scielo: boolean | null;
  oa_is_ojs: boolean | null;
  oa_oa_flip_year: number | null;
  oa_oa_works_count: number | null;
  oa_societies: any[] | null;
  oa_summary_stats: any | null;
  oa_topics: any[] | null;
  oa_topic_share: any[] | null;
  oa_ids: any | null;
  oa_created_date: string | null;
  oa_updated_date: string | null;
  
  // Crossref 字段
  cr_title: string | null;
  cr_publisher: string | null;
  cr_subjects: any[] | null;
  cr_issn_types: any[] | null;
  cr_url: string | null;
  cr_last_status_check_time: number | null;
  cr_counts: any | null;
  cr_breakdowns: any | null;
  cr_coverage: any | null;
  cr_coverage_type: any | null;
  cr_flags: any | null;
  
  // DOAJ 字段
  doaj_title: string | null;
  doaj_publisher: string | null;
  doaj_country: string | null;
  doaj_languages: string[] | null;
  doaj_subjects: any[] | null;
  doaj_links: any[] | null;
  doaj_apc: any | null;
  doaj_license: any[] | null;
  doaj_alternative_title: string | null;
  doaj_article: any | null;
  doaj_boai: boolean | null;
  doaj_copyright: any | null;
  doaj_deposit_policy: any[] | null;
  doaj_discontinued_date: string | null;
  doaj_editorial: any | null;
  doaj_eissn: string | null;
  doaj_pissn: string | null;
  doaj_institution: any | null;
  doaj_is_replaced_by: any[] | null;
  doaj_keywords: string[] | null;
  doaj_labels: any[] | null;
  doaj_oa_start: any | null;
  doaj_other_charges: any | null;
  doaj_pid_scheme: any[] | null;
  doaj_plagiarism: any | null;
  doaj_preservation: any | null;
  doaj_publication_time_weeks: number | null;
  doaj_ref: any | null;
  doaj_replaces: any[] | null;
  doaj_waiver: any | null;
  
  // NLM 字段
  nlm_in_catalog: boolean;
  nlm_uids: string[] | null;
  
  // Wikidata 字段
  wikidata_has_entity: boolean;
  wikidata_homepage: string | null;
  
  // Wikipedia 字段
  wikipedia_has_article: boolean;
  wikipedia_article_title: string | null;
  wikipedia_extract: string | null;
  wikipedia_description: string | null;
  wikipedia_thumbnail: string | null;
  wikipedia_categories: string[] | null;
  wikipedia_infobox: any | null;
  
  // 封面图片
  cover_image: Buffer | null;
  cover_image_type: string | null;
  cover_image_name: string | null;
  
  // 用户自定义字段
  custom_title: string | null;
  custom_publisher: string | null;
  custom_country: string | null;
  custom_homepage: string | null;
  custom_description: string | null;
  custom_notes: string | null;
  custom_updated_at: string | null;
  
  // 元信息
  created_at: string;
  updated_at: string;
};

// 期刊表所有字段（不包含 BLOB 字段 cover_image）
// 用于 SELECT 查询，避免 BLOB 数据导致的问题
const JOURNAL_SELECT_FIELDS = `
  id, issn_l, issns,
  oa_display_name, oa_type, oa_alternate_titles, oa_host_organization, oa_host_organization_id,
  oa_host_organization_lineage, oa_country_code, oa_homepage_url,
  oa_works_count, oa_cited_by_count, oa_works_api_url, oa_apc_prices, oa_apc_usd, oa_counts_by_year,
  oa_first_publication_year, oa_last_publication_year, oa_is_core, oa_is_oa, oa_is_high_oa_rate,
  oa_is_high_oa_rate_since_year, oa_is_in_doaj, oa_is_in_doaj_since_year, oa_is_in_scielo, oa_is_ojs,
  oa_oa_flip_year, oa_oa_works_count, oa_societies, oa_summary_stats, oa_topics, oa_topic_share,
  oa_ids, oa_created_date, oa_updated_date,
  cr_title, cr_publisher, cr_subjects, cr_issn_types, cr_url, cr_last_status_check_time,
  cr_counts, cr_breakdowns, cr_coverage, cr_coverage_type, cr_flags,
  doaj_title, doaj_publisher, doaj_country, doaj_languages, doaj_subjects, doaj_links,
  doaj_apc, doaj_license, doaj_alternative_title, doaj_article, doaj_boai, doaj_copyright,
  doaj_deposit_policy, doaj_discontinued_date, doaj_editorial, doaj_eissn, doaj_pissn,
  doaj_institution, doaj_is_replaced_by, doaj_keywords, doaj_labels, doaj_oa_start,
  doaj_other_charges, doaj_pid_scheme, doaj_plagiarism, doaj_preservation, doaj_publication_time_weeks,
  doaj_ref, doaj_replaces, doaj_waiver,
  nlm_in_catalog, nlm_uids,
  wikidata_has_entity, wikidata_homepage,
  wikipedia_has_article, wikipedia_article_title, wikipedia_extract, wikipedia_description,
  wikipedia_thumbnail, wikipedia_categories, wikipedia_infobox,
  cover_image_type, cover_image_name,
  custom_title, custom_publisher, custom_country, custom_homepage, custom_description, custom_notes, custom_updated_at,
  created_at, updated_at
`.replace(/\s+/g, " ").trim();

export type CrawlRunRow = {
  id: string;
  type: "full" | "incremental" | "wikipedia";
  phase: CrawlPhase;
  status: CrawlRunStatus;
  started_at: string;
  ended_at: string | null;
  openalex_cursor: string | null;
  params_json: any | null;
  total_journals: number;
  processed: number;
  succeeded: number;
  failed: number;
  current_journal_id: string | null;
  last_error: string | null;
  // 流水线状态字段
  producer_status: ProducerStatus | null;
  consumer_status: ConsumerStatus | null;
  producer_error: string | null;
  collected_count: number;
};

export type FetchStatusRow = {
  id: string;
  journal_id: string;
  source: SourceName;
  status: FetchStatusType;
  http_status: number | null;
  error_message: string | null;
  retry_count: number;
  version: string | null;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

// ============ 版本号管理 ============

export function generateVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function formatVersion(version: string | null): string | null {
  if (!version || version.length !== 14) return version;
  return `${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)} ${version.slice(8, 10)}:${version.slice(10, 12)}:${version.slice(12, 14)}`;
}

export async function getCurrentVersion(): Promise<string | null> {
  const row = await queryOne<RowDataPacket>(
    "SELECT value FROM system_config WHERE `key` = 'current_version'"
  );
  return row?.value ?? null;
}

export async function setCurrentVersion(version: string): Promise<void> {
  const now = nowLocal();
  await execute(
    `INSERT INTO system_config(\`key\`, value, updated_at)
     VALUES('current_version', ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
    [version, now]
  );
}

// ============ 数据清理 ============

/**
 * 清空所有数据（包括任务记录），但保留系统设置
 * 用于：
 * 1. 开始新的全量抓取之前（先清空再创建新任务）
 * 2. 用户手动点击"清空数据"按钮时
 */
export async function clearAllData(): Promise<void> {
  const pool = await getDb();
  await pool.execute("SET FOREIGN_KEY_CHECKS = 0");
  await pool.execute("TRUNCATE TABLE fetch_status");
  await pool.execute("TRUNCATE TABLE issn_aliases");
  await pool.execute("TRUNCATE TABLE journals");
  // 只清除 system_config 中的版本号，保留用户配置（API Keys、代理等）
  await pool.execute(
    "DELETE FROM system_config WHERE `key` = 'current_version'"
  );
  await pool.execute("TRUNCATE TABLE crawl_runs");
  await pool.execute("SET FOREIGN_KEY_CHECKS = 1");
  console.log("[clearAllData] 已清空所有数据（保留系统设置）");
}

// ============ 爬取任务管理 ============

export async function createRun(params: unknown, type: "full" | "incremental" | "wikipedia" = "full"): Promise<CrawlRunRow> {
  const id = crypto.randomUUID();
  const now = nowLocal();
  const phase: CrawlPhase = type === "full" ? "collecting" : "fetching";
  
  // 全量模式：生产者 running，消费者 waiting
  // 其他模式：生产者 completed（无需收集），消费者 running
  const producerStatus: ProducerStatus = type === "full" ? "running" : "completed";
  const consumerStatus: ConsumerStatus = type === "full" ? "waiting" : "running";
  
  console.log(`[createRun] 开始创建任务: id=${id}, type=${type}, phase=${phase}`);
  
  try {
    const result = await execute(
      `INSERT INTO crawl_runs(id, type, phase, status, started_at, params_json, total_journals, processed, succeeded, failed, producer_status, consumer_status, collected_count)
       VALUES(?, ?, ?, 'running', ?, ?, 0, 0, 0, 0, ?, ?, 0)`,
      [id, type, phase, now, JSON.stringify(params), producerStatus, consumerStatus]
    );
    console.log(`[createRun] INSERT 执行完成: affectedRows=${result.affectedRows}`);
  } catch (err: any) {
    console.error(`[createRun] INSERT 失败:`, err.message);
    throw err;
  }
  
  const row = await queryOne<CrawlRunRow & RowDataPacket>(
    "SELECT * FROM crawl_runs WHERE id = ?",
    [id]
  );
  
  if (row) {
    console.log(`[createRun] 任务创建成功: id=${row.id}, status=${row.status}`);
  } else {
    console.error(`[createRun] 警告：INSERT 后查询不到记录！id=${id}`);
  }
  
  return row!;
}

export async function getRun(runId: string): Promise<CrawlRunRow | null> {
  const row = await queryOne<CrawlRunRow & RowDataPacket>(
    "SELECT * FROM crawl_runs WHERE id = ?",
    [runId]
  );
  return row ?? null;
}

export async function updateRun(runId: string, patch: Partial<CrawlRunRow>): Promise<void> {
  const keys = Object.keys(patch) as (keyof CrawlRunRow)[];
  if (keys.length === 0) return;
  
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => {
    const v = patch[k];
    if (v === undefined) return null;
    if (typeof v === "object" && v !== null) return JSON.stringify(v);
    return v;
  });
  
  await execute(
    `UPDATE crawl_runs SET ${sets} WHERE id = ?`,
    [...values, runId]
  );
}

export async function bumpRunCounters(
  runId: string,
  delta: { processed?: number; succeeded?: number; failed?: number }
): Promise<void> {
  await execute(
    `UPDATE crawl_runs
     SET processed = processed + ?,
         succeeded = succeeded + ?,
         failed = failed + ?
     WHERE id = ?`,
    [delta.processed ?? 0, delta.succeeded ?? 0, delta.failed ?? 0, runId]
  );
}

export async function recoverStaleRunningRuns(): Promise<number> {
  const now = nowLocal();
  const result = await execute(
    `UPDATE crawl_runs 
     SET status = 'stopped', ended_at = ?
     WHERE status = 'running'`,
    [now]
  );
  return result.affectedRows;
}

export async function getLastStoppedRun(): Promise<CrawlRunRow | null> {
  const row = await queryOne<CrawlRunRow & RowDataPacket>(
    `SELECT * FROM crawl_runs 
     WHERE status IN ('stopped', 'failed') 
     ORDER BY started_at DESC LIMIT 1`
  );
  return row ?? null;
}

/**
 * 获取最近的任务（不论状态）
 */
export async function getLatestRun(): Promise<CrawlRunRow | null> {
  try {
    const row = await queryOne<CrawlRunRow & RowDataPacket>(
      `SELECT * FROM crawl_runs ORDER BY started_at DESC LIMIT 1`
    );
    if (row) {
      console.log(`[getLatestRun] Found run: id=${row.id}, status=${row.status}, phase=${row.phase}`);
    } else {
      console.log(`[getLatestRun] No runs found in database`);
    }
    return row ?? null;
  } catch (error) {
    console.error(`[getLatestRun] Error:`, error);
    return null;
  }
}

// ============ 期刊 CRUD ============

export async function ensureJournal(journalId: string): Promise<void> {
  const now = nowLocal();
  await execute(
    `INSERT INTO journals(id, created_at, updated_at)
     VALUES(?, ?, ?)
     ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
    [journalId, now, now]
  );
}

export async function getJournal(journalId: string): Promise<JournalRow | null> {
  const row = await queryOne<JournalRow & RowDataPacket>(
    `SELECT ${JOURNAL_SELECT_FIELDS} FROM journals WHERE id = ?`,
    [journalId]
  );
  if (!row) return null;
  
  // 解析 JSON 字段
  return parseJournalRow(row);
}

function parseJournalRow(row: any): JournalRow {
  const jsonFields = [
    "issns", "languages", "subjects", "oa_alternate_titles", "oa_host_organization_lineage",
    "oa_apc_prices", "oa_counts_by_year", "oa_societies", "oa_summary_stats", "oa_topics",
    "oa_topic_share", "oa_ids", "cr_subjects", "cr_issn_types", "cr_counts", "cr_breakdowns",
    "cr_coverage", "cr_coverage_type", "cr_flags", "doaj_languages", "doaj_subjects",
    "doaj_links", "doaj_apc", "doaj_license", "doaj_article", "doaj_copyright",
    "doaj_deposit_policy", "doaj_editorial", "doaj_institution", "doaj_is_replaced_by",
    "doaj_keywords", "doaj_labels", "doaj_oa_start", "doaj_other_charges", "doaj_pid_scheme",
    "doaj_plagiarism", "doaj_preservation", "doaj_ref", "doaj_replaces", "doaj_waiver",
    "nlm_uids", "wikipedia_categories", "wikipedia_infobox", "field_sources"
  ];
  
  for (const field of jsonFields) {
    if (row[field] && typeof row[field] === "string") {
      try {
        row[field] = JSON.parse(row[field]);
      } catch {
        // 保持原值
      }
    }
  }
  
  // 转换布尔字段
  const boolFields = [
    "oa_is_core", "oa_is_oa", "oa_is_high_oa_rate", "oa_is_in_doaj",
    "oa_is_in_scielo", "oa_is_ojs", "doaj_boai", "nlm_in_catalog", "wikidata_has_entity",
    "wikipedia_has_article"
  ];
  
  for (const field of boolFields) {
    if (row[field] !== null && row[field] !== undefined) {
      row[field] = Boolean(row[field]);
    }
  }
  
  return row as JournalRow;
}

export async function upsertJournal(data: Partial<JournalRow> & { id: string }): Promise<void> {
  const now = nowLocal();
  const fields: string[] = ["id", "updated_at"];
  const values: any[] = [data.id, now];
  const updates: string[] = ["updated_at = VALUES(updated_at)"];
  
  // 构建字段列表
  const allFields = Object.keys(data).filter(k => k !== "id" && k !== "created_at" && k !== "updated_at");
  
  for (const field of allFields) {
    const value = (data as any)[field];
    fields.push(field);
    
    // JSON 字段需要序列化
    if (value !== null && value !== undefined && typeof value === "object") {
      values.push(JSON.stringify(value));
    } else {
      values.push(value ?? null);
    }
    
    updates.push(`${field} = VALUES(${field})`);
  }
  
  // 添加 created_at
  fields.push("created_at");
  values.push(now);
  
  const placeholders = fields.map(() => "?").join(", ");
  const sql = `
    INSERT INTO journals(${fields.join(", ")})
    VALUES(${placeholders})
    ON DUPLICATE KEY UPDATE ${updates.join(", ")}
  `;
  
  await execute(sql, values);
}

// ============ ISSN 别名管理 ============

export async function upsertAlias(args: {
  issn: string;
  journalId: string;
  kind: "print" | "electronic" | "linking" | "unknown";
  source: string;
}): Promise<void> {
  const now = nowLocal();
  await execute(
    `INSERT INTO issn_aliases(issn, journal_id, kind, source, created_at)
     VALUES(?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE journal_id = VALUES(journal_id), kind = VALUES(kind)`,
    [args.issn, args.journalId, args.kind, args.source, now]
  );
}

export async function resolveJournalId(issnOrId: string): Promise<string | null> {
  // 先检查是否是 OpenAlex ID
  if (issnOrId.startsWith("S") && /^S\d+$/.test(issnOrId)) {
    const journal = await queryOne<RowDataPacket>(
      "SELECT id FROM journals WHERE id = ?",
      [issnOrId]
    );
    if (journal) return journal.id;
  }
  
  // 检查 ISSN 别名
  const alias = await queryOne<RowDataPacket>(
    "SELECT journal_id FROM issn_aliases WHERE issn = ?",
    [issnOrId]
  );
  if (alias) return alias.journal_id;
  
  // 检查 issn_l
  const journal = await queryOne<RowDataPacket>(
    "SELECT id FROM journals WHERE issn_l = ?",
    [issnOrId]
  );
  if (journal) return journal.id;
  
  return null;
}

export async function getAliasesByJournalId(journalId: string): Promise<Array<{ issn: string; kind: string; source: string }>> {
  const rows = await query<RowDataPacket[]>(
    "SELECT issn, kind, source FROM issn_aliases WHERE journal_id = ? ORDER BY issn",
    [journalId]
  );
  return rows.map(r => ({ issn: r.issn, kind: r.kind, source: r.source }));
}

// ============ 抓取状态管理 ============

export async function initFetchStatusForJournal(
  journalId: string,
  version?: string,
  sources: SourceName[] = CORE_SOURCES
): Promise<void> {
  const now = nowLocal();
  
  for (const source of sources) {
    if (version) {
      await execute(
        `INSERT INTO fetch_status(id, journal_id, source, status, retry_count, version, created_at, updated_at)
         VALUES(?, ?, ?, 'pending', 0, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status = 'pending',
           retry_count = 0,
           version = VALUES(version),
           http_status = NULL,
           error_message = NULL,
           last_fetched_at = NULL,
           updated_at = VALUES(updated_at)`,
        [crypto.randomUUID(), journalId, source, version, now, now]
      );
    } else {
      await execute(
        `INSERT IGNORE INTO fetch_status(id, journal_id, source, status, retry_count, created_at, updated_at)
         VALUES(?, ?, ?, 'pending', 0, ?, ?)`,
        [crypto.randomUUID(), journalId, source, now, now]
      );
    }
  }
}

export async function upsertFetchStatus(args: {
  journalId: string;
  source: SourceName;
  status: FetchStatusType;
  httpStatus?: number | null;
  errorMessage?: string | null;
  version?: string | null;
}): Promise<void> {
  const now = nowLocal();
  const id = crypto.randomUUID();
  
  await execute(
    `INSERT INTO fetch_status(id, journal_id, source, status, http_status, error_message, retry_count, version, last_fetched_at, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       http_status = VALUES(http_status),
       error_message = VALUES(error_message),
       retry_count = retry_count + 1,
       version = COALESCE(VALUES(version), version),
       last_fetched_at = VALUES(last_fetched_at),
       updated_at = VALUES(updated_at)`,
    [
      id,
      args.journalId,
      args.source,
      args.status,
      args.httpStatus ?? null,
      args.errorMessage ?? null,
      args.version ?? null,
      now,
      now,
      now,
    ]
  );
}

export async function getFetchStatus(
  journalId: string,
  source: SourceName
): Promise<FetchStatusRow | null> {
  const row = await queryOne<FetchStatusRow & RowDataPacket>(
    "SELECT * FROM fetch_status WHERE journal_id = ? AND source = ?",
    [journalId, source]
  );
  return row ?? null;
}

export async function getFetchStatusForJournal(journalId: string): Promise<FetchStatusRow[]> {
  const rows = await query<(FetchStatusRow & RowDataPacket)[]>(
    "SELECT * FROM fetch_status WHERE journal_id = ? ORDER BY source",
    [journalId]
  );
  return rows;
}

export type SourceStats = {
  source: SourceName;
  pending: number;
  success: number;
  no_data: number;
  failed: number;
};

export async function getFetchStatsBySource(): Promise<SourceStats[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT source, status, COUNT(1) as count
     FROM fetch_status
     GROUP BY source, status
     ORDER BY source, status`
  );
  
  const statsMap = new Map<SourceName, SourceStats>();
  for (const source of ALL_SOURCES) {
    statsMap.set(source, { source, pending: 0, success: 0, no_data: 0, failed: 0 });
  }
  
  for (const row of rows) {
    const stat = statsMap.get(row.source as SourceName);
    if (stat) {
      switch (row.status) {
        case "pending": stat.pending = row.count; break;
        case "success": stat.success = row.count; break;
        case "no_data": stat.no_data = row.count; break;
        case "failed": stat.failed = row.count; break;
      }
    }
  }
  
  return Array.from(statsMap.values());
}

// ============ 期刊列表查询 ============

// 可排序字段
export type SortField = 
  | "id" | "issn_l" | "oa_display_name" | "oa_host_organization" | "oa_country_code"
  | "oa_works_count" | "oa_cited_by_count" | "oa_apc_usd"
  | "oa_first_publication_year" | "oa_last_publication_year"
  | "oa_oa_works_count" | "oa_created_date" | "oa_updated_date"
  | "doaj_publication_time_weeks"
  | "created_at" | "updated_at";

export type SortOrder = "asc" | "desc";

// 允许的排序字段列表（用于安全验证）
const ALLOWED_SORT_FIELDS: string[] = [
  "id", "issn_l", "title", "publisher", "country",
  "oa_works_count", "oa_cited_by_count", "oa_apc_usd",
  "oa_first_publication_year", "oa_last_publication_year",
  "oa_oa_works_count", "oa_created_date", "oa_updated_date",
  "doaj_publication_time_weeks",
  "created_at", "updated_at",
];

export type QueryJournalsArgs = {
  q?: string | null;
  page: number;
  pageSize: number;
  // 布尔筛选
  inDoaj?: boolean;
  inNlm?: boolean;
  hasWikidata?: boolean;
  hasWikipedia?: boolean;
  isOpenAccess?: boolean;
  isCore?: boolean;
  isOa?: boolean;
  inScielo?: boolean;
  isOjs?: boolean;
  doajBoai?: boolean;
  inScimago?: boolean; // SCImago 优先期刊筛选
  hasCover?: boolean;  // 是否有封面图片
  // 字符串筛选
  country?: string;
  oaType?: string;
  // 数值范围筛选
  minWorksCount?: number;
  maxWorksCount?: number;
  minCitedByCount?: number;
  maxCitedByCount?: number;
  minFirstYear?: number;
  maxFirstYear?: number;
  // 排序
  sortBy?: SortField;
  sortOrder?: SortOrder;
  // 字段选择
  fields?: string[];
};

export async function queryJournals(args: QueryJournalsArgs): Promise<{ total: number; rows: JournalRow[] }> {
  const where: string[] = [];
  const params: any[] = [];

  // 关键词搜索
  if (args.q) {
    const q = args.q.trim();
    const like = `%${q}%`;
    
    // ID/ISSN 使用 LIKE 精确匹配
    // 标题使用全文索引 BOOLEAN MODE + 双引号进行短语匹配（更精确且快速）
    // 双引号要求完整短语匹配，而不是单独词匹配
    const phraseQuery = `"${q.replace(/"/g, '')}"`;  // 移除用户输入中的引号，避免 SQL 注入
    
    where.push(`(
      id LIKE ? OR issn_l LIKE ? OR doaj_eissn LIKE ? OR doaj_pissn LIKE ?
      OR MATCH(oa_display_name) AGAINST(? IN BOOLEAN MODE)
      OR MATCH(cr_title) AGAINST(? IN BOOLEAN MODE)
      OR MATCH(doaj_title) AGAINST(? IN BOOLEAN MODE)
    )`);
    params.push(like, like, like, like, phraseQuery, phraseQuery, phraseQuery);
  }
  
  // 布尔筛选
  const boolFilters: Array<[string, boolean | undefined, string]> = [
    ["oa_is_in_doaj", args.inDoaj, "oa_is_in_doaj"],
    ["nlm_in_catalog", args.inNlm, "nlm_in_catalog"],
    ["wikidata_has_entity", args.hasWikidata, "wikidata_has_entity"],
    ["wikipedia_has_article", args.hasWikipedia, "wikipedia_has_article"],
    ["oa_is_oa", args.isOpenAccess, "oa_is_oa"],
    ["oa_is_core", args.isCore, "oa_is_core"],
    ["oa_is_oa", args.isOa, "oa_is_oa"],
    ["oa_is_in_scielo", args.inScielo, "oa_is_in_scielo"],
    ["oa_is_ojs", args.isOjs, "oa_is_ojs"],
    ["doaj_boai", args.doajBoai, "doaj_boai"],
  ];
  
  for (const [, value, column] of boolFilters) {
    if (value !== null && value !== undefined) {
      where.push(`${column} = ?`);
      params.push(value ? 1 : 0);
    }
  }
  
  // 字符串筛选
  if (args.country) {
    where.push("oa_country_code = ?");
    params.push(args.country);
  }
  
  if (args.oaType) {
    where.push("oa_type = ?");
    params.push(args.oaType);
  }
  
  // 数值范围筛选
  if (args.minWorksCount !== undefined) {
    where.push("oa_works_count >= ?");
    params.push(args.minWorksCount);
  }
  if (args.maxWorksCount !== undefined) {
    where.push("oa_works_count <= ?");
    params.push(args.maxWorksCount);
  }
  if (args.minCitedByCount !== undefined) {
    where.push("oa_cited_by_count >= ?");
    params.push(args.minCitedByCount);
  }
  if (args.maxCitedByCount !== undefined) {
    where.push("oa_cited_by_count <= ?");
    params.push(args.maxCitedByCount);
  }
  if (args.minFirstYear !== undefined) {
    where.push("oa_first_publication_year >= ?");
    params.push(args.minFirstYear);
  }
  if (args.maxFirstYear !== undefined) {
    where.push("oa_first_publication_year <= ?");
    params.push(args.maxFirstYear);
  }

  // 封面图片筛选（使用 cover_image_name 而非 BLOB 列 cover_image，可走索引）
  if (args.hasCover !== undefined) {
    if (args.hasCover) {
      where.push("journals.cover_image_name IS NOT NULL");
    } else {
      where.push("journals.cover_image_name IS NULL");
    }
  }

  // SCImago 筛选：使用 EXISTS/NOT EXISTS，避免子查询生成大临时表
  const joins: string[] = [];
  if (args.inScimago !== undefined) {
    if (args.inScimago) {
      where.push(
        "EXISTS (SELECT 1 FROM scimago_issn_index _sci WHERE _sci.issn = journals.issn_l LIMIT 1)"
      );
    } else {
      where.push(
        "NOT EXISTS (SELECT 1 FROM scimago_issn_index _sci WHERE _sci.issn = journals.issn_l LIMIT 1)"
      );
    }
  }

  const joinSql = joins.length ? joins.join(" ") : "";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  
  // 统计总数
  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(1) as c FROM journals ${joinSql} ${whereSql}`,
    params
  );
  const total = countRow?.c ?? 0;

  // 排序（安全验证）
  let sortBy = args.sortBy || "updated_at";
  if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
    sortBy = "updated_at";
  }
  const sortOrder = args.sortOrder === "asc" ? "ASC" : "DESC";
  const orderBy = `ORDER BY journals.${sortBy} ${sortOrder}`;

  // 字段选择（默认不包含 BLOB 字段 cover_image）
  const selectFields = args.fields?.length
    ? args.fields.map((f) => `journals.${f}`).join(", ")
    : JOURNAL_SELECT_FIELDS.split(", ").map((f) => `journals.${f.trim()}`).join(", ");

  // 分页查询
  const offset = (args.page - 1) * args.pageSize;
  const rows = await query<RowDataPacket[]>(
    `SELECT ${selectFields} FROM journals ${joinSql} ${whereSql} ${orderBy} LIMIT ? OFFSET ?`,
    [...params, args.pageSize, offset]
  );

  return { total, rows: rows.map(parseJournalRow) };
}

export async function getJournalDetail(idOrIssn: string): Promise<{
  journal: JournalRow;
  aliases: Array<{ issn: string; kind: string; source: string }>;
  fetchStatus: FetchStatusRow[];
} | null> {
  // 解析期刊 ID
  let journalId = await resolveJournalId(idOrIssn);
  if (!journalId) {
    // 尝试直接查询
    const direct = await queryOne<RowDataPacket>(
      "SELECT id FROM journals WHERE id = ?",
      [idOrIssn]
    );
    if (direct) journalId = direct.id;
  }
  
  if (!journalId) return null;
  
  const journal = await getJournal(journalId);
  if (!journal) return null;
  
  const aliases = await getAliasesByJournalId(journalId);
  const fetchStatus = await getFetchStatusForJournal(journalId);
  
  return { journal, aliases, fetchStatus };
}

export async function getTotalJournalCount(): Promise<number> {
  const row = await queryOne<RowDataPacket>("SELECT COUNT(1) as count FROM journals");
  return row?.count ?? 0;
}

export async function getAllJournalIds(): Promise<string[]> {
  const rows = await query<RowDataPacket[]>(
    "SELECT id FROM journals ORDER BY id"
  );
  return rows.map((r) => r.id);
}

// ============ 抓取过滤器 ============

export type FetchFilter = {
  sources?: SourceName[];
  statuses?: FetchStatusType[];
  journalIds?: string[];
  version?: string;
};

export async function getJournalIdsForFetch(filter?: FetchFilter): Promise<string[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (filter?.sources && filter.sources.length > 0) {
    where.push(`source IN (${filter.sources.map(() => "?").join(",")})`);
    params.push(...filter.sources);
  }

  // 版本号过滤
  if (filter?.version) {
    where.push(`version = ?`);
    params.push(filter.version);
  }

  // 状态过滤
  if (filter?.statuses && filter.statuses.length > 0) {
    where.push(`status IN (${filter.statuses.map(() => "?").join(",")})`);
    params.push(...filter.statuses);
  }

  if (filter?.journalIds && filter.journalIds.length > 0) {
    where.push(`journal_id IN (${filter.journalIds.map(() => "?").join(",")})`);
    params.push(...filter.journalIds);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await query<RowDataPacket[]>(
    `SELECT DISTINCT journal_id FROM fetch_status ${whereSql} ORDER BY journal_id`,
    params
  );
  return rows.map((r) => r.journal_id);
}

export async function getSourcesForJournal(
  journalId: string,
  filter?: FetchFilter
): Promise<SourceName[]> {
  const where: string[] = ["journal_id = ?"];
  const params: any[] = [journalId];

  if (filter?.sources && filter.sources.length > 0) {
    where.push(`source IN (${filter.sources.map(() => "?").join(",")})`);
    params.push(...filter.sources);
  }

  if (filter?.statuses && filter.statuses.length > 0) {
    where.push(`status IN (${filter.statuses.map(() => "?").join(",")})`);
    params.push(...filter.statuses);
  }

  // 版本号过滤（匹配指定版本）
  if (filter?.version) {
    where.push(`version = ?`);
    params.push(filter.version);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const rows = await query<RowDataPacket[]>(
    `SELECT source FROM fetch_status ${whereSql} ORDER BY source`,
    params
  );
  return rows.map((r) => r.source as SourceName);
}

// ============ 失败记录查询 ============

export type FailedFetchRecord = {
  journalId: string;
  source: SourceName;
  httpStatus: number | null;
  errorMessage: string | null;
  retryCount: number;
  lastFetchedAt: string | null;
};

export async function getFailedFetchRecords(args: {
  source?: SourceName;
  page: number;
  pageSize: number;
}): Promise<{ total: number; rows: FailedFetchRecord[] }> {
  const conditions: string[] = ["status = 'failed'"];
  const params: any[] = [];
  
  if (args.source) {
    conditions.push("source = ?");
    params.push(args.source);
  }
  
  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  
  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) as count FROM fetch_status ${whereClause}`,
    params
  );
  const total = countRow?.count ?? 0;
  
  const offset = (args.page - 1) * args.pageSize;
  const rows = await query<RowDataPacket[]>(
    `SELECT journal_id, source, http_status, error_message, retry_count, last_fetched_at
     FROM fetch_status ${whereClause}
     ORDER BY last_fetched_at DESC
     LIMIT ? OFFSET ?`,
    [...params, args.pageSize, offset]
  );
  
  return {
    total,
    rows: rows.map((r) => ({
      journalId: r.journal_id,
      source: r.source as SourceName,
      httpStatus: r.http_status,
      errorMessage: r.error_message,
      retryCount: r.retry_count,
      lastFetchedAt: r.last_fetched_at,
    })),
  };
}

// ============ 期刊自定义字段更新 ============

export type JournalCustomFields = {
  custom_title?: string | null;
  custom_publisher?: string | null;
  custom_country?: string | null;
  custom_homepage?: string | null;
  custom_description?: string | null;
  custom_notes?: string | null;
};

export async function updateJournalCustomFields(
  journalId: string,
  fields: JournalCustomFields
): Promise<boolean> {
  const updates: string[] = [];
  const params: any[] = [];

  if (fields.custom_title !== undefined) {
    updates.push("custom_title = ?");
    params.push(fields.custom_title);
  }
  if (fields.custom_publisher !== undefined) {
    updates.push("custom_publisher = ?");
    params.push(fields.custom_publisher);
  }
  if (fields.custom_country !== undefined) {
    updates.push("custom_country = ?");
    params.push(fields.custom_country);
  }
  if (fields.custom_homepage !== undefined) {
    updates.push("custom_homepage = ?");
    params.push(fields.custom_homepage);
  }
  if (fields.custom_description !== undefined) {
    updates.push("custom_description = ?");
    params.push(fields.custom_description);
  }
  if (fields.custom_notes !== undefined) {
    updates.push("custom_notes = ?");
    params.push(fields.custom_notes);
  }

  if (updates.length === 0) return false;

  updates.push("custom_updated_at = ?");
  params.push(nowLocal());
  
  updates.push("updated_at = ?");
  params.push(nowLocal());

  params.push(journalId);

  const result = await execute(
    `UPDATE journals SET ${updates.join(", ")} WHERE id = ?`,
    params
  );

  return result.affectedRows > 0;
}

// ============ 期刊封面图片 ============

export async function updateJournalCoverImage(
  journalId: string,
  image: Buffer,
  mimeType: string,
  fileName: string
): Promise<boolean> {
  const result = await execute(
    `UPDATE journals SET 
      cover_image = ?, 
      cover_image_type = ?, 
      cover_image_name = ?,
      updated_at = ?
     WHERE id = ?`,
    [image, mimeType, fileName, nowLocal(), journalId]
  );
  return result.affectedRows > 0;
}

export async function deleteJournalCoverImage(journalId: string): Promise<boolean> {
  const result = await execute(
    `UPDATE journals SET 
      cover_image = NULL, 
      cover_image_type = NULL, 
      cover_image_name = NULL,
      updated_at = ?
     WHERE id = ?`,
    [nowLocal(), journalId]
  );
  return result.affectedRows > 0;
}

export async function getJournalCoverImage(
  journalId: string
): Promise<{ image: Buffer; mimeType: string; fileName: string } | null> {
  const row = await queryOne<RowDataPacket>(
    `SELECT cover_image, cover_image_type, cover_image_name FROM journals WHERE id = ?`,
    [journalId]
  );
  
  if (!row || !row.cover_image) return null;
  
  return {
    image: row.cover_image,
    mimeType: row.cover_image_type || "image/jpeg",
    fileName: row.cover_image_name || "cover.jpg",
  };
}

export async function hasJournalCoverImage(journalId: string): Promise<boolean> {
  const row = await queryOne<RowDataPacket>(
    `SELECT 1 FROM journals WHERE id = ? AND cover_image_name IS NOT NULL`,
    [journalId]
  );
  return !!row;
}

// ============ 图片搜索缓存 ============

export type ImageSearchCacheStatus = "pending" | "downloaded" | "failed" | "expired";

export type ImageSearchCacheRow = {
  id: number;
  journal_id: string;
  journal_name: string | null;
  search_query: string;
  results_json: string; // JSON string
  result_count: number;
  tried_indices: string | null; // JSON string of number[]
  status: ImageSearchCacheStatus;
  created_at: string;
  updated_at: string;
};

/**
 * 保存或更新图片搜索结果缓存
 * 使用 UPSERT：如果 journal_id 已存在则更新
 */
export async function upsertImageSearchCache(
  journalId: string,
  journalName: string,
  searchQuery: string,
  results: any[],
  triedIndices: number[] = [],
  status: ImageSearchCacheStatus = "pending"
): Promise<void> {
  const resultsJson = JSON.stringify(results);
  const triedJson = JSON.stringify(triedIndices);
  await execute(
    `INSERT INTO journal_image_search_cache
       (journal_id, journal_name, search_query, results_json, result_count, tried_indices, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       journal_name = VALUES(journal_name),
       search_query = VALUES(search_query),
       results_json = VALUES(results_json),
       result_count = VALUES(result_count),
       tried_indices = VALUES(tried_indices),
       status = VALUES(status),
       updated_at = CURRENT_TIMESTAMP`,
    [journalId, journalName, searchQuery, resultsJson, results.length, triedJson, status]
  );
}

/**
 * 更新缓存的已尝试索引和状态
 */
export async function updateImageSearchCacheStatus(
  journalId: string,
  triedIndices: number[],
  status: ImageSearchCacheStatus
): Promise<void> {
  await execute(
    `UPDATE journal_image_search_cache
     SET tried_indices = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE journal_id = ?`,
    [JSON.stringify(triedIndices), status, journalId]
  );
}

/**
 * 获取单个期刊的搜索缓存
 */
export async function getImageSearchCache(
  journalId: string
): Promise<ImageSearchCacheRow | null> {
  const row = await queryOne<RowDataPacket & ImageSearchCacheRow>(
    `SELECT * FROM journal_image_search_cache WHERE journal_id = ?`,
    [journalId]
  );
  return row ?? null;
}

/**
 * 批量获取待重试的缓存（status = 'pending'）
 */
export async function getPendingImageSearchCaches(
  limit: number = 1000
): Promise<ImageSearchCacheRow[]> {
  const rows = await query<(RowDataPacket & ImageSearchCacheRow)[]>(
    `SELECT * FROM journal_image_search_cache WHERE status = 'pending' ORDER BY updated_at ASC LIMIT ?`,
    [limit]
  );
  return rows as ImageSearchCacheRow[];
}

/**
 * 统计缓存状态
 */
export async function getImageSearchCacheStats(): Promise<{
  total: number;
  pending: number;
  downloaded: number;
  failed: number;
}> {
  const rows = await query<RowDataPacket[]>(
    `SELECT status, COUNT(*) as cnt FROM journal_image_search_cache GROUP BY status`
  );
  const stats = { total: 0, pending: 0, downloaded: 0, failed: 0 };
  for (const row of rows) {
    const cnt = Number(row.cnt);
    stats.total += cnt;
    if (row.status in stats) {
      (stats as any)[row.status] = cnt;
    }
  }
  return stats;
}

// ============ 流水线状态管理 ============

/**
 * 更新生产者状态（OpenAlex 收集线程）
 */
export async function updateProducerStatus(
  runId: string,
  status: ProducerStatus,
  error?: string | null
): Promise<void> {
  await execute(
    `UPDATE crawl_runs SET producer_status = ?, producer_error = ? WHERE id = ?`,
    [status, error ?? null, runId]
  );
}

/**
 * 更新消费者状态（其他数据源抓取线程）
 */
export async function updateConsumerStatus(
  runId: string,
  status: ConsumerStatus
): Promise<void> {
  await execute(
    `UPDATE crawl_runs SET consumer_status = ? WHERE id = ?`,
    [status, runId]
  );
}

/**
 * 增加已收集期刊计数
 */
export async function bumpCollectedCount(runId: string, delta: number): Promise<void> {
  await execute(
    `UPDATE crawl_runs SET collected_count = collected_count + ? WHERE id = ?`,
    [delta, runId]
  );
}

/**
 * 获取指定版本的 pending 状态期刊数量（用于消费者判断是否需要等待）
 */
export async function getPendingJournalCount(version: string, sources?: SourceName[]): Promise<number> {
  const sourcesToCheck = sources ?? FETCH_SOURCES;
  const placeholders = sourcesToCheck.map(() => "?").join(",");
  
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(DISTINCT journal_id) as count 
     FROM fetch_status 
     WHERE version = ? AND source IN (${placeholders}) AND status = 'pending'`,
    [version, ...sourcesToCheck]
  );
  return row?.count ?? 0;
}

/**
 * 检查生产者是否已完成
 */
export async function isProducerCompleted(runId: string): Promise<boolean> {
  const row = await queryOne<RowDataPacket>(
    `SELECT producer_status FROM crawl_runs WHERE id = ?`,
    [runId]
  );
  return row?.producer_status === "completed";
}

/**
 * 检查生产者是否已暂停
 */
export async function isProducerPaused(runId: string): Promise<boolean> {
  const row = await queryOne<RowDataPacket>(
    `SELECT producer_status FROM crawl_runs WHERE id = ?`,
    [runId]
  );
  return row?.producer_status === "paused";
}

/**
 * 获取需要恢复的任务（生产者暂停）
 * 包括状态为 stopped 或 running 且 producer_status = paused 的任务
 */
export async function getResumableRun(): Promise<CrawlRunRow | null> {
  const row = await queryOne<CrawlRunRow & RowDataPacket>(
    `SELECT * FROM crawl_runs 
     WHERE producer_status = 'paused'
       AND status IN ('running', 'stopped')
     ORDER BY started_at DESC LIMIT 1`
  );
  if (row) {
    console.log(`[getResumableRun] 找到可恢复的任务: id=${row.id}, status=${row.status}, producer_status=${row.producer_status}`);
  } else {
    console.log(`[getResumableRun] 没有找到可恢复的任务`);
  }
  return row ?? null;
}
