import fs from "node:fs";
import path from "node:path";

export type Migration = {
  name: string;
  sql: string;
};

/**
 * 从 sql/ 目录加载 SQL 脚本
 */
function loadSqlFile(filename: string): string {
  const possiblePaths = [
    path.join(process.cwd(), "sql", filename),
    path.join(process.cwd(), "..", "sql", filename),
    path.join("/app", "sql", filename),
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        console.log(`[SQL] 加载文件: ${filePath}`);
        return fs.readFileSync(filePath, "utf-8");
      }
    } catch {
      continue;
    }
  }

  console.warn(`[SQL] 文件未找到: ${filename}，使用内联 SQL`);
  return getInlineSql(filename);
}

/**
 * 内联 SQL（当文件不可用时的后备）
 */
function getInlineSql(filename: string): string {
  const inlineSqls: Record<string, string> = {
    "001_init_tables.sql": INIT_TABLES_SQL,
    "002_add_indexes.sql": ADD_INDEXES_SQL,
    "003_add_cover_image.sql": ADD_COVER_IMAGE_SQL,
  };
  
  if (inlineSqls[filename]) {
    return inlineSqls[filename];
  }
  throw new Error(`未知的 SQL 文件: ${filename}`);
}

// ============================================================
// 内联 SQL（后备方案）
// ============================================================

const INIT_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS journals (
  id VARCHAR(32) PRIMARY KEY,
  issn_l VARCHAR(9),
  issns JSON,
  title VARCHAR(500),
  publisher VARCHAR(500),
  country VARCHAR(10),
  languages JSON,
  subjects JSON,
  is_open_access BOOLEAN,
  homepage VARCHAR(1000),
  oa_display_name VARCHAR(500),
  oa_type VARCHAR(50),
  oa_alternate_titles JSON,
  oa_host_organization VARCHAR(500),
  oa_host_organization_lineage JSON,
  oa_works_count INT,
  oa_cited_by_count INT,
  oa_works_api_url VARCHAR(500),
  oa_apc_prices JSON,
  oa_apc_usd INT,
  oa_counts_by_year JSON,
  oa_first_publication_year INT,
  oa_last_publication_year INT,
  oa_is_core BOOLEAN,
  oa_is_oa BOOLEAN,
  oa_is_high_oa_rate BOOLEAN,
  oa_is_high_oa_rate_since_year INT,
  oa_is_in_doaj BOOLEAN,
  oa_is_in_doaj_since_year INT,
  oa_is_in_scielo BOOLEAN,
  oa_is_ojs BOOLEAN,
  oa_oa_flip_year INT,
  oa_oa_works_count INT,
  oa_societies JSON,
  oa_summary_stats JSON,
  oa_topics JSON,
  oa_topic_share JSON,
  oa_ids JSON,
  oa_created_date DATE,
  oa_updated_date DATE,
  cr_title VARCHAR(500),
  cr_publisher VARCHAR(500),
  cr_subjects JSON,
  cr_issn_types JSON,
  cr_url VARCHAR(500),
  cr_last_status_check_time BIGINT,
  cr_counts JSON,
  cr_breakdowns JSON,
  cr_coverage JSON,
  cr_coverage_type JSON,
  cr_flags JSON,
  doaj_title VARCHAR(500),
  doaj_publisher VARCHAR(500),
  doaj_country VARCHAR(10),
  doaj_languages JSON,
  doaj_subjects JSON,
  doaj_links JSON,
  doaj_apc JSON,
  doaj_license JSON,
  doaj_alternative_title VARCHAR(500),
  doaj_article JSON,
  doaj_boai BOOLEAN,
  doaj_copyright JSON,
  doaj_deposit_policy JSON,
  doaj_discontinued_date VARCHAR(20),
  doaj_editorial JSON,
  doaj_eissn VARCHAR(9),
  doaj_pissn VARCHAR(9),
  doaj_institution JSON,
  doaj_is_replaced_by JSON,
  doaj_keywords JSON,
  doaj_labels JSON,
  doaj_oa_start JSON,
  doaj_other_charges JSON,
  doaj_pid_scheme JSON,
  doaj_plagiarism JSON,
  doaj_preservation JSON,
  doaj_publication_time_weeks INT,
  doaj_ref JSON,
  doaj_replaces JSON,
  doaj_waiver JSON,
  nlm_in_catalog BOOLEAN DEFAULT FALSE,
  nlm_uids JSON,
  wikidata_has_entity BOOLEAN DEFAULT FALSE,
  wikidata_homepage VARCHAR(1000),
  wikipedia_has_article BOOLEAN DEFAULT FALSE,
  wikipedia_article_title VARCHAR(500),
  wikipedia_extract TEXT,
  wikipedia_description TEXT,
  wikipedia_thumbnail VARCHAR(1000),
  wikipedia_categories JSON,
  wikipedia_infobox JSON,
  cover_image MEDIUMBLOB,
  cover_image_type VARCHAR(50),
  cover_image_name VARCHAR(255),
  custom_title VARCHAR(500),
  custom_publisher VARCHAR(500),
  custom_country VARCHAR(10),
  custom_homepage VARCHAR(1000),
  custom_description TEXT,
  custom_notes TEXT,
  custom_updated_at DATETIME,
  field_sources JSON,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issn_aliases (
  issn VARCHAR(9) PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL,
  kind ENUM('print', 'electronic', 'linking', 'unknown') NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fetch_status (
  id VARCHAR(36) PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL,
  source ENUM('openalex', 'crossref', 'doaj', 'nlm', 'wikidata', 'wikipedia') NOT NULL,
  status ENUM('pending', 'success', 'no_data', 'failed') NOT NULL DEFAULT 'pending',
  http_status INT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  version VARCHAR(20),
  last_fetched_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_journal_source (journal_id, source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crawl_runs (
  id VARCHAR(36) PRIMARY KEY,
  type ENUM('full', 'incremental', 'wikipedia') NOT NULL,
  phase VARCHAR(50) NOT NULL,
  status ENUM('running', 'stopped', 'completed', 'failed') NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  openalex_cursor TEXT,
  params_json JSON,
  total_journals INT DEFAULT 0,
  processed INT DEFAULT 0,
  succeeded INT DEFAULT 0,
  failed INT DEFAULT 0,
  current_journal_id VARCHAR(32),
  last_error TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_config (
  \`key\` VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const ADD_INDEXES_SQL = `
CREATE INDEX idx_issn_l ON journals(issn_l);
CREATE INDEX idx_title ON journals(title(100));
CREATE INDEX idx_publisher ON journals(publisher(100));
CREATE INDEX idx_country ON journals(country);
CREATE INDEX idx_is_open_access ON journals(is_open_access);
CREATE INDEX idx_updated_at ON journals(updated_at);
CREATE INDEX idx_oa_works_count ON journals(oa_works_count);
CREATE INDEX idx_oa_cited_by_count ON journals(oa_cited_by_count);
CREATE INDEX idx_oa_is_in_doaj ON journals(oa_is_in_doaj);
CREATE INDEX idx_oa_is_in_scielo ON journals(oa_is_in_scielo);
CREATE INDEX idx_oa_is_ojs ON journals(oa_is_ojs);
CREATE INDEX idx_oa_is_core ON journals(oa_is_core);
CREATE INDEX idx_oa_is_oa ON journals(oa_is_oa);
CREATE INDEX idx_oa_is_high_oa_rate ON journals(oa_is_high_oa_rate);
CREATE INDEX idx_nlm_in_catalog ON journals(nlm_in_catalog);
CREATE INDEX idx_wikidata_has_entity ON journals(wikidata_has_entity);
CREATE INDEX idx_wikipedia_has_article ON journals(wikipedia_has_article);
CREATE INDEX idx_doaj_boai ON journals(doaj_boai);
CREATE INDEX idx_oa_type ON journals(oa_type);
CREATE INDEX idx_doaj_country ON journals(doaj_country);
CREATE INDEX idx_oa_first_publication_year ON journals(oa_first_publication_year);
CREATE INDEX idx_oa_last_publication_year ON journals(oa_last_publication_year);
CREATE INDEX idx_oa_apc_usd ON journals(oa_apc_usd);
CREATE INDEX idx_doaj_publication_time_weeks ON journals(doaj_publication_time_weeks);
CREATE INDEX idx_oa_oa_works_count ON journals(oa_oa_works_count);
CREATE INDEX idx_created_at ON journals(created_at);
CREATE INDEX idx_oa_created_date ON journals(oa_created_date);
CREATE INDEX idx_oa_updated_date ON journals(oa_updated_date);
CREATE INDEX idx_doaj_eissn ON journals(doaj_eissn);
CREATE INDEX idx_doaj_pissn ON journals(doaj_pissn);
CREATE INDEX idx_journal_id ON issn_aliases(journal_id);
CREATE INDEX idx_source_status ON fetch_status(source, status);
CREATE INDEX idx_fs_status ON fetch_status(status);
CREATE INDEX idx_cr_status ON crawl_runs(status);
CREATE INDEX idx_cr_started_at ON crawl_runs(started_at);
`;

const ADD_COVER_IMAGE_SQL = `
ALTER TABLE journals ADD COLUMN cover_image MEDIUMBLOB;
ALTER TABLE journals ADD COLUMN cover_image_type VARCHAR(50);
ALTER TABLE journals ADD COLUMN cover_image_name VARCHAR(255);
ALTER TABLE journals ADD COLUMN custom_title VARCHAR(500);
ALTER TABLE journals ADD COLUMN custom_publisher VARCHAR(500);
ALTER TABLE journals ADD COLUMN custom_country VARCHAR(10);
ALTER TABLE journals ADD COLUMN custom_homepage VARCHAR(1000);
ALTER TABLE journals ADD COLUMN custom_description TEXT;
ALTER TABLE journals ADD COLUMN custom_notes TEXT;
ALTER TABLE journals ADD COLUMN custom_updated_at DATETIME;
`;

/**
 * SQL 文件列表（按顺序执行）
 */
export const migrations: Migration[] = [
  { name: "001_init_tables", sql: loadSqlFile("001_init_tables.sql") },
  { name: "002_add_indexes", sql: loadSqlFile("002_add_indexes.sql") },
  { name: "003_add_cover_image", sql: loadSqlFile("003_add_cover_image.sql") },
];
