-- ============================================================
-- Migration: 218_topic_messages_index.sql
-- Description: Add index for topic-aware message queries in notifications
-- Date: 2026-01-26
-- ============================================================

-- Index for efficient message fetching grouped by topic (thread)
-- Used by notification rules service to analyze messages per-topic
CREATE INDEX IF NOT EXISTS idx_participant_messages_chat_thread_sent
  ON participant_messages (tg_chat_id, message_thread_id, sent_at DESC);

-- Partial index for messages that have a topic (non-null message_thread_id)
CREATE INDEX IF NOT EXISTS idx_participant_messages_thread_not_null
  ON participant_messages (tg_chat_id, sent_at DESC)
  WHERE message_thread_id IS NOT NULL;
