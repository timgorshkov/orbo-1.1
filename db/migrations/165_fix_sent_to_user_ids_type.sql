-- Migration: Fix sent_to_user_ids column type
-- The column was defined as UUID[] but we're storing Telegram user IDs (bigint)

-- Change column type from UUID[] to TEXT[] to store Telegram user IDs
ALTER TABLE notification_logs
  ALTER COLUMN sent_to_user_ids TYPE TEXT[] USING sent_to_user_ids::TEXT[];

-- Add comment explaining the field
COMMENT ON COLUMN notification_logs.sent_to_user_ids IS 'Array of Telegram user IDs who received this notification';

