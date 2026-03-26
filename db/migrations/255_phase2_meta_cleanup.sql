-- Migration 255: Phase 2 — Remove meta fallbacks + clean redundant meta fields
-- Date: Jan 26, 2026
--
-- Backfill check: 0 rows have reply_to_id ONLY in meta (column is complete)
-- Safe to remove meta fallback from RPC functions.
--
-- Expected savings after UPDATE + VACUUM FULL:
--   meta.message.reply_to_id removal: ~2 MB
--   meta.message.text_preview removal: ~30 MB
--   meta.user removal: ~15 MB
--   meta.source removal: ~5 MB
--   Total: ~50+ MB

BEGIN;

-- ============================================================================
-- PART 1: Recreate RPC functions WITHOUT meta->'message'->>'reply_to_id' fallback
-- ============================================================================

DROP FUNCTION IF EXISTS get_key_metrics(UUID, INT, BIGINT);

CREATE OR REPLACE FUNCTION get_key_metrics(
  p_org_id UUID,
  p_period_days INT DEFAULT 14,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  current_participants INT,
  current_messages INT,
  current_engagement_rate NUMERIC,
  current_replies INT,
  current_reactions INT,
  current_reply_ratio NUMERIC,
  previous_participants INT,
  previous_messages INT,
  previous_engagement_rate NUMERIC,
  previous_replies INT,
  previous_reactions INT,
  previous_reply_ratio NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_start TIMESTAMPTZ;
  v_previous_start TIMESTAMPTZ;
  v_previous_end TIMESTAMPTZ;
  v_total_participants INT;
BEGIN
  v_current_start := NOW() - (p_period_days || ' days')::INTERVAL;
  v_previous_end := v_current_start;
  v_previous_start := v_previous_end - (p_period_days || ' days')::INTERVAL;
  
  SELECT COUNT(DISTINCT p.tg_user_id) INTO v_total_participants
  FROM participants p
  JOIN participant_groups pg ON pg.participant_id = p.id
  JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
  WHERE otg.org_id = p_org_id 
    AND pg.is_active = TRUE
    AND p.tg_user_id IS NOT NULL
    AND (p_tg_chat_id IS NULL OR pg.tg_group_id = p_tg_chat_id);
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1;
  END IF;
  
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  current_stats AS (
    SELECT 
      COUNT(DISTINCT ae.tg_user_id) FILTER (WHERE ae.tg_user_id IS NOT NULL) as participants,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COUNT(*) FILTER (WHERE ae.reply_to_message_id IS NOT NULL) as replies,
      COALESCE(SUM(ae.reactions_count), 0) as reactions
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
  ),
  previous_stats AS (
    SELECT 
      COUNT(DISTINCT ae.tg_user_id) FILTER (WHERE ae.tg_user_id IS NOT NULL) as participants,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COUNT(*) FILTER (WHERE ae.reply_to_message_id IS NOT NULL) as replies,
      COALESCE(SUM(ae.reactions_count), 0) as reactions
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= v_previous_start
      AND ae.created_at < v_previous_end
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
  )
  SELECT 
    cs.participants::INT,
    cs.messages::INT,
    ROUND((cs.participants::NUMERIC / v_total_participants::NUMERIC) * 100, 1) as engagement_rate,
    cs.replies::INT,
    cs.reactions::INT,
    CASE WHEN cs.messages > 0 
      THEN ROUND((cs.replies::NUMERIC / cs.messages::NUMERIC) * 100, 1)
      ELSE 0 
    END as current_reply_ratio,
    ps.participants::INT,
    ps.messages::INT,
    ROUND((ps.participants::NUMERIC / v_total_participants::NUMERIC) * 100, 1) as engagement_rate_prev,
    ps.replies::INT,
    ps.reactions::INT,
    CASE WHEN ps.messages > 0 
      THEN ROUND((ps.replies::NUMERIC / ps.messages::NUMERIC) * 100, 1)
      ELSE 0 
    END as previous_reply_ratio
  FROM current_stats cs, previous_stats ps;
END;
$$;

COMMENT ON FUNCTION get_key_metrics IS 'Returns key metrics using reply_to_message_id column only (no meta fallback)';
GRANT EXECUTE ON FUNCTION get_key_metrics(UUID, INT, BIGINT) TO authenticated;

-- ---

DROP FUNCTION IF EXISTS get_reactions_replies_stats(UUID, INT, BIGINT);

CREATE FUNCTION get_reactions_replies_stats(
  p_org_id UUID,
  p_period_days INT DEFAULT 14,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  current_replies BIGINT,
  current_reactions BIGINT,
  current_messages BIGINT,
  current_reply_ratio NUMERIC,
  previous_replies BIGINT,
  previous_reactions BIGINT,
  previous_messages BIGINT,
  previous_reply_ratio NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_start TIMESTAMPTZ;
  v_previous_start TIMESTAMPTZ;
  v_previous_end TIMESTAMPTZ;
BEGIN
  v_current_start := NOW() - (p_period_days || ' days')::INTERVAL;
  v_previous_end := v_current_start;
  v_previous_start := v_previous_end - (p_period_days || ' days')::INTERVAL;
  
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  current_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE reply_to_message_id IS NOT NULL) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  ),
  previous_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE reply_to_message_id IS NOT NULL) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND created_at >= v_previous_start
      AND created_at < v_previous_end
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  )
  SELECT 
    cs.replies::BIGINT,
    cs.reactions::BIGINT,
    cs.messages::BIGINT,
    CASE WHEN cs.messages > 0 
      THEN ROUND((cs.replies::NUMERIC / cs.messages::NUMERIC), 4)
      ELSE 0 
    END as current_reply_ratio,
    ps.replies::BIGINT,
    ps.reactions::BIGINT,
    ps.messages::BIGINT,
    CASE WHEN ps.messages > 0 
      THEN ROUND((ps.replies::NUMERIC / ps.messages::NUMERIC), 4)
      ELSE 0 
    END as previous_reply_ratio
  FROM current_stats cs, previous_stats ps;
END;
$$;

COMMENT ON FUNCTION get_reactions_replies_stats IS 'Returns reactions/replies stats using reply_to_message_id column only';
GRANT EXECUTE ON FUNCTION get_reactions_replies_stats(UUID, INT, BIGINT) TO authenticated;

COMMIT;

-- ============================================================================
-- PART 2: Clean redundant meta fields from activity_events
-- Run outside transaction for large UPDATE
-- ============================================================================

-- Remove meta.message.reply_to_id and meta.message.text_preview
-- (reply_to_id → column reply_to_message_id, text_preview → participant_messages.message_text)
UPDATE activity_events
SET meta = jsonb_set(
  meta,
  '{message}',
  (meta->'message') - 'reply_to_id' - 'text_preview'
)
WHERE event_type = 'message'
  AND meta ? 'message'
  AND (
    meta->'message' ? 'reply_to_id'
    OR meta->'message' ? 'text_preview'
  );

-- Remove meta.user (name, username, tg_user_id → columns tg_user_id + participants table)
UPDATE activity_events
SET meta = meta - 'user'
WHERE meta ? 'user';

-- Remove meta.source (always 'webhook', not queried by code)
UPDATE activity_events
SET meta = meta - 'source'
WHERE meta ? 'source';

-- Clean empty meta.message objects left after field removal
UPDATE activity_events
SET meta = meta - 'message'
WHERE meta->'message' = '{}'::jsonb;

ANALYZE activity_events;

-- NOTE: Run VACUUM FULL activity_events; after this migration to reclaim disk space
