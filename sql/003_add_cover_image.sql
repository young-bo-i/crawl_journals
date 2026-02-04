-- =============================================
-- 添加期刊封面图片和用户自定义字段
-- 版本: 003
-- 注意: 如果列已存在，会被迁移系统自动跳过
-- =============================================

-- 添加封面图片字段（MEDIUMBLOB 最大支持 16MB）
ALTER TABLE journals ADD COLUMN cover_image MEDIUMBLOB COMMENT '期刊封面图片（二进制存储）';
ALTER TABLE journals ADD COLUMN cover_image_type VARCHAR(50) COMMENT '封面图片 MIME 类型';
ALTER TABLE journals ADD COLUMN cover_image_name VARCHAR(255) COMMENT '封面图片原始文件名';

-- 用户自定义/手动编辑的字段（覆盖爬取的数据）
ALTER TABLE journals ADD COLUMN custom_title VARCHAR(500) COMMENT '用户自定义标题';
ALTER TABLE journals ADD COLUMN custom_publisher VARCHAR(500) COMMENT '用户自定义出版社';
ALTER TABLE journals ADD COLUMN custom_country VARCHAR(10) COMMENT '用户自定义国家/地区';
ALTER TABLE journals ADD COLUMN custom_homepage VARCHAR(1000) COMMENT '用户自定义主页';
ALTER TABLE journals ADD COLUMN custom_description TEXT COMMENT '用户自定义描述';
ALTER TABLE journals ADD COLUMN custom_notes TEXT COMMENT '用户备注';
ALTER TABLE journals ADD COLUMN custom_updated_at DATETIME COMMENT '用户自定义字段最后更新时间';
