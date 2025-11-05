-- Migration 091: Key Metrics Function
-- Date: Nov 5, 2025
-- Purpose: Replace reactions-replies stats with comprehensive key metrics

-- Drop existing function if it exists (allows changing return type)
DROP FUNCTION IF EXISTS get_key_metrics(UUID, INT, BIGINT);

CREATE OR REPLACE FUNCTION get_key_metrics(
  p_org_id UUID,
  p_period_days INT DEFAULT 14,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  -- Current period
  current_participants INT,
  current_messages INT,
  current_engagement_rate NUMERIC,
  current_replies INT,
  current_reactions INT,
  current_reply_ratio NUMERIC,
  -- Previous period
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
  
  -- Get total participants count (for engagement rate calculation)
  SELECT COUNT(DISTINCT p.tg_user_id) INTO v_total_participants
  FROM participants p
  JOIN participant_groups pg ON pg.participant_id = p.id
  JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
  WHERE otg.org_id = p_org_id 
    AND pg.is_active = TRUE
    AND p.tg_user_id IS NOT NULL
    AND (p_tg_chat_id IS NULL OR pg.tg_group_id = p_tg_chat_id);
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  current_stats AS (
    SELECT 
      -- Unique active participants
      COUNT(DISTINCT ae.tg_user_id) FILTER (WHERE ae.tg_user_id IS NOT NULL) as participants,
      -- Total messages
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      -- Replies
      COUNT(*) FILTER (
        WHERE ae.reply_to_message_id IS NOT NULL 
        OR (ae.meta->'message'->>'reply_to_id') IS NOT NULL
      ) as replies,
      -- Reactions
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
      COUNT(*) FILTER (
        WHERE ae.reply_to_message_id IS NOT NULL 
        OR (ae.meta->'message'->>'reply_to_id') IS NOT NULL
      ) as replies,
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

COMMENT ON FUNCTION get_key_metrics IS 'Returns key metrics: participants, messages, engagement rate, replies, reactions';

GRANT EXECUTE ON FUNCTION get_key_metrics(UUID, INT, BIGINT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 091 Complete: Key metrics function created'; END $$;

