-- Migration 080: Remove legacy verification columns from telegram_groups
-- Date: Nov 4, 2025
-- Purpose: Remove unused/redundant verification columns that duplicate bot_status

-- These columns were historically used but are now redundant:
-- 1. analytics_enabled - never read, only set (no actual analytics filtering)
-- 2. verification_status - duplicates bot_status, not updated automatically
-- 3. verified_by_user_id - related to verification_status, not used
-- 4. last_verification_at - related to verification_status, not used

-- bot_status is the single source of truth (updated automatically via my_chat_member webhook):
--   'connected' = bot has admin rights
--   'pending' = bot does NOT have admin rights
--   'inactive' = bot was removed from group

-- Step 1: Drop columns
ALTER TABLE telegram_groups 
DROP COLUMN IF EXISTS analytics_enabled,
DROP COLUMN IF EXISTS verification_status,
DROP COLUMN IF EXISTS verified_by_user_id,
DROP COLUMN IF EXISTS last_verification_at;

-- Step 2: Add comment to bot_status
COMMENT ON COLUMN telegram_groups.bot_status IS 'Bot status in the chat: connected (admin), pending (no admin), inactive (removed). Updated automatically via my_chat_member webhook.';

DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 080 Complete: Removed legacy verification columns'; 
  RAISE NOTICE '  - analytics_enabled (never read)';
  RAISE NOTICE '  - verification_status (duplicates bot_status)';
  RAISE NOTICE '  - verified_by_user_id (not used)';
  RAISE NOTICE '  - last_verification_at (not used)';
  RAISE NOTICE 'Use bot_status as the single source of truth for admin rights.';
END $$;

