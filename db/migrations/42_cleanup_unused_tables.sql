-- Migration 42: Cleanup unused tables
-- Date: 2025-10-16
-- Purpose: Remove unused/duplicate tables to simplify schema

-- =====================================================
-- STEP 1: Remove telegram_activity_events (duplicate of activity_events)
-- =====================================================
DROP TABLE IF EXISTS telegram_activity_events CASCADE;

COMMENT ON TABLE activity_events IS 'All activity events (messages, joins, leaves). Replaced telegram_activity_events.';

-- =====================================================
-- STEP 2: Remove telegram_identities (replaced by user_telegram_accounts)
-- =====================================================

-- First, remove foreign key from participants
ALTER TABLE participants 
DROP COLUMN IF EXISTS identity_id CASCADE;

-- Drop the table
DROP TABLE IF EXISTS telegram_identities CASCADE;

COMMENT ON COLUMN participants.tg_user_id IS 'Telegram user ID. Use user_telegram_accounts for auth.users link.';

-- =====================================================
-- STEP 3: Remove telegram_updates (not implemented)
-- =====================================================
DROP TABLE IF EXISTS telegram_updates CASCADE;

-- If idempotency is needed in the future, implement it via Redis/in-memory cache

-- =====================================================
-- STEP 4: Check and optionally remove old material tables
-- =====================================================

-- Check if these tables have any data
DO $$
DECLARE
  folders_count INTEGER;
  items_count INTEGER;
  access_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO folders_count FROM material_folders;
  SELECT COUNT(*) INTO items_count FROM material_items;
  SELECT COUNT(*) INTO access_count FROM material_access;
  
  RAISE NOTICE 'material_folders has % rows', folders_count;
  RAISE NOTICE 'material_items has % rows', items_count;
  RAISE NOTICE 'material_access has % rows', access_count;
  
  IF folders_count = 0 AND items_count = 0 AND access_count = 0 THEN
    RAISE NOTICE 'All old material tables are empty. Safe to drop.';
    -- Uncomment the following lines to actually drop them:
    -- DROP TABLE IF EXISTS material_access CASCADE;
    -- DROP TABLE IF EXISTS material_items CASCADE;
    -- DROP TABLE IF EXISTS material_folders CASCADE;
  ELSE
    RAISE WARNING 'Old material tables contain data. Manual migration needed!';
  END IF;
END $$;

-- =====================================================
-- STEP 5: Check telegram_bots usage
-- =====================================================
DO $$
DECLARE
  bots_count INTEGER;
  table_exists BOOLEAN;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'telegram_bots'
  ) INTO table_exists;
  
  IF table_exists THEN
    SELECT COUNT(*) INTO bots_count FROM telegram_bots;
    RAISE NOTICE 'telegram_bots has % rows', bots_count;
    
    IF bots_count = 0 THEN
      RAISE NOTICE 'telegram_bots is empty. Consider dropping if per-org bots feature not planned.';
      -- Uncomment to drop:
      -- DROP TABLE IF EXISTS telegram_bots CASCADE;
    END IF;
  ELSE
    RAISE NOTICE 'telegram_bots table does not exist (was never created)';
  END IF;
END $$;

-- =====================================================
-- STEP 6: Add missing indexes for performance
-- =====================================================

-- Participants email lookup
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email) WHERE email IS NOT NULL;

-- Participant messages analysis lookup
CREATE INDEX IF NOT EXISTS idx_participant_messages_analyzed ON participant_messages(analyzed_at) WHERE analyzed_at IS NULL;

-- Event registrations status + event lookup
CREATE INDEX IF NOT EXISTS idx_event_registrations_status_event ON event_registrations(status, event_id);

-- Telegram auth codes cleanup
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_cleanup ON telegram_auth_codes(expires_at, is_used);

DO $$
BEGIN
  RAISE NOTICE 'Added performance indexes';
END $$;

-- =====================================================
-- STEP 7: Add CHECK constraints for data integrity
-- =====================================================

-- Events: end_time must be after start_time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'events_time_order_check'
  ) THEN
    ALTER TABLE events 
    ADD CONSTRAINT events_time_order_check 
    CHECK (end_time > start_time);
    
    RAISE NOTICE 'Added events time order constraint';
  END IF;
END $$;

-- Telegram auth codes: expires_at must be in future
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'telegram_auth_codes_expires_check'
  ) THEN
    ALTER TABLE telegram_auth_codes 
    ADD CONSTRAINT telegram_auth_codes_expires_check 
    CHECK (expires_at > created_at);
    
    RAISE NOTICE 'Added telegram_auth_codes expiry constraint';
  END IF;
END $$;

-- Organization invites: current_uses must not exceed max_uses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'organization_invites_uses_check'
  ) THEN
    ALTER TABLE organization_invites 
    ADD CONSTRAINT organization_invites_uses_check 
    CHECK (max_uses IS NULL OR current_uses <= max_uses);
    
    RAISE NOTICE 'Added organization_invites uses constraint';
  END IF;
END $$;

-- =====================================================
-- FINAL REPORT
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Migration 42: Cleanup completed';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Removed tables:';
  RAISE NOTICE '  - telegram_activity_events (duplicate)';
  RAISE NOTICE '  - telegram_identities (unused)';
  RAISE NOTICE '  - telegram_updates (not implemented)';
  RAISE NOTICE '';
  RAISE NOTICE 'Added indexes for performance';
  RAISE NOTICE 'Added CHECK constraints for data integrity';
  RAISE NOTICE '';
  RAISE NOTICE 'TODO: Review material_* and telegram_bots tables';
  RAISE NOTICE '==============================================';
END $$;

