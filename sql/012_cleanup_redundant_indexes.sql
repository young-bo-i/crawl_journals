-- =============================================
-- 清理冗余索引
-- 版本: 012
-- 幂等性: DROP INDEX 不存在时产生 1091 错误，迁移器自动跳过
-- =============================================

-- idx_oa_works 原为复合索引 (is_open_access, oa_works_count)
-- 006 删除 is_open_access 列后退化为单列 (oa_works_count)，与 idx_oa_works_count 重复
DROP INDEX idx_oa_works ON journals;

-- idx_country_works 原为复合索引 (country, oa_works_count)
-- 006 删除 country 列后退化为单列 (oa_works_count)，与 idx_oa_works_count 重复
DROP INDEX idx_country_works ON journals;
