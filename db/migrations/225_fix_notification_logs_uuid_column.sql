-- =============================================
-- Migration 225: Fix notification_logs.sent_to_user_ids column type
-- 
-- Problem: Column was UUID[] but code passes Telegram user IDs (numbers)
-- which are NOT valid UUIDs. This caused silent insert failures,
-- preventing notifications from being saved to DB and displayed in UI.
--
-- Fix: Change column type from UUID[] to TEXT[] to accept any ID format.
-- =============================================

ALTER TABLE notification_logs 
  ALTER COLUMN sent_to_user_ids TYPE TEXT[] USING sent_to_user_ids::TEXT[];

COMMENT ON COLUMN notification_logs.sent_to_user_ids IS 'IDs получателей (Telegram user IDs). Ранее был UUID[], исправлен на TEXT[].';
