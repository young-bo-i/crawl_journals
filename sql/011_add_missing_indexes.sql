-- =============================================
-- 补充缺失索引，消除全表扫描
-- 版本: 011
-- =============================================

-- P0: journals.issn_l — resolveJournalId() 和 SCImago EXISTS 子查询依赖此列
CREATE INDEX idx_issn_l ON journals(issn_l);

-- P0: journals.updated_at — 期刊列表默认排序字段 ORDER BY updated_at DESC
CREATE INDEX idx_updated_at ON journals(updated_at);

-- P1: journals.oa_works_count — 范围筛选 + 排序（原 idx_oa_works 因 is_open_access 列删除已失效）
CREATE INDEX idx_oa_works_count ON journals(oa_works_count);

-- P1: journals.oa_cited_by_count — 范围筛选 + 排序
CREATE INDEX idx_oa_cited_by_count ON journals(oa_cited_by_count);

-- P1: journals.oa_country_code — 国家筛选（migration 006 新增列，未建索引）
CREATE INDEX idx_oa_country_code ON journals(oa_country_code);

-- P1: issn_aliases.journal_id — getAliasesByJournalId() WHERE journal_id = ?
CREATE INDEX idx_issn_aliases_journal_id ON issn_aliases(journal_id);

-- P2: scimago_rankings(year, rank) — SCImago 列表 WHERE year = ? ORDER BY rank
CREATE INDEX idx_scimago_year_rank ON scimago_rankings(year, `rank`);
