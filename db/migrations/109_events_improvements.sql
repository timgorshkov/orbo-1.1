-- Migration 108: Events improvements
-- 1. Add telegram_group_link for public events
-- 2. Remove 'completed' status (will be handled in app logic)

-- Add telegram_group_link field
ALTER TABLE events ADD COLUMN IF NOT EXISTS telegram_group_link TEXT;

COMMENT ON COLUMN events.telegram_group_link IS 'Public Telegram group link for event registration (for public events)';

