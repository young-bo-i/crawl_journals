-- =============================================
-- 期刊爬虫系统 MySQL 数据库初始化脚本
-- 主键: OpenAlex ID (如 S4210228046)
-- 合并了全部历史迁移 (001-012) 的最终状态
-- 注意: 使用 IF NOT EXISTS / INSERT IGNORE 保证幂等性
-- =============================================

-- 期刊主表
CREATE TABLE IF NOT EXISTS journals (
  id VARCHAR(32) PRIMARY KEY COMMENT 'OpenAlex ID',
  issn_l VARCHAR(9) COMMENT 'Linking ISSN',
  issns JSON COMMENT 'ISSN 列表',

  -- OpenAlex 字段（基础数据源）
  oa_display_name TEXT COMMENT '期刊显示名称',
  oa_type VARCHAR(50) COMMENT '期刊类型',
  oa_alternate_titles JSON COMMENT '别名列表',
  oa_host_organization TEXT COMMENT '出版机构名称',
  oa_host_organization_id VARCHAR(50) COMMENT '出版机构 OpenAlex ID',
  oa_host_organization_lineage JSON COMMENT '组织层级结构',
  oa_country_code VARCHAR(10) COMMENT '国家/地区代码',
  oa_homepage_url TEXT COMMENT '期刊主页 URL',
  oa_works_count INT COMMENT '作品总数',
  oa_cited_by_count INT COMMENT '被引总数',
  oa_works_api_url VARCHAR(500) COMMENT '作品 API 地址',
  oa_apc_prices JSON COMMENT 'APC 价格列表',
  oa_apc_usd INT COMMENT 'APC 美元价格',
  oa_counts_by_year JSON COMMENT '年度统计',
  oa_first_publication_year INT COMMENT '首次发表年',
  oa_last_publication_year INT COMMENT '最后发表年',
  oa_is_core BOOLEAN COMMENT '是否核心期刊',
  oa_is_oa BOOLEAN COMMENT '是否开放获取',
  oa_is_high_oa_rate BOOLEAN COMMENT '是否高 OA 率',
  oa_is_high_oa_rate_since_year INT COMMENT '高 OA 率起始年',
  oa_is_in_doaj BOOLEAN COMMENT '是否 DOAJ 收录',
  oa_is_in_doaj_since_year INT COMMENT 'DOAJ 收录年',
  oa_is_in_scielo BOOLEAN COMMENT '是否 SciELO 收录',
  oa_is_ojs BOOLEAN COMMENT '是否 OJS 平台',
  oa_oa_flip_year INT COMMENT 'OA 转型年',
  oa_oa_works_count INT COMMENT 'OA 作品数',
  oa_societies JSON COMMENT '学会组织',
  oa_summary_stats JSON COMMENT '汇总统计',
  oa_topics JSON COMMENT '主题领域',
  oa_topic_share JSON COMMENT '主题分布',
  oa_ids JSON COMMENT '外部平台 ID',
  oa_created_date DATE COMMENT 'OpenAlex 创建日期',
  oa_updated_date DATE COMMENT 'OpenAlex 更新日期',

  -- Crossref 字段
  cr_title TEXT COMMENT 'Crossref 标题',
  cr_publisher VARCHAR(500) COMMENT 'Crossref 出版社',
  cr_subjects JSON COMMENT 'Crossref 学科',
  cr_issn_types JSON COMMENT 'ISSN 类型',
  cr_url VARCHAR(500) COMMENT 'Crossref 链接',
  cr_last_status_check_time BIGINT COMMENT '状态检查时间戳',
  cr_counts JSON COMMENT 'DOI 统计',
  cr_breakdowns JSON COMMENT '细分统计',
  cr_coverage JSON COMMENT '覆盖率',
  cr_coverage_type JSON COMMENT '覆盖率类型',
  cr_flags JSON COMMENT '标志位',

  -- DOAJ 字段
  doaj_title TEXT COMMENT 'DOAJ 标题',
  doaj_publisher VARCHAR(500) COMMENT 'DOAJ 出版社',
  doaj_country VARCHAR(10) COMMENT 'DOAJ 国家',
  doaj_languages JSON COMMENT '语种',
  doaj_subjects JSON COMMENT '学科分类',
  doaj_links JSON COMMENT '相关链接',
  doaj_apc JSON COMMENT 'APC 信息',
  doaj_license JSON COMMENT '许可证',
  doaj_alternative_title TEXT COMMENT '备选标题',
  doaj_article JSON COMMENT '文章信息',
  doaj_boai BOOLEAN COMMENT 'BOAI 兼容',
  doaj_copyright JSON COMMENT '版权信息',
  doaj_deposit_policy JSON COMMENT '存储政策',
  doaj_discontinued_date VARCHAR(20) COMMENT '停刊日期',
  doaj_editorial JSON COMMENT '编辑信息',
  doaj_eissn VARCHAR(9) COMMENT '电子 ISSN',
  doaj_pissn VARCHAR(9) COMMENT '印刷 ISSN',
  doaj_institution JSON COMMENT '所属机构',
  doaj_is_replaced_by JSON COMMENT '被替代期刊',
  doaj_keywords JSON COMMENT '关键词',
  doaj_labels JSON COMMENT '标签',
  doaj_oa_start JSON COMMENT 'OA 起始时间',
  doaj_other_charges JSON COMMENT '其他费用',
  doaj_pid_scheme JSON COMMENT '标识符方案',
  doaj_plagiarism JSON COMMENT '查重政策',
  doaj_preservation JSON COMMENT '长期保存',
  doaj_publication_time_weeks INT COMMENT '出版周期(周)',
  doaj_ref JSON COMMENT '引用政策',
  doaj_replaces JSON COMMENT '替代期刊',
  doaj_waiver JSON COMMENT '费用减免',

  -- NLM 字段
  nlm_in_catalog BOOLEAN DEFAULT FALSE COMMENT 'NLM 是否收录',
  nlm_uids JSON COMMENT 'NLM UID 列表',

  -- Wikidata 字段
  wikidata_has_entity BOOLEAN DEFAULT FALSE COMMENT '是否有 Wikidata 实体',
  wikidata_homepage VARCHAR(1000) COMMENT 'Wikidata 主页',

  -- Wikipedia 字段
  wikipedia_has_article BOOLEAN DEFAULT FALSE COMMENT '是否有 Wikipedia 条目',
  wikipedia_article_title TEXT COMMENT 'Wikipedia 标题',
  wikipedia_extract TEXT COMMENT 'Wikipedia 摘要',
  wikipedia_description TEXT COMMENT 'Wikipedia 描述',
  wikipedia_thumbnail VARCHAR(1000) COMMENT 'Wikipedia 缩略图',
  wikipedia_categories JSON COMMENT 'Wikipedia 分类',
  wikipedia_infobox JSON COMMENT 'Wikipedia 信息框',

  -- 封面图片
  cover_image MEDIUMBLOB COMMENT '期刊封面图片',
  cover_image_type VARCHAR(50) COMMENT '封面图片 MIME 类型',
  cover_image_name VARCHAR(255) COMMENT '封面图片原始文件名',

  -- 用户自定义字段
  custom_title TEXT COMMENT '用户自定义标题',
  custom_publisher VARCHAR(500) COMMENT '用户自定义出版社',
  custom_country VARCHAR(10) COMMENT '用户自定义国家/地区',
  custom_homepage VARCHAR(1000) COMMENT '用户自定义主页',
  custom_description TEXT COMMENT '用户自定义描述',
  custom_notes TEXT COMMENT '用户备注',
  custom_updated_at DATETIME COMMENT '自定义字段更新时间',

  -- 元信息
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  -- 索引：布尔筛选
  INDEX idx_oa_is_in_doaj (oa_is_in_doaj),
  INDEX idx_oa_is_in_scielo (oa_is_in_scielo),
  INDEX idx_oa_is_ojs (oa_is_ojs),
  INDEX idx_oa_is_core (oa_is_core),
  INDEX idx_oa_is_oa (oa_is_oa),
  INDEX idx_oa_is_high_oa_rate (oa_is_high_oa_rate),
  INDEX idx_nlm_in_catalog (nlm_in_catalog),
  INDEX idx_wikidata_has_entity (wikidata_has_entity),
  INDEX idx_wikipedia_has_article (wikipedia_has_article),
  INDEX idx_doaj_boai (doaj_boai),

  -- 索引：分类/筛选
  INDEX idx_oa_type (oa_type),
  INDEX idx_doaj_country (doaj_country),
  INDEX idx_oa_country_code (oa_country_code),
  INDEX idx_issn_l (issn_l),

  -- 索引：年份范围
  INDEX idx_oa_first_publication_year (oa_first_publication_year),
  INDEX idx_oa_last_publication_year (oa_last_publication_year),

  -- 索引：数值排序/范围
  INDEX idx_oa_apc_usd (oa_apc_usd),
  INDEX idx_doaj_publication_time_weeks (doaj_publication_time_weeks),
  INDEX idx_oa_oa_works_count (oa_oa_works_count),
  INDEX idx_oa_works_count (oa_works_count),
  INDEX idx_oa_cited_by_count (oa_cited_by_count),

  -- 索引：时间排序
  INDEX idx_created_at (created_at),
  INDEX idx_updated_at (updated_at),
  INDEX idx_oa_created_date (oa_created_date),
  INDEX idx_oa_updated_date (oa_updated_date),

  -- 索引：复合
  INDEX idx_doaj_updated (oa_is_in_doaj, updated_at),
  INDEX idx_type_cited (oa_type, oa_cited_by_count),

  -- 索引：ISSN
  INDEX idx_doaj_eissn (doaj_eissn),
  INDEX idx_doaj_pissn (doaj_pissn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 全文索引（ngram 分词器支持中文搜索）
ALTER TABLE journals ADD FULLTEXT INDEX ft_display_name (oa_display_name) WITH PARSER ngram;
ALTER TABLE journals ADD FULLTEXT INDEX ft_cr_title (cr_title) WITH PARSER ngram;
ALTER TABLE journals ADD FULLTEXT INDEX ft_doaj_title (doaj_title) WITH PARSER ngram;

-- =============================================
-- ISSN 别名映射表
-- =============================================
CREATE TABLE IF NOT EXISTS issn_aliases (
  issn VARCHAR(9) PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL,
  kind ENUM('print', 'electronic', 'linking', 'unknown') NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_issn_aliases_journal_id (journal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 抓取状态表
-- =============================================
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
  UNIQUE KEY uk_journal_source (journal_id, source),
  INDEX idx_fetch_status_version_status (version, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 爬取任务表
-- =============================================
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
  last_error TEXT,
  producer_status ENUM('running', 'paused', 'completed') DEFAULT 'running' COMMENT '生产者状态',
  consumer_status ENUM('running', 'waiting', 'completed') DEFAULT 'waiting' COMMENT '消费者状态',
  producer_error TEXT COMMENT '生产者错误信息',
  collected_count INT DEFAULT 0 COMMENT '已收集的期刊数量'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 系统配置表
-- =============================================
CREATE TABLE IF NOT EXISTS system_config (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始化默认配置
INSERT IGNORE INTO system_config(`key`, value, updated_at) VALUES
  ('google_search_config', '{"apiKeys":[],"proxies":[]}', NOW()),
  ('nlm_api_keys', '{"keys":[]}', NOW());

-- =============================================
-- SCImago 期刊排名数据表
-- =============================================
CREATE TABLE IF NOT EXISTS scimago_rankings (
  sourceid BIGINT NOT NULL COMMENT 'SCImago 内部 ID',
  year SMALLINT NOT NULL COMMENT '数据年份',
  `rank` INT COMMENT '当年排名',
  title VARCHAR(500) COMMENT '期刊标题',
  type VARCHAR(50) COMMENT '类型',
  issns JSON COMMENT 'ISSN 数组',
  publisher VARCHAR(500) COMMENT '出版社',
  is_open_access BOOLEAN DEFAULT FALSE COMMENT '是否开放获取',
  is_diamond_oa BOOLEAN DEFAULT FALSE COMMENT '是否钻石 OA',
  sjr DECIMAL(10,4) COMMENT 'SJR 指标',
  sjr_quartile VARCHAR(10) COMMENT 'SJR 分区',
  h_index INT COMMENT 'H 指数',
  total_docs INT COMMENT '当年文档数',
  total_docs_3years INT COMMENT '近 3 年文档数',
  total_refs INT COMMENT '总参考文献数',
  total_citations_3years INT COMMENT '近 3 年被引数',
  citable_docs_3years INT COMMENT '近 3 年可引用文档数',
  citations_per_doc_2years DECIMAL(10,2) COMMENT '近 2 年篇均被引',
  refs_per_doc DECIMAL(10,2) COMMENT '篇均参考文献',
  female_percent DECIMAL(5,2) COMMENT '女性作者比例',
  overton INT COMMENT 'Overton 指标',
  sdg INT COMMENT 'SDG 指标',
  country VARCHAR(100) COMMENT '国家',
  region VARCHAR(100) COMMENT '地区',
  coverage VARCHAR(500) COMMENT '收录年份范围',
  categories TEXT COMMENT '学科分类及分区',
  areas TEXT COMMENT '领域',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sourceid, year),
  INDEX idx_scimago_year (year),
  INDEX idx_scimago_quartile (sjr_quartile, year),
  INDEX idx_scimago_sjr (sjr DESC),
  INDEX idx_scimago_hindex (h_index DESC),
  INDEX idx_scimago_country (country),
  INDEX idx_scimago_year_rank (year, `rank`),
  FULLTEXT INDEX idx_scimago_title_ft (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SCImago ISSN 关联索引表
-- =============================================
CREATE TABLE IF NOT EXISTS scimago_issn_index (
  issn VARCHAR(9) NOT NULL COMMENT '标准化 ISSN',
  sourceid BIGINT NOT NULL COMMENT 'SCImago ID',
  year SMALLINT NOT NULL COMMENT '年份',
  PRIMARY KEY (issn, sourceid, year),
  INDEX idx_scimago_issn_sourceid (sourceid, year),
  FOREIGN KEY (sourceid, year) REFERENCES scimago_rankings(sourceid, year) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
