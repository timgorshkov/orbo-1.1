-- Add announcement_defaults column to organizations table
-- Stores default groups and topics for auto-created and new announcements
-- Structure: { "target_groups": [tg_chat_id, ...], "target_topics": { "tg_chat_id": topic_id }, "target_max_groups": [max_chat_id, ...] }

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS announcement_defaults JSONB DEFAULT '{}';

COMMENT ON COLUMN organizations.announcement_defaults IS
  'Default groups/topics for announcements. Keys: target_groups (bigint[]), target_topics ({tg_chat_id: topic_id}), target_max_groups (bigint[])';
