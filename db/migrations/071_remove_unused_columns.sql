-- Migration 071: Remove unused columns from database
-- Purpose: Clean up empty/unused columns identified in database audit
-- Date: 2025-10-31
-- Risk: LOW (all columns are empty and unused)

BEGIN;

-- ============================================================================
-- 1. activity_events: Remove type, participant_id, tg_group_id
-- ============================================================================
-- These columns are empty for all records and never used in INSERT statements

ALTER TABLE activity_events
  DROP COLUMN IF EXISTS type CASCADE,
  DROP COLUMN IF EXISTS participant_id CASCADE,
  DROP COLUMN IF EXISTS tg_group_id CASCADE;

COMMENT ON TABLE activity_events IS 'Stores activity events. Columns type, participant_id, tg_group_id removed as unused (migration 071)';


-- ============================================================================
-- 2. participant_messages: Remove activity_event_id
-- ============================================================================
-- Column defined as FK but never populated

ALTER TABLE participant_messages
  DROP COLUMN IF EXISTS activity_event_id CASCADE;

COMMENT ON TABLE participant_messages IS 'Stores message texts for AI analysis. Column activity_event_id removed as unused (migration 071)';


-- ============================================================================
-- 3. telegram_group_admins: Remove user_telegram_account_id
-- ============================================================================
-- Column empty, logic uses tg_user_id directly

ALTER TABLE telegram_group_admins
  DROP COLUMN IF EXISTS user_telegram_account_id CASCADE;

COMMENT ON TABLE telegram_group_admins IS 'Stores Telegram group admin relationships. Column user_telegram_account_id removed as unused (migration 071)';


-- ============================================================================
-- 4. telegram_groups: Remove org_id, invite_link, added_by_user_id
-- ============================================================================
-- org_id: relationship managed via org_telegram_groups table
-- invite_link: generated on-demand, not stored
-- added_by_user_id: never populated

ALTER TABLE telegram_groups
  DROP COLUMN IF EXISTS org_id CASCADE,
  DROP COLUMN IF EXISTS invite_link CASCADE,
  DROP COLUMN IF EXISTS added_by_user_id CASCADE;

COMMENT ON TABLE telegram_groups IS 'Stores Telegram group metadata. Columns org_id, invite_link, added_by_user_id removed as unused (migration 071). Use org_telegram_groups for org relationships.';


-- ============================================================================
-- OPTIONAL: telegram_auth_codes - ip_address, user_agent
-- ============================================================================
-- Uncomment if IP logging is not planned:

-- ALTER TABLE telegram_auth_codes
--   DROP COLUMN IF EXISTS ip_address CASCADE,
--   DROP COLUMN IF EXISTS user_agent CASCADE;

-- COMMENT ON TABLE telegram_auth_codes IS 'Telegram authorization codes. Columns ip_address, user_agent removed (migration 071)';


-- ============================================================================
-- Verify Changes
-- ============================================================================

DO $$
DECLARE
  dropped_count INTEGER := 0;
BEGIN
  -- Verify columns are dropped
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_events' AND column_name = 'type') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_events' AND column_name = 'participant_id') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_events' AND column_name = 'tg_group_id') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participant_messages' AND column_name = 'activity_event_id') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_group_admins' AND column_name = 'user_telegram_account_id') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_groups' AND column_name = 'org_id') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_groups' AND column_name = 'invite_link') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_groups' AND column_name = 'added_by_user_id') THEN
    dropped_count := dropped_count + 1;
  END IF;
  
  RAISE NOTICE '✅ Migration 071 completed successfully';
  RAISE NOTICE '📊 Dropped % unused columns', dropped_count;
  
  IF dropped_count = 8 THEN
    RAISE NOTICE '✅ All 8 columns dropped as expected';
  ELSE
    RAISE WARNING '⚠️ Expected 8 columns, dropped %', dropped_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Summary
-- ============================================================================
-- Columns Removed: 8
--   - activity_events: type, participant_id, tg_group_id
--   - participant_messages: activity_event_id
--   - telegram_group_admins: user_telegram_account_id
--   - telegram_groups: org_id, invite_link, added_by_user_id
--
-- Risk Level: LOW
-- Impact: Zero (all columns were empty and unused)
-- Performance: Slightly improved (less I/O per query)
--
-- See docs/DATABASE_UNUSED_COLUMNS_AUDIT.md for detailed analysis
-- ============================================================================

