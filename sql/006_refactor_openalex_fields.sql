-- =============================================
-- 重构期刊表：移除聚合字段，添加缺失的 OpenAlex 字段
-- OpenAlex 数据即为基础数据，无需额外聚合
-- 
-- 幂等性说明：
-- - ADD COLUMN 如果列已存在会报 1060 错误，迁移器会忽略
-- - DROP COLUMN 如果列不存在会报 1091 错误，迁移器会忽略
-- =============================================

-- 添加缺失的 OpenAlex 字段
ALTER TABLE journals ADD COLUMN oa_country_code VARCHAR(10) COMMENT 'OpenAlex 国家代码';
ALTER TABLE journals ADD COLUMN oa_homepage_url VARCHAR(1000) COMMENT 'OpenAlex 期刊主页';
ALTER TABLE journals ADD COLUMN oa_host_organization_id VARCHAR(50) COMMENT 'OpenAlex 出版机构ID';

-- 删除旧的聚合字段（这些字段不再使用，OpenAlex 字段即为基础数据）
ALTER TABLE journals DROP COLUMN title;
ALTER TABLE journals DROP COLUMN publisher;
ALTER TABLE journals DROP COLUMN country;
ALTER TABLE journals DROP COLUMN homepage;
ALTER TABLE journals DROP COLUMN languages;
ALTER TABLE journals DROP COLUMN subjects;
ALTER TABLE journals DROP COLUMN is_open_access;
ALTER TABLE journals DROP COLUMN field_sources;
