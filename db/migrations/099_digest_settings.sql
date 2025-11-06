-- Migration 099: Digest Settings
-- Date: Nov 6, 2025
-- Purpose: Add weekly digest configuration to organizations and memberships

-- Add digest settings to organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS digest_day INT DEFAULT 1 CHECK (digest_day >= 0 AND digest_day <= 6),
ADD COLUMN IF NOT EXISTS digest_time TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.digest_enabled IS 'Whether weekly digest is enabled';
COMMENT ON COLUMN organizations.digest_day IS 'Day of week for digest (0=Sunday, 1=Monday, etc.)';
COMMENT ON COLUMN organizations.digest_time IS 'Time of day to send digest (org timezone)';
COMMENT ON COLUMN organizations.last_digest_sent_at IS 'Timestamp of last successful digest send';

-- Add digest notification preference to memberships
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS digest_notifications BOOLEAN DEFAULT true;

COMMENT ON COLUMN memberships.digest_notifications IS 'Whether user wants to receive weekly digest notifications';

-- Index for cron query (find orgs that need digest today)
CREATE INDEX IF NOT EXISTS idx_orgs_digest_enabled 
ON organizations(digest_enabled, digest_day, timezone) 
WHERE digest_enabled = true;

-- Set default timezone for existing orgs if not set
UPDATE organizations 
SET timezone = 'Europe/Moscow' 
WHERE timezone IS NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 099 Complete: Digest settings added to organizations and memberships.'; END $$;

