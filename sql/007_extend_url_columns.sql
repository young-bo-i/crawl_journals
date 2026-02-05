-- =============================================
-- 扩展 URL 字段长度
-- 某些期刊的主页 URL 可能超过 1000 字符
-- =============================================

-- 将 oa_homepage_url 改为 TEXT 类型（最大 65535 字符）
ALTER TABLE journals MODIFY COLUMN oa_homepage_url TEXT COMMENT 'OpenAlex 期刊主页';
