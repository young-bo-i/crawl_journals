-- =============================================
-- 添加额外索引以优化查询性能
-- 版本: 002
-- 注意: 如果索引已存在，会被迁移系统自动跳过
-- =============================================

-- 布尔筛选字段索引
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

-- 类型/分类字段索引
CREATE INDEX idx_oa_type ON journals(oa_type);
CREATE INDEX idx_doaj_country ON journals(doaj_country);

-- 年份字段索引（用于范围查询和排序）
CREATE INDEX idx_oa_first_publication_year ON journals(oa_first_publication_year);
CREATE INDEX idx_oa_last_publication_year ON journals(oa_last_publication_year);

-- 数值字段索引（用于排序和范围查询）
CREATE INDEX idx_oa_apc_usd ON journals(oa_apc_usd);
CREATE INDEX idx_doaj_publication_time_weeks ON journals(doaj_publication_time_weeks);
CREATE INDEX idx_oa_oa_works_count ON journals(oa_oa_works_count);

-- 时间字段索引
CREATE INDEX idx_created_at ON journals(created_at);
CREATE INDEX idx_oa_created_date ON journals(oa_created_date);
CREATE INDEX idx_oa_updated_date ON journals(oa_updated_date);

-- 复合索引（常用查询组合）
CREATE INDEX idx_oa_works ON journals(is_open_access, oa_works_count);
CREATE INDEX idx_country_works ON journals(country, oa_works_count);
CREATE INDEX idx_doaj_updated ON journals(oa_is_in_doaj, updated_at);
CREATE INDEX idx_type_cited ON journals(oa_type, oa_cited_by_count);

-- ISSN 相关索引
CREATE INDEX idx_doaj_eissn ON journals(doaj_eissn);
CREATE INDEX idx_doaj_pissn ON journals(doaj_pissn);
