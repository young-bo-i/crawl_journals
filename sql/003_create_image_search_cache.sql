-- =============================================
-- 图片搜索结果缓存表
-- 保存搜索 API 返回的结果，避免重复消耗 API 次数
-- 下载失败时可利用缓存结果重试
-- =============================================

CREATE TABLE IF NOT EXISTS journal_image_search_cache (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  journal_id VARCHAR(32) NOT NULL COMMENT '期刊 ID (OpenAlex ID)',
  journal_name TEXT COMMENT '期刊名称（冗余，方便查看）',
  search_query VARCHAR(500) NOT NULL COMMENT '搜索关键词',
  results_json JSON NOT NULL COMMENT '搜索结果 JSON 数组 [{url, thumbnail, title, width, height, contextUrl}]',
  result_count INT NOT NULL DEFAULT 0 COMMENT '搜索结果数量',
  tried_indices JSON COMMENT '已尝试下载的候选索引 [0,1,2...]',
  status ENUM('pending', 'downloaded', 'failed', 'expired') NOT NULL DEFAULT 'pending' COMMENT '状态: pending=待重试, downloaded=已成功下载, failed=全部候选失败, expired=已过期',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '搜索时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  INDEX idx_cache_journal_id (journal_id),
  INDEX idx_cache_status (status),
  INDEX idx_cache_journal_status (journal_id, status),
  UNIQUE INDEX uk_cache_journal (journal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='图片搜索结果缓存';
