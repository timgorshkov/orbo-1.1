-- Migration: Add archive fields to telegram_groups
-- Description: Add is_archived, archived_at, archived_reason fields that are used in eventProcessingService
-- Also adds index for filtering active groups

-- Add archive fields
ALTER TABLE telegram_groups 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- Index for filtering non-archived groups
CREATE INDEX IF NOT EXISTS idx_telegram_groups_is_archived 
ON telegram_groups(is_archived) WHERE is_archived = FALSE;

-- Update existing groups: mark as archived if bot_status is inactive
UPDATE telegram_groups 
SET is_archived = TRUE, 
    archived_at = last_sync_at,
    archived_reason = 'bot_inactive'
WHERE bot_status = 'inactive' AND is_archived IS NOT TRUE;

COMMENT ON COLUMN telegram_groups.is_archived IS 'Whether the group is archived (bot removed, group deleted, etc)';
COMMENT ON COLUMN telegram_groups.archived_at IS 'When the group was archived';
COMMENT ON COLUMN telegram_groups.archived_reason IS 'Reason for archiving: bot_removed, group_deleted, manual, etc';
