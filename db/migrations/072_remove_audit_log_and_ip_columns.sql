-- Migration 072: Remove participant_audit_log table and IP tracking columns
-- Purpose: Remove unused audit logging and IP tracking features
-- Date: 2025-10-31
-- Risk: LOW (audit log never used, IP columns never populated)

BEGIN;

-- ============================================================================
-- 1. Drop participant_audit_log table
-- ============================================================================
-- Table was created but logParticipantAudit() function was never called
-- No audit logs exist in production

DROP TABLE IF EXISTS participant_audit_log CASCADE;

-- Log the action
DO $$
BEGIN
  RAISE NOTICE '✅ Dropped participant_audit_log table (never used in production)';
END $$;


-- ============================================================================
-- 2. Remove IP tracking from telegram_auth_codes
-- ============================================================================
-- These columns were defined but never populated during auth flow

ALTER TABLE telegram_auth_codes
  DROP COLUMN IF EXISTS ip_address CASCADE,
  DROP COLUMN IF EXISTS user_agent CASCADE;

COMMENT ON TABLE telegram_auth_codes IS 'Telegram authorization codes. Columns ip_address, user_agent removed as unused (migration 072)';


-- ============================================================================
-- Verify Changes
-- ============================================================================

DO $$
DECLARE
  table_exists BOOLEAN;
  columns_dropped INTEGER := 0;
BEGIN
  -- Verify table is dropped
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'participant_audit_log'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RAISE NOTICE '✅ participant_audit_log table successfully dropped';
  ELSE
    RAISE WARNING '⚠️ participant_audit_log table still exists';
  END IF;
  
  -- Verify ip_address is dropped
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_auth_codes' 
    AND column_name = 'ip_address'
  ) THEN
    columns_dropped := columns_dropped + 1;
  END IF;
  
  -- Verify user_agent is dropped
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_auth_codes' 
    AND column_name = 'user_agent'
  ) THEN
    columns_dropped := columns_dropped + 1;
  END IF;
  
  IF columns_dropped = 2 THEN
    RAISE NOTICE '✅ Both IP tracking columns dropped from telegram_auth_codes';
  ELSE
    RAISE WARNING '⚠️ Expected 2 columns dropped, got %', columns_dropped;
  END IF;
  
  RAISE NOTICE '✅ Migration 072 completed successfully';
  RAISE NOTICE '📊 Removed: 1 table, 2 columns';
END $$;

COMMIT;

-- ============================================================================
-- Summary
-- ============================================================================
-- Tables Removed: 1 (participant_audit_log)
-- Columns Removed: 2 (telegram_auth_codes.ip_address, user_agent)
--
-- Risk Level: LOW
-- Impact: Zero (unused features)
-- 
-- Related Files to Clean Up:
--   - lib/server/participants/audit.ts (delete)
--   - app/lib/participants/audit.ts (delete)
--
-- See docs/DATABASE_UNUSED_COLUMNS_AUDIT.md for detailed analysis
-- ============================================================================

