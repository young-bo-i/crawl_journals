-- =============================================
-- 为 journals 表添加 in_scimago 物化标志列
-- 将原先查询时的 EXISTS 子查询（关联 scimago_issn_index）
-- 替换为预计算的布尔列，大幅提升查询性能
-- =============================================

-- 添加列（默认 FALSE，幂等：重复执行会被 error 1060 忽略）
ALTER TABLE journals ADD COLUMN in_scimago BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否被 SCImago 收录（物化标志，由导入流程维护）';

-- 单列索引：用于仅按 in_scimago 筛选的场景
ALTER TABLE journals ADD INDEX idx_in_scimago (in_scimago);

-- 复合索引：覆盖 inScimago=true & hasCover=false & ORDER BY updated_at DESC 的高频查询
ALTER TABLE journals ADD INDEX idx_in_scimago_cover_updated (in_scimago, cover_image_name, updated_at);
