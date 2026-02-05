-- =============================================
-- 流水线抓取优化：新增生产者/消费者状态字段
-- =============================================

-- 为 crawl_runs 表添加生产者和消费者状态字段
ALTER TABLE crawl_runs 
  ADD COLUMN producer_status ENUM('running', 'paused', 'completed') DEFAULT 'running' COMMENT '生产者状态（OpenAlex收集）',
  ADD COLUMN consumer_status ENUM('running', 'waiting', 'completed') DEFAULT 'waiting' COMMENT '消费者状态（其他数据源抓取）',
  ADD COLUMN producer_error TEXT COMMENT '生产者错误信息',
  ADD COLUMN collected_count INT DEFAULT 0 COMMENT '已收集的期刊数量';

-- 为 fetch_status 表添加索引，优化消费者查询 pending 状态的期刊
-- 注意：MySQL 不支持 IF NOT EXISTS，依靠代码的幂等性处理（忽略 1061 重复索引错误）
CREATE INDEX idx_fetch_status_version_status ON fetch_status(version, status);
