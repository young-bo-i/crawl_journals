-- =============================================
-- 期刊爬虫系统 MySQL 数据库初始化脚本
-- 主键: OpenAlex ID (如 S4210228046)
-- 注意: 使用 IF NOT EXISTS 保证幂等性
-- =============================================

-- 期刊主表
CREATE TABLE IF NOT EXISTS journals (
  id VARCHAR(32) PRIMARY KEY COMMENT 'OpenAlex ID',
  issn_l VARCHAR(9) COMMENT 'Linking ISSN',
  issns JSON COMMENT 'ISSN 列表',
  title VARCHAR(500) COMMENT '期刊标题',
  publisher VARCHAR(500) COMMENT '出版社',
  country VARCHAR(10) COMMENT '国家/地区代码',
  languages JSON COMMENT '语种列表',
  subjects JSON COMMENT '学科/主题列表',
  is_open_access BOOLEAN COMMENT '是否开放获取',
  homepage VARCHAR(1000) COMMENT '期刊主页 URL',
  
  -- OpenAlex 字段
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
  
  -- Crossref 字段
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
  
  -- DOAJ 字段
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
  
  -- NLM 字段
  nlm_in_catalog BOOLEAN DEFAULT FALSE,
  nlm_uids JSON,
  
  -- Wikidata 字段
  wikidata_has_entity BOOLEAN DEFAULT FALSE,
  wikidata_homepage VARCHAR(1000),
  
  -- Wikipedia 字段
  wikipedia_has_article BOOLEAN DEFAULT FALSE,
  wikipedia_article_title VARCHAR(500),
  wikipedia_extract TEXT,
  wikipedia_description TEXT,
  wikipedia_thumbnail VARCHAR(1000),
  wikipedia_categories JSON,
  wikipedia_infobox JSON,
  
  -- 封面图片
  cover_image MEDIUMBLOB COMMENT '期刊封面图片',
  cover_image_type VARCHAR(50) COMMENT '封面图片 MIME 类型',
  cover_image_name VARCHAR(255) COMMENT '封面图片原始文件名',
  
  -- 用户自定义字段
  custom_title VARCHAR(500) COMMENT '用户自定义标题',
  custom_publisher VARCHAR(500) COMMENT '用户自定义出版社',
  custom_country VARCHAR(10) COMMENT '用户自定义国家/地区',
  custom_homepage VARCHAR(1000) COMMENT '用户自定义主页',
  custom_description TEXT COMMENT '用户自定义描述',
  custom_notes TEXT COMMENT '用户备注',
  custom_updated_at DATETIME COMMENT '自定义字段更新时间',
  
  -- 元信息
  field_sources JSON,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ISSN 别名映射表
CREATE TABLE IF NOT EXISTS issn_aliases (
  issn VARCHAR(9) PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL,
  kind ENUM('print', 'electronic', 'linking', 'unknown') NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 抓取状态表
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

-- 爬取任务表
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

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
