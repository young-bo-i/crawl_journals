-- =============================================
-- 扩展 display_name 等字段长度
-- 某些期刊名称超过 500 字符
-- 使用 TEXT 类型避免 MySQL 行大小限制 (65535 字节)
-- 添加全文索引支持快速搜索
-- =============================================

-- 将可能超长的字段改为 TEXT 类型
ALTER TABLE journals MODIFY COLUMN oa_display_name TEXT;
ALTER TABLE journals MODIFY COLUMN oa_host_organization TEXT;
ALTER TABLE journals MODIFY COLUMN cr_title TEXT;
ALTER TABLE journals MODIFY COLUMN doaj_title TEXT;
ALTER TABLE journals MODIFY COLUMN doaj_alternative_title TEXT;
ALTER TABLE journals MODIFY COLUMN custom_title TEXT;
ALTER TABLE journals MODIFY COLUMN wikipedia_article_title TEXT;

-- 添加全文索引（使用 ngram 分词器支持中文搜索）
-- ngram_token_size 默认为 2，适合中文
ALTER TABLE journals ADD FULLTEXT INDEX ft_display_name (oa_display_name) WITH PARSER ngram;
ALTER TABLE journals ADD FULLTEXT INDEX ft_cr_title (cr_title) WITH PARSER ngram;
ALTER TABLE journals ADD FULLTEXT INDEX ft_doaj_title (doaj_title) WITH PARSER ngram;
