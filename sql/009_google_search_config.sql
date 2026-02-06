-- =============================================
-- Google Custom Search 图片搜索配置
-- 用于在期刊列表中搜索封面图片
-- 配置存储在 system_config 表（key-value）中
-- =============================================

-- 初始化 Google 搜索配置默认值（空配置，需要用户在设置页面填写）
INSERT IGNORE INTO system_config(`key`, value, updated_at)
VALUES('google_search_config', '{"apiKey":"","cx":""}', NOW());
