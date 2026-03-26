-- Migration 254: Optimize activity_events and participant_messages
-- Phase 1: Safe optimizations (unused indexes + redundant meta fields)
--
-- Expected savings:
--   Index drops: ~37 MB (17 MB activity_events + 20 MB participant_messages)
--   Meta cleanup: ~5-8 MB (removing duplicated fields from JSONB)
--   Total: ~42-45 MB

BEGIN;

-- ============================================================================
-- PART 1: Drop unused indexes on activity_events
-- ============================================================================

-- 0 scans ever, 8 KB - column reply_to_user_id is never queried via index
DROP INDEX IF EXISTS idx_activity_events_reply_to_user;

-- 5 scans, 2 MB - platform column has very low cardinality, seq scan is faster
DROP INDEX IF EXISTS idx_activity_events_platform;

-- 298 scans, 2 MB - messenger_type has very low cardinality, seq scan is faster
DROP INDEX IF EXISTS idx_activity_events_messenger_type;

-- 194 scans, 13 MB - btree(org_id, created_at DESC)
-- Redundant: idx_activity_events_org_id_created_at covers same columns (315K scans)
-- PostgreSQL can scan btree indexes backwards, so ASC index serves DESC queries too
DROP INDEX IF EXISTS idx_activity_events_org_date;

-- ============================================================================
-- PART 2: Drop unused indexes on participant_messages
-- ============================================================================

-- 0 scans, 9 MB - GIN full-text search index, never used
DROP INDEX IF EXISTS idx_participant_messages_tsv;

-- 0 scans, 8.5 MB - btree(org_id, sent_at DESC), never used
DROP INDEX IF EXISTS idx_participant_messages_org;

-- 0 scans, 1 MB - btree(analyzed_at) WHERE analyzed_at IS NULL, never used
DROP INDEX IF EXISTS idx_participant_messages_analyzed;

-- 0 scans, 792 KB - btree(tg_chat_id, sent_at DESC) WHERE thread_id IS NOT NULL
-- Covered by idx_participant_messages_chat (39K scans)
DROP INDEX IF EXISTS idx_participant_messages_thread_not_null;

-- 2 scans, 1 MB - platform has very low cardinality
DROP INDEX IF EXISTS idx_participant_messages_platform;

-- ============================================================================
-- PART 3: Clean safe redundant fields from activity_events.meta
-- These fields are duplicated in dedicated columns and NOT read from meta
-- ============================================================================

-- Remove meta.message.id (duplicates column: message_id)
-- Remove meta.message.has_media (duplicates column: has_media)
-- Remove meta.message.text_length (duplicates column: chars_count)
-- Remove meta.message.is_topic_message (not read from meta by any code)
-- Remove meta.message.media_type (not read from meta by any code)
UPDATE activity_events
SET meta = meta || jsonb_build_object(
  'message',
  (meta->'message')
    - 'id'
    - 'has_media'
    - 'text_length'
    - 'is_topic_message'
    - 'media_type'
)
WHERE event_type = 'message'
  AND meta ? 'message'
  AND (
    meta->'message' ? 'id'
    OR meta->'message' ? 'has_media'
    OR meta->'message' ? 'text_length'
    OR meta->'message' ? 'is_topic_message'
    OR meta->'message' ? 'media_type'
  );

COMMIT;

-- Run ANALYZE to update planner statistics after index changes
ANALYZE activity_events;
ANALYZE participant_messages;
