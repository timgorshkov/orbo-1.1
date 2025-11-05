-- Migration 090: Fix Top Contributors Sort Order
-- Date: Nov 5, 2025
-- Purpose: Ensure contributors are sorted by rank (1, 2, 3...10) not reversed

-- Drop existing function
DROP FUNCTION IF EXISTS get_top_contributors(UUID, INT, BIGINT);

-- ============================================================================
-- Top Contributors - Fixed final sort order
-- ============================================================================
CREATE FUNCTION get_top_contributors(
  p_org_id UUID,
  p_limit INT DEFAULT 10,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  participant_id UUID,
  tg_user_id BIGINT,
  full_name TEXT,
  tg_first_name TEXT,
  tg_last_name TEXT,
  username TEXT,
  activity_count INT,
  message_count INT,
  reaction_count INT,
  rank INT,
  rank_change INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  current_week AS (
    SELECT 
      ae.tg_user_id,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COALESCE(SUM(ae.reactions_count), 0) as reactions,
      (COUNT(*) FILTER (WHERE ae.event_type = 'message') + COALESCE(SUM(ae.reactions_count), 0))::INT as score
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW())
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id
  ),
  previous_week AS (
    SELECT 
      ae.tg_user_id,
      (COUNT(*) FILTER (WHERE ae.event_type = 'message') + COALESCE(SUM(ae.reactions_count), 0))::INT as score,
      ROW_NUMBER() OVER (ORDER BY (COUNT(*) FILTER (WHERE ae.event_type = 'message') + COALESCE(SUM(ae.reactions_count), 0)) DESC) as prev_rank
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
      AND ae.created_at < DATE_TRUNC('week', NOW())
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id
  ),
  ranked_current AS (
    SELECT 
      cw.*,
      ROW_NUMBER() OVER (ORDER BY cw.score DESC) as curr_rank
    FROM current_week cw
  ),
  combined AS (
    SELECT 
      rc.tg_user_id,
      rc.score as activity_count,
      rc.messages::INT as message_count,
      rc.reactions::INT as reaction_count,
      rc.curr_rank::INT as rank,
      COALESCE(rc.curr_rank::INT - pw.prev_rank::INT, 0) as rank_change
    FROM ranked_current rc
    LEFT JOIN previous_week pw ON pw.tg_user_id = rc.tg_user_id
    WHERE rc.curr_rank <= p_limit  -- Filter early
    ORDER BY rc.curr_rank ASC      -- Pre-sort
  ),
  with_participants AS (
    -- For each tg_user_id, pick earliest participant record
    SELECT DISTINCT ON (c.tg_user_id)
      c.tg_user_id,
      c.rank,
      c.rank_change,
      c.activity_count,
      c.message_count,
      c.reaction_count,
      p.id as participant_id,
      p.full_name,
      p.tg_first_name,
      p.tg_last_name,
      p.username
    FROM combined c
    LEFT JOIN participants p ON p.tg_user_id = c.tg_user_id AND p.org_id = p_org_id
    ORDER BY c.tg_user_id, p.created_at ASC NULLS LAST
  )
  -- Final result: MUST be sorted by rank ascending
  SELECT 
    wp.participant_id,
    wp.tg_user_id,
    wp.full_name,
    wp.tg_first_name,
    wp.tg_last_name,
    wp.username,
    wp.activity_count,
    wp.message_count,
    wp.reaction_count,
    wp.rank,
    wp.rank_change
  FROM with_participants wp
  ORDER BY wp.rank ASC;  -- CRITICAL: Sort by rank 1, 2, 3...
END;
$$;

COMMENT ON FUNCTION get_top_contributors IS 'Returns top contributors sorted by rank (1→10)';

GRANT EXECUTE ON FUNCTION get_top_contributors(UUID, INT, BIGINT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 090 Complete: Contributors now correctly sorted by rank ascending'; END $$;

