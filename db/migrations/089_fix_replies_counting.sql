-- Migration 089: Fix Replies Counting in Reactions-Replies Stats
-- Date: Nov 5, 2025
-- Purpose: Use reply_to_message_id column instead of meta JSON field

-- Drop existing function
DROP FUNCTION IF EXISTS get_reactions_replies_stats(UUID, INT, BIGINT);

-- ============================================================================
-- Reactions & Replies Stats - Use reply_to_message_id column
-- ============================================================================
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
      -- Count replies using reply_to_message_id column (primary)
      -- Fallback to meta->'message'->>'reply_to_id' for old imports
      COUNT(*) FILTER (
        WHERE reply_to_message_id IS NOT NULL 
        OR (meta->'message'->>'reply_to_id') IS NOT NULL
      ) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  ),
  previous_stats AS (
    SELECT 
      COUNT(*) FILTER (
        WHERE reply_to_message_id IS NOT NULL 
        OR (meta->'message'->>'reply_to_id') IS NOT NULL
      ) as replies,
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

COMMENT ON FUNCTION get_reactions_replies_stats IS 'Returns reactions/replies stats using reply_to_message_id column + meta fallback';

GRANT EXECUTE ON FUNCTION get_reactions_replies_stats(UUID, INT, BIGINT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 089 Complete: Replies now counted from reply_to_message_id column'; END $$;

