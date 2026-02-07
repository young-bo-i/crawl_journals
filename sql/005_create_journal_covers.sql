-- =============================================
-- 封面图片独立存储表
-- 将 MEDIUMBLOB 从 journals 大表拆出，降低主表体积
-- journals 表保留 cover_image_name 用于筛选（已有索引）
-- =============================================

CREATE TABLE IF NOT EXISTS journal_covers (
  journal_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '期刊 ID（journals.id）',
  image MEDIUMBLOB NOT NULL COMMENT '封面图片二进制数据',
  image_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg' COMMENT 'MIME 类型',
  image_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='期刊封面图片（从 journals 表拆分，避免 BLOB 拖慢主表查询）';
