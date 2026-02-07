-- =============================================
-- SCImago 收录期刊缓存表
-- 用独立小表代替在 journals 大表上加列，
-- 避免 ALTER TABLE 触发全表复制（journals 含 FULLTEXT + MEDIUMBLOB）
-- 行存在 = 该期刊被 SCImago 收录
-- =============================================

CREATE TABLE IF NOT EXISTS journal_scimago_cache (
  journal_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '期刊 ID（journals.id）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SCImago 收录期刊缓存（行存在=收录，查询时 JOIN 代替 EXISTS 子查询）';
