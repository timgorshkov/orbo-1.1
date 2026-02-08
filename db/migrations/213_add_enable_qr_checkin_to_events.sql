-- Migration 213: Add enable_qr_checkin to events
-- Date: Jan 26, 2026
-- Purpose: Add enable_qr_checkin boolean flag to events table to allow admins to enable/disable QR check-in

-- ============================================
-- STEP 1: Add enable_qr_checkin column
-- ============================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS enable_qr_checkin BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN events.enable_qr_checkin IS 'If true, participants will receive QR codes for check-in';

-- ============================================
-- STEP 2: Backfill existing events
-- ============================================

-- All existing events should have QR check-in enabled by default
UPDATE events
SET enable_qr_checkin = true
WHERE enable_qr_checkin IS NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 213 Complete: Added enable_qr_checkin to events table'; END $$;
