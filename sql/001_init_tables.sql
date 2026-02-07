-- =============================================
-- 期刊爬虫系统 MySQL 数据库初始化脚本
-- 主键: OpenAlex ID (如 S4210228046)
-- 此文件为所有表结构的唯一定义，与线上数据库保持一致
-- 注意: 使用 IF NOT EXISTS / INSERT IGNORE 保证幂等性
-- 最后更新: 2026-02-07
-- =============================================

-- =============================================
-- 1. 期刊主表
-- =============================================
CREATE TABLE IF NOT EXISTS journals (
  id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT 'OpenAlex ID',
  issn_l VARCHAR(9) DEFAULT NULL COMMENT 'Linking ISSN',
  issns JSON DEFAULT NULL COMMENT 'ISSN 列表',

  -- OpenAlex 字段（基础数据源）
  oa_display_name VARCHAR(1000) DEFAULT NULL COMMENT 'OpenAlex 显示名称',
  oa_type VARCHAR(50) DEFAULT NULL COMMENT '期刊类型',
  oa_alternate_titles JSON DEFAULT NULL COMMENT '别名列表',
  oa_host_organization VARCHAR(500) DEFAULT NULL COMMENT '出版机构名称',
  oa_host_organization_id VARCHAR(50) DEFAULT NULL COMMENT '出版机构 OpenAlex ID',
  oa_host_organization_lineage JSON DEFAULT NULL COMMENT '组织层级结构',
  oa_country_code VARCHAR(10) DEFAULT NULL COMMENT '国家/地区代码',
  oa_homepage_url VARCHAR(4096) DEFAULT NULL COMMENT '期刊主页 URL',
  oa_works_count INT DEFAULT NULL COMMENT '作品总数',
  oa_cited_by_count INT DEFAULT NULL COMMENT '被引总数',
  oa_works_api_url VARCHAR(500) DEFAULT NULL COMMENT '作品 API 地址',
  oa_apc_prices JSON DEFAULT NULL COMMENT 'APC 价格列表',
  oa_apc_usd INT DEFAULT NULL COMMENT 'APC 美元价格',
  oa_counts_by_year JSON DEFAULT NULL COMMENT '年度统计',
  oa_first_publication_year INT DEFAULT NULL COMMENT '首次发表年',
  oa_last_publication_year INT DEFAULT NULL COMMENT '最后发表年',
  oa_is_core TINYINT(1) DEFAULT NULL COMMENT '是否核心期刊',
  oa_is_oa TINYINT(1) DEFAULT NULL COMMENT '是否开放获取',
  oa_is_high_oa_rate TINYINT(1) DEFAULT NULL COMMENT '是否高 OA 率',
  oa_is_high_oa_rate_since_year INT DEFAULT NULL COMMENT '高 OA 率起始年',
  oa_is_in_doaj TINYINT(1) DEFAULT NULL COMMENT '是否 DOAJ 收录',
  oa_is_in_doaj_since_year INT DEFAULT NULL COMMENT 'DOAJ 收录年',
  oa_is_in_scielo TINYINT(1) DEFAULT NULL COMMENT '是否 SciELO 收录',
  oa_is_ojs TINYINT(1) DEFAULT NULL COMMENT '是否 OJS 平台',
  oa_oa_flip_year INT DEFAULT NULL COMMENT 'OA 转型年',
  oa_oa_works_count INT DEFAULT NULL COMMENT 'OA 作品数',
  oa_societies JSON DEFAULT NULL COMMENT '学会组织',
  oa_summary_stats JSON DEFAULT NULL COMMENT '汇总统计',
  oa_topics JSON DEFAULT NULL COMMENT '主题领域',
  oa_topic_share JSON DEFAULT NULL COMMENT '主题分布',
  oa_ids JSON DEFAULT NULL COMMENT '外部平台 ID',
  oa_created_date DATE DEFAULT NULL COMMENT 'OpenAlex 创建日期',
  oa_updated_date DATE DEFAULT NULL COMMENT 'OpenAlex 更新日期',

  -- Crossref 字段
  cr_title VARCHAR(500) DEFAULT NULL COMMENT 'Crossref 期刊标题',
  cr_publisher VARCHAR(500) DEFAULT NULL COMMENT 'Crossref 出版社',
  cr_subjects JSON DEFAULT NULL COMMENT 'Crossref 学科',
  cr_issn_types JSON DEFAULT NULL COMMENT 'ISSN 类型',
  cr_url VARCHAR(500) DEFAULT NULL COMMENT 'Crossref 链接',
  cr_last_status_check_time BIGINT DEFAULT NULL COMMENT '状态检查时间戳',
  cr_counts JSON DEFAULT NULL COMMENT 'DOI 统计',
  cr_breakdowns JSON DEFAULT NULL COMMENT '细分统计',
  cr_coverage JSON DEFAULT NULL COMMENT '覆盖率',
  cr_coverage_type JSON DEFAULT NULL COMMENT '覆盖率类型',
  cr_flags JSON DEFAULT NULL COMMENT '标志位',

  -- DOAJ 字段
  doaj_title VARCHAR(500) DEFAULT NULL COMMENT 'DOAJ 标题',
  doaj_publisher VARCHAR(500) DEFAULT NULL COMMENT 'DOAJ 出版社',
  doaj_country VARCHAR(10) DEFAULT NULL COMMENT 'DOAJ 国家',
  doaj_languages JSON DEFAULT NULL COMMENT '语种',
  doaj_subjects JSON DEFAULT NULL COMMENT '学科分类',
  doaj_links JSON DEFAULT NULL COMMENT '相关链接',
  doaj_apc JSON DEFAULT NULL COMMENT 'APC 信息',
  doaj_license JSON DEFAULT NULL COMMENT '许可证',
  doaj_alternative_title VARCHAR(500) DEFAULT NULL COMMENT '备选标题',
  doaj_article JSON DEFAULT NULL COMMENT '文章信息',
  doaj_boai TINYINT(1) DEFAULT NULL COMMENT 'BOAI 兼容',
  doaj_copyright JSON DEFAULT NULL COMMENT '版权信息',
  doaj_deposit_policy JSON DEFAULT NULL COMMENT '存储政策',
  doaj_discontinued_date VARCHAR(20) DEFAULT NULL COMMENT '停刊日期',
  doaj_editorial JSON DEFAULT NULL COMMENT '编辑信息',
  doaj_eissn VARCHAR(9) DEFAULT NULL COMMENT '电子 ISSN',
  doaj_pissn VARCHAR(9) DEFAULT NULL COMMENT '印刷 ISSN',
  doaj_institution JSON DEFAULT NULL COMMENT '所属机构',
  doaj_is_replaced_by JSON DEFAULT NULL COMMENT '被替代期刊',
  doaj_keywords JSON DEFAULT NULL COMMENT '关键词',
  doaj_labels JSON DEFAULT NULL COMMENT '标签',
  doaj_oa_start JSON DEFAULT NULL COMMENT 'OA 起始时间',
  doaj_other_charges JSON DEFAULT NULL COMMENT '其他费用',
  doaj_pid_scheme JSON DEFAULT NULL COMMENT '标识符方案',
  doaj_plagiarism JSON DEFAULT NULL COMMENT '查重政策',
  doaj_preservation JSON DEFAULT NULL COMMENT '长期保存',
  doaj_publication_time_weeks INT DEFAULT NULL COMMENT '出版周期(周)',
  doaj_ref JSON DEFAULT NULL COMMENT '引用政策',
  doaj_replaces JSON DEFAULT NULL COMMENT '替代期刊',
  doaj_waiver JSON DEFAULT NULL COMMENT '费用减免',

  -- NLM 字段
  nlm_in_catalog TINYINT(1) DEFAULT '0' COMMENT 'NLM 是否收录',
  nlm_uids JSON DEFAULT NULL COMMENT 'NLM UID 列表',

  -- Wikidata 字段
  wikidata_has_entity TINYINT(1) DEFAULT '0' COMMENT '是否有 Wikidata 实体',
  wikidata_homepage VARCHAR(1000) DEFAULT NULL COMMENT 'Wikidata 主页',

  -- Wikipedia 字段
  wikipedia_has_article TINYINT(1) DEFAULT '0' COMMENT '是否有 Wikipedia 条目',
  wikipedia_article_title VARCHAR(500) DEFAULT NULL COMMENT 'Wikipedia 标题',
  wikipedia_extract TEXT COMMENT 'Wikipedia 摘要',
  wikipedia_description TEXT COMMENT 'Wikipedia 描述',
  wikipedia_thumbnail VARCHAR(1000) DEFAULT NULL COMMENT 'Wikipedia 缩略图',
  wikipedia_categories JSON DEFAULT NULL COMMENT 'Wikipedia 分类',
  wikipedia_infobox JSON DEFAULT NULL COMMENT 'Wikipedia 信息框',

  -- 封面图片（图片数据存储在 journal_covers 表，此处仅保留文件名用于筛选索引）
  cover_image_name VARCHAR(255) DEFAULT NULL COMMENT '封面图片文件名',

  -- 用户自定义字段
  custom_title VARCHAR(500) DEFAULT NULL COMMENT '用户自定义标题',
  custom_publisher VARCHAR(500) DEFAULT NULL COMMENT '用户自定义出版社',
  custom_country VARCHAR(10) DEFAULT NULL COMMENT '用户自定义国家/地区',
  custom_homepage VARCHAR(1000) DEFAULT NULL COMMENT '用户自定义主页',
  custom_description TEXT COMMENT '用户自定义描述',
  custom_notes TEXT COMMENT '用户备注',
  custom_updated_at DATETIME DEFAULT NULL COMMENT '自定义字段更新时间',

  -- 元信息
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  -- 索引：布尔筛选
  KEY idx_oa_is_in_doaj (oa_is_in_doaj),
  KEY idx_oa_is_in_scielo (oa_is_in_scielo),
  KEY idx_oa_is_ojs (oa_is_ojs),
  KEY idx_oa_is_core (oa_is_core),
  KEY idx_oa_is_oa (oa_is_oa),
  KEY idx_oa_is_high_oa_rate (oa_is_high_oa_rate),
  KEY idx_nlm_in_catalog (nlm_in_catalog),
  KEY idx_wikidata_has_entity (wikidata_has_entity),
  KEY idx_wikipedia_has_article (wikipedia_has_article),
  KEY idx_doaj_boai (doaj_boai),

  -- 索引：分类/筛选
  KEY idx_oa_type (oa_type),
  KEY idx_doaj_country (doaj_country),
  KEY idx_oa_country_code (oa_country_code),
  KEY idx_issn_l (issn_l),
  KEY idx_cover_image_name (cover_image_name),

  -- 索引：年份范围
  KEY idx_oa_first_publication_year (oa_first_publication_year),
  KEY idx_oa_last_publication_year (oa_last_publication_year),

  -- 索引：数值排序/范围
  KEY idx_oa_apc_usd (oa_apc_usd),
  KEY idx_doaj_publication_time_weeks (doaj_publication_time_weeks),
  KEY idx_oa_oa_works_count (oa_oa_works_count),
  KEY idx_oa_works_count (oa_works_count),
  KEY idx_oa_cited_by_count (oa_cited_by_count),

  -- 索引：时间排序
  KEY idx_created_at (created_at),
  KEY idx_updated_at (updated_at),
  KEY idx_oa_created_date (oa_created_date),
  KEY idx_oa_updated_date (oa_updated_date),

  -- 索引：复合（优化特定查询场景）
  KEY idx_doaj_updated (oa_is_in_doaj, updated_at),
  KEY idx_type_cited (oa_type, oa_cited_by_count),
  KEY idx_cover_updated (cover_image_name, updated_at),

  -- 索引：ISSN
  KEY idx_doaj_eissn (doaj_eissn),
  KEY idx_doaj_pissn (doaj_pissn),

  -- 全文索引：支持期刊名称搜索（跨三列）
  FULLTEXT KEY ft_journal_titles (oa_display_name, cr_title, doaj_title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 2. 封面图片独立存储表
-- 将 MEDIUMBLOB 从 journals 大表拆出，降低主表体积
-- journals 表保留 cover_image_name 用于筛选（已有索引）
-- 注意：代码层自动将所有图片转换为 WebP 格式存储
-- =============================================
CREATE TABLE IF NOT EXISTS journal_covers (
  journal_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '期刊 ID（journals.id）',
  image MEDIUMBLOB NOT NULL COMMENT '封面图片二进制数据',
  image_type VARCHAR(50) NOT NULL DEFAULT 'image/webp' COMMENT 'MIME 类型（默认 WebP，代码层自动转换）',
  image_name VARCHAR(255) NOT NULL COMMENT '文件名',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='期刊封面图片（从 journals 表拆分，避免 BLOB 拖慢主表查询）';

-- =============================================
-- 3. SCImago 收录期刊缓存表
-- 用独立小表代替在 journals 大表上加列，
-- 行存在 = 该期刊被 SCImago 收录
-- =============================================
CREATE TABLE IF NOT EXISTS journal_scimago_cache (
  journal_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '期刊 ID（journals.id）',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SCImago 收录期刊缓存（行存在=收录，查询时 JOIN 代替 EXISTS 子查询）';

-- =============================================
-- 4. 图片搜索结果缓存表
-- 保存搜索 API 返回的结果，避免重复消耗 API 次数
-- 下载失败时可利用缓存结果重试
-- =============================================
CREATE TABLE IF NOT EXISTS journal_image_search_cache (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL COMMENT '期刊 ID (OpenAlex ID)',
  journal_name TEXT COMMENT '期刊名称（冗余，方便查看）',
  search_query VARCHAR(500) NOT NULL COMMENT '搜索关键词',
  results_json JSON NOT NULL COMMENT '搜索结果 JSON 数组 [{url, thumbnail, title, width, height, contextUrl}]',
  result_count INT NOT NULL DEFAULT 0 COMMENT '搜索结果数量',
  tried_indices JSON DEFAULT NULL COMMENT '已尝试下载的候选索引 [0,1,2...]',
  status ENUM('pending', 'downloaded', 'failed', 'expired') NOT NULL DEFAULT 'pending' COMMENT '状态: pending=待重试, downloaded=已成功下载, failed=全部候选失败, expired=已过期',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '搜索时间',
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_cache_journal (journal_id),
  KEY idx_cache_journal_id (journal_id),
  KEY idx_cache_status (status),
  KEY idx_cache_journal_status (journal_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='图片搜索结果缓存';

-- =============================================
-- 5. ISSN 别名映射表
-- =============================================
CREATE TABLE IF NOT EXISTS issn_aliases (
  issn VARCHAR(9) NOT NULL PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL,
  kind ENUM('print', 'electronic', 'linking', 'unknown') NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_issn_aliases_journal_id (journal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 6. 抓取状态表
-- =============================================
CREATE TABLE IF NOT EXISTS fetch_status (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL,
  source ENUM('openalex', 'crossref', 'doaj', 'nlm', 'wikidata', 'wikipedia') NOT NULL,
  status ENUM('pending', 'success', 'no_data', 'failed') NOT NULL DEFAULT 'pending',
  http_status INT DEFAULT NULL,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  version VARCHAR(20) DEFAULT NULL,
  last_fetched_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_journal_source (journal_id, source),
  KEY idx_fetch_status_version_status (version, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 7. 爬取任务表
-- =============================================
CREATE TABLE IF NOT EXISTS crawl_runs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  type ENUM('full', 'incremental', 'wikipedia') NOT NULL,
  phase VARCHAR(50) NOT NULL,
  status ENUM('running', 'stopped', 'completed', 'failed') NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME DEFAULT NULL,
  openalex_cursor TEXT,
  params_json JSON DEFAULT NULL,
  total_journals INT DEFAULT 0,
  processed INT DEFAULT 0,
  succeeded INT DEFAULT 0,
  failed INT DEFAULT 0,
  current_journal_id VARCHAR(32) DEFAULT NULL,
  last_error TEXT,
  producer_status ENUM('running', 'paused', 'completed') DEFAULT 'running' COMMENT '生产者状态（OpenAlex 收集线程）',
  consumer_status ENUM('running', 'waiting', 'completed') DEFAULT 'waiting' COMMENT '消费者状态（其他数据源抓取线程）',
  producer_error TEXT COMMENT '生产者错误信息',
  collected_count INT DEFAULT 0 COMMENT '已收集的期刊数量'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 8. 系统配置表
-- =============================================
CREATE TABLE IF NOT EXISTS system_config (
  `key` VARCHAR(100) NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始化默认配置
INSERT IGNORE INTO system_config(`key`, value, updated_at) VALUES
  ('google_search_config', '{"apiKeys":[],"proxies":[]}', NOW()),
  ('nlm_api_keys', '{"keys":[]}', NOW());

-- =============================================
-- 9. SCImago 期刊排名数据表
-- =============================================
CREATE TABLE IF NOT EXISTS scimago_rankings (
  sourceid BIGINT NOT NULL COMMENT 'SCImago 内部 ID',
  year SMALLINT NOT NULL COMMENT '数据年份',
  `rank` INT DEFAULT NULL COMMENT '当年排名',
  title VARCHAR(500) DEFAULT NULL COMMENT '期刊标题',
  type VARCHAR(50) DEFAULT NULL COMMENT '类型 (journal/book series/conference)',
  issns JSON DEFAULT NULL COMMENT 'ISSN 数组',
  publisher VARCHAR(500) DEFAULT NULL COMMENT '出版社',
  is_open_access TINYINT(1) DEFAULT '0' COMMENT '是否开放获取',
  is_diamond_oa TINYINT(1) DEFAULT '0' COMMENT '是否钻石 OA',
  sjr DECIMAL(10,4) DEFAULT NULL COMMENT 'SJR 指标',
  sjr_quartile VARCHAR(10) DEFAULT NULL COMMENT 'SJR 分区 (Q1/Q2/Q3/Q4)',
  h_index INT DEFAULT NULL COMMENT 'H 指数',
  total_docs INT DEFAULT NULL COMMENT '当年文档数',
  total_docs_3years INT DEFAULT NULL COMMENT '近 3 年文档数',
  total_refs INT DEFAULT NULL COMMENT '总参考文献数',
  total_citations_3years INT DEFAULT NULL COMMENT '近 3 年被引数',
  citable_docs_3years INT DEFAULT NULL COMMENT '近 3 年可引用文档数',
  citations_per_doc_2years DECIMAL(10,2) DEFAULT NULL COMMENT '近 2 年篇均被引',
  refs_per_doc DECIMAL(10,2) DEFAULT NULL COMMENT '篇均参考文献',
  female_percent DECIMAL(5,2) DEFAULT NULL COMMENT '女性作者比例',
  overton INT DEFAULT NULL COMMENT 'Overton 指标',
  sdg INT DEFAULT NULL COMMENT 'SDG 指标',
  country VARCHAR(100) DEFAULT NULL COMMENT '国家',
  region VARCHAR(100) DEFAULT NULL COMMENT '地区',
  coverage VARCHAR(500) DEFAULT NULL COMMENT '收录年份范围',
  categories TEXT COMMENT '学科分类及分区',
  areas TEXT COMMENT '领域',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (sourceid, year),
  KEY idx_scimago_year (year),
  KEY idx_scimago_quartile (sjr_quartile, year),
  KEY idx_scimago_sjr (sjr DESC),
  KEY idx_scimago_hindex (h_index DESC),
  KEY idx_scimago_country (country),
  KEY idx_scimago_year_rank (year, `rank`),
  FULLTEXT KEY idx_scimago_title_ft (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SCImago 期刊排名数据';

-- =============================================
-- 10. SCImago ISSN 关联索引表
-- =============================================
CREATE TABLE IF NOT EXISTS scimago_issn_index (
  issn VARCHAR(9) NOT NULL COMMENT '标准化 ISSN (如 1234-5678)',
  sourceid BIGINT NOT NULL COMMENT 'SCImago ID',
  year SMALLINT NOT NULL COMMENT '年份',
  PRIMARY KEY (issn, sourceid, year),
  KEY idx_scimago_issn_sourceid (sourceid, year),
  CONSTRAINT scimago_issn_index_ibfk_1 FOREIGN KEY (sourceid, year) REFERENCES scimago_rankings (sourceid, year) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SCImago ISSN 关联索引';
