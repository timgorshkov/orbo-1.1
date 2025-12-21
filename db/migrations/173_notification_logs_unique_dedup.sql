-- Add UNIQUE constraint on (rule_id, dedup_hash) to prevent duplicate notifications
-- This ensures that even with race conditions, only one notification per hash is saved

-- First, remove any existing duplicates (keep the oldest)
DELETE FROM notification_logs a
USING notification_logs b
WHERE a.id > b.id 
  AND a.rule_id = b.rule_id 
  AND a.dedup_hash = b.dedup_hash;

-- Add unique constraint
ALTER TABLE notification_logs
ADD CONSTRAINT notification_logs_rule_dedup_unique UNIQUE (rule_id, dedup_hash);

COMMENT ON CONSTRAINT notification_logs_rule_dedup_unique ON notification_logs IS 
  'Prevents duplicate notifications for the same rule and dedup hash';

