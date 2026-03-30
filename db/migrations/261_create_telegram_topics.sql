-- Migration 261: Create telegram_topics table
-- Stores known forum topic names per Telegram group (populated from webhook events)

CREATE TABLE IF NOT EXISTS telegram_topics (
  id          BIGINT NOT NULL,           -- Telegram message_thread_id
  tg_chat_id  BIGINT NOT NULL,
  title       TEXT   NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, tg_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_topics_tg_chat_id
  ON telegram_topics (tg_chat_id);

-- Backfill: create topic records from activity_events message_thread_id values
-- Titles will be updated later when bot sees forum_topic_created events
INSERT INTO telegram_topics (id, tg_chat_id, title, created_at)
SELECT DISTINCT ON (message_thread_id, tg_chat_id)
  message_thread_id                          AS id,
  tg_chat_id,
  'Тема ' || message_thread_id::text         AS title,
  now()                                      AS created_at
FROM activity_events
WHERE message_thread_id IS NOT NULL
  AND message_thread_id > 1
ON CONFLICT (id, tg_chat_id) DO NOTHING;

-- Mark groups with forum topics as is_forum = true
UPDATE telegram_groups
SET is_forum = true
WHERE tg_chat_id IN (
  SELECT DISTINCT tg_chat_id FROM telegram_topics
);
