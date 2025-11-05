-- Migration 088: Fix Analytics RPC - Use org_telegram_groups instead of activity_events.org_id
-- Date: Nov 5, 2025
-- Purpose: Fix issue where groups moved between orgs caused missing analytics data

-- Drop existing functions
DROP FUNCTION IF EXISTS get_activity_timeline(UUID, INT, BIGINT);
DROP FUNCTION IF EXISTS get_engagement_breakdown(UUID);
DROP FUNCTION IF EXISTS get_reactions_replies_stats(UUID, INT, BIGINT);
DROP FUNCTION IF EXISTS get_activity_heatmap(UUID, INT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS get_top_contributors(UUID, INT, BIGINT);

-- ============================================================================
-- 1. Activity Timeline - Use org_telegram_groups to find events
-- ============================================================================
CREATE FUNCTION get_activity_timeline(
  p_org_id UUID,
  p_days INT DEFAULT 30,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  date DATE,
  message_count BIGINT,
  reaction_count BIGINT,
  active_users_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::DATE as date
  ),
  org_groups AS (
    -- Get groups currently in this org
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  activity_data AS (
    SELECT 
      DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC')) as date,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as message_count,
      COALESCE(SUM(ae.reactions_count), 0) as reaction_count,
      COUNT(DISTINCT ae.tg_user_id) FILTER (WHERE ae.tg_user_id IS NOT NULL) as active_users_count
    FROM activity_events ae
    JOIN organizations o ON o.id = p_org_id
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= CURRENT_DATE - (p_days - 1)
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
      AND ae.event_type IN ('message', 'reaction')
    GROUP BY DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))
  )
  SELECT 
    ds.date,
    COALESCE(ad.message_count, 0)::BIGINT,
    COALESCE(ad.reaction_count, 0)::BIGINT,
    COALESCE(ad.active_users_count, 0)::BIGINT
  FROM date_series ds
  LEFT JOIN activity_data ad ON ad.date = ds.date
  ORDER BY ds.date ASC;
END;
$$;

COMMENT ON FUNCTION get_activity_timeline IS 'Returns daily activity timeline for groups currently in org (ignores org_id in events)';

-- ============================================================================
-- 2. Engagement Breakdown - Count unique tg_user_id instead of participant_id
-- ============================================================================
CREATE FUNCTION get_engagement_breakdown(
  p_org_id UUID
)
RETURNS TABLE (
  category TEXT,
  count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_participants BIGINT;
BEGIN
  -- Get total UNIQUE participants (by tg_user_id)
  SELECT COUNT(DISTINCT p.tg_user_id) INTO v_total_participants
  FROM participants p
  JOIN participant_groups pg ON pg.participant_id = p.id
  JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
  WHERE otg.org_id = p_org_id 
    AND pg.is_active = TRUE
    AND p.tg_user_id IS NOT NULL;
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  unique_participants AS (
    -- Get ONE record per tg_user_id (earliest joined_at)
    SELECT DISTINCT ON (p.tg_user_id)
      p.tg_user_id,
      MIN(pg.joined_at) OVER (PARTITION BY p.tg_user_id) as first_joined_at,
      pg.source
    FROM participants p
    JOIN participant_groups pg ON pg.participant_id = p.id
    WHERE pg.tg_group_id IN (SELECT tg_chat_id FROM org_groups)
      AND pg.is_active = TRUE
      AND p.tg_user_id IS NOT NULL
  ),
  participant_stats AS (
    SELECT 
      up.tg_user_id,
      up.first_joined_at,
      up.source,
      COUNT(*) FILTER (
        WHERE ae.event_type = 'message' 
        AND ae.created_at >= NOW() - INTERVAL '7 days'
      ) as messages_last_week,
      MAX(ae.created_at) FILTER (
        WHERE ae.event_type = 'message'
      ) as last_message_at
    FROM unique_participants up
    LEFT JOIN activity_events ae ON ae.tg_user_id = up.tg_user_id
      AND ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
    GROUP BY up.tg_user_id, up.first_joined_at, up.source
  ),
  categorized AS (
    SELECT 
      CASE
        -- Priority 1: Молчуны (no messages in last 30 days)
        WHEN last_message_at IS NULL OR last_message_at < NOW() - INTERVAL '30 days'
          THEN 'silent'
        -- Priority 2: Новички (joined < 30 days ago via webhook, not import)
        WHEN first_joined_at >= NOW() - INTERVAL '30 days' 
          AND source IN ('telegram', 'webhook_join')
          THEN 'newcomers'
        -- Priority 3: Ядро (first activity > 30 days ago + active in last 30 days + >= 3 messages/week)
        WHEN first_joined_at < NOW() - INTERVAL '30 days'
          AND last_message_at >= NOW() - INTERVAL '30 days'
          AND messages_last_week >= 3
          THEN 'core'
        -- Priority 4: Опытные (first activity > 30 days ago + active in last 30 days + < 3 messages/week)
        WHEN first_joined_at < NOW() - INTERVAL '30 days'
          AND last_message_at >= NOW() - INTERVAL '30 days'
          AND messages_last_week < 3
          THEN 'experienced'
        -- Default: Остальные
        ELSE 'other'
      END as category
    FROM participant_stats
  ),
  category_counts AS (
    SELECT 
      c.category,
      COUNT(*)::BIGINT as count,
      ROUND((COUNT(*) * 100.0 / v_total_participants), 1) as percentage
    FROM categorized c
    GROUP BY c.category
  ),
  all_categories AS (
    SELECT unnest(ARRAY['core', 'experienced', 'silent', 'newcomers', 'other']) as category
  )
  SELECT 
    ac.category,
    COALESCE(cc.count, 0)::BIGINT as count,
    COALESCE(cc.percentage, 0.0) as percentage
  FROM all_categories ac
  LEFT JOIN category_counts cc ON cc.category = ac.category
  WHERE ac.category != 'other' OR COALESCE(cc.count, 0) > 0
  ORDER BY 
    CASE ac.category
      WHEN 'core' THEN 1
      WHEN 'experienced' THEN 2
      WHEN 'newcomers' THEN 3
      WHEN 'silent' THEN 4
      WHEN 'other' THEN 5
      ELSE 6
    END;
END;
$$;

COMMENT ON FUNCTION get_engagement_breakdown IS 'Returns engagement breakdown counting UNIQUE tg_user_id (handles participant duplicates)';

-- ============================================================================
-- 3. Reactions & Replies Stats - Use org_telegram_groups
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
      COUNT(*) FILTER (WHERE (meta->>'reply_to_message_id') IS NOT NULL) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  ),
  previous_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE (meta->>'reply_to_message_id') IS NOT NULL) as replies,
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

COMMENT ON FUNCTION get_reactions_replies_stats IS 'Returns reactions/replies stats using org_telegram_groups';

-- ============================================================================
-- 4. Activity Heatmap - Use org_telegram_groups
-- ============================================================================
CREATE FUNCTION get_activity_heatmap(
  p_org_id UUID,
  p_days INT DEFAULT 30,
  p_tg_chat_id BIGINT DEFAULT NULL,
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS TABLE (
  hour_of_day INT,
  day_of_week INT,
  message_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  )
  SELECT 
    EXTRACT(HOUR FROM ae.created_at AT TIME ZONE p_timezone)::INT as hour_of_day,
    EXTRACT(DOW FROM ae.created_at AT TIME ZONE p_timezone)::INT as day_of_week,
    COUNT(*)::BIGINT as message_count
  FROM activity_events ae
  WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
    AND ae.created_at >= NOW() - (p_days || ' days')::INTERVAL
    AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    AND ae.event_type = 'message'
  GROUP BY hour_of_day, day_of_week
  ORDER BY hour_of_day, day_of_week;
END;
$$;

COMMENT ON FUNCTION get_activity_heatmap IS 'Returns activity heatmap using org_telegram_groups';

-- ============================================================================
-- 5. Top Contributors - Use org_telegram_groups + unique tg_user_id
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
    ORDER BY rc.curr_rank
    LIMIT p_limit
  ),
  with_participants AS (
    SELECT DISTINCT ON (c.tg_user_id)
      p.id as participant_id,
      c.tg_user_id,
      p.full_name,
      p.tg_first_name,
      p.tg_last_name,
      p.username,
      c.activity_count,
      c.message_count,
      c.reaction_count,
      c.rank,
      c.rank_change
    FROM combined c
    LEFT JOIN participants p ON p.tg_user_id = c.tg_user_id AND p.org_id = p_org_id
    ORDER BY c.tg_user_id, p.created_at ASC  -- Take earliest participant record for this user
  )
  SELECT * FROM with_participants
  ORDER BY rank ASC;  -- Sort by rank 1, 2, 3, ...10
END;
$$;

COMMENT ON FUNCTION get_top_contributors IS 'Returns top contributors using org_telegram_groups and unique tg_user_id';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_activity_timeline(UUID, INT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_engagement_breakdown(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reactions_replies_stats(UUID, INT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_heatmap(UUID, INT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_contributors(UUID, INT, BIGINT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 088 Complete: Analytics now use org_telegram_groups instead of activity_events.org_id'; END $$;

