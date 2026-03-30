-- Migration 260: Add forum topic support to announcements
-- Adds is_forum flag to telegram_groups and target_topics to announcements

-- Mark telegram groups that are forums (topics/threads enabled)
ALTER TABLE telegram_groups
  ADD COLUMN IF NOT EXISTS is_forum BOOLEAN NOT NULL DEFAULT false;

-- Store per-group topic selection for each announcement.
-- Format: { "<tg_chat_id>": <topic_id_integer> }
-- If a group's chat_id is absent from the map, message goes to General / no topic.
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_topics JSONB NOT NULL DEFAULT '{}';

-- Index for querying forum groups quickly
CREATE INDEX IF NOT EXISTS idx_telegram_groups_is_forum
  ON telegram_groups (is_forum)
  WHERE is_forum = true;
