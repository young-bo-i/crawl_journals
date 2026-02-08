-- 为 journal_covers 表添加 COS 对象键列
-- 迁移期间 cos_key 与 image BLOB 共存；迁移完成后可手动 DROP COLUMN image 释放空间
ALTER TABLE journal_covers
  ADD COLUMN cos_key VARCHAR(512) DEFAULT NULL COMMENT 'COS 对象存储键名（如 covers/abc123.webp）'
  AFTER journal_id;
