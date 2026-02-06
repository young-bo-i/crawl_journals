-- =============================================
-- NLM (NCBI E-utilities) API Key 配置
-- 用于提升 NLM 数据源的请求限额（5 rps → 10 rps）
-- 支持多 Key 轮询使用
-- 配置存储在 system_config 表（key-value）中
-- =============================================

-- 初始化 NLM API Key 配置默认值（空配置，需要在设置页面填写）
-- keys: 多组 API Key + Email，轮询使用
INSERT IGNORE INTO system_config(`key`, value, updated_at)
VALUES('nlm_api_keys', '{"keys":[]}', NOW());
