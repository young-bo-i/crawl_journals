-- =============================================
-- 002: 为 cover_image_name 添加索引
-- 优化「封面筛选」查询性能：
--   原先使用 cover_image (MEDIUMBLOB) IS NULL 无法走索引，
--   改用 cover_image_name (VARCHAR) IS NULL 后需要配套索引
-- 幂等：索引已存在时返回 1061，被迁移框架忽略
-- =============================================

CREATE INDEX idx_cover_image_name ON journals(cover_image_name);
