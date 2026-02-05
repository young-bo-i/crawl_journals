-- =============================================
-- SCImago 期刊排名数据表
-- 数据来源: https://www.scimagojr.com/journalrank.php
-- 主键: (sourceid, year) - SCImago ID + 年份
-- =============================================

-- SCImago 排名数据表
CREATE TABLE IF NOT EXISTS scimago_rankings (
  sourceid BIGINT NOT NULL COMMENT 'SCImago 内部 ID',
  year SMALLINT NOT NULL COMMENT '数据年份',
  `rank` INT COMMENT '当年排名',
  title VARCHAR(500) COMMENT '期刊标题',
  type VARCHAR(50) COMMENT '类型 (journal/book series/conference)',
  issns JSON COMMENT '解析后的 ISSN 数组',
  publisher VARCHAR(500) COMMENT '出版社',
  is_open_access BOOLEAN DEFAULT FALSE COMMENT '是否开放获取',
  is_diamond_oa BOOLEAN DEFAULT FALSE COMMENT '是否钻石OA',
  sjr DECIMAL(10,4) COMMENT 'SJR 指标',
  sjr_quartile VARCHAR(10) COMMENT 'SJR 分区 (Q1/Q2/Q3/Q4)',
  h_index INT COMMENT 'H 指数',
  total_docs INT COMMENT '当年文档数',
  total_docs_3years INT COMMENT '近3年文档数',
  total_refs INT COMMENT '总参考文献数',
  total_citations_3years INT COMMENT '近3年被引数',
  citable_docs_3years INT COMMENT '近3年可引用文档数',
  citations_per_doc_2years DECIMAL(10,2) COMMENT '近2年篇均被引',
  refs_per_doc DECIMAL(10,2) COMMENT '篇均参考文献',
  female_percent DECIMAL(5,2) COMMENT '女性作者比例',
  overton INT COMMENT 'Overton 指标',
  sdg INT COMMENT 'SDG 指标',
  country VARCHAR(100) COMMENT '国家',
  region VARCHAR(100) COMMENT '地区',
  coverage VARCHAR(500) COMMENT '收录年份范围',
  categories TEXT COMMENT '学科分类及分区',
  areas TEXT COMMENT '领域',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (sourceid, year),
  INDEX idx_scimago_year (year),
  INDEX idx_scimago_quartile (sjr_quartile, year),
  INDEX idx_scimago_sjr (sjr DESC),
  INDEX idx_scimago_hindex (h_index DESC),
  INDEX idx_scimago_country (country),
  FULLTEXT INDEX idx_scimago_title_ft (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SCImago 期刊排名数据';

-- =============================================
-- ISSN 关联辅助表（用于快速匹配）
-- 将 scimago_rankings.issns JSON 展开为单独的行
-- =============================================

CREATE TABLE IF NOT EXISTS scimago_issn_index (
  issn VARCHAR(9) NOT NULL COMMENT '标准化 ISSN (如 1234-5678)',
  sourceid BIGINT NOT NULL COMMENT 'SCImago ID',
  year SMALLINT NOT NULL COMMENT '年份',
  PRIMARY KEY (issn, sourceid, year),
  INDEX idx_scimago_issn_sourceid (sourceid, year),
  FOREIGN KEY (sourceid, year) REFERENCES scimago_rankings(sourceid, year) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SCImago ISSN 索引表';
