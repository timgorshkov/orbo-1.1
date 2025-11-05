-- Migration 085: Analytics RPC Functions
-- Date: Nov 5, 2025
-- Purpose: Create RPC functions for dashboard and group analytics

-- ============================================================================
-- 1. Activity Timeline (messages + reactions per day)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_activity_timeline(
  p_org_id UUID,
  p_days INT DEFAULT 30,
  p_tg_chat_id BIGINT DEFAULT NULL  -- NULL = org-wide, value = specific group
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
  SELECT 
    DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC')) as date,
    COUNT(*) FILTER (WHERE ae.event_type = 'message') as message_count,
    COALESCE(SUM(ae.reactions_count), 0) as reaction_count,
    COUNT(DISTINCT ae.tg_user_id) FILTER (WHERE ae.tg_user_id IS NOT NULL) as active_users_count
  FROM activity_events ae
  JOIN organizations o ON o.id = ae.org_id
  WHERE ae.org_id = p_org_id
    AND ae.created_at >= NOW() - (p_days || ' days')::INTERVAL
    AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    AND ae.event_type IN ('message', 'reaction')
  GROUP BY DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))
  ORDER BY date DESC;
END;
$$;

COMMENT ON FUNCTION get_activity_timeline IS 'Returns daily activity timeline with messages, reactions, and active users count';

-- ============================================================================
-- 2. Top Contributors (with ranking changes)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_top_contributors(
  p_org_id UUID,
  p_limit INT DEFAULT 10,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  tg_user_id BIGINT,
  full_name TEXT,
  username TEXT,
  current_week_score INT,
  previous_week_score INT,
  current_rank INT,
  previous_rank INT,
  rank_change INT,
  rank_change_label TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_week_start TIMESTAMPTZ;
  v_previous_week_start TIMESTAMPTZ;
BEGIN
  v_current_week_start := DATE_TRUNC('week', NOW());
  v_previous_week_start := v_current_week_start - INTERVAL '7 days';
  
  RETURN QUERY
  WITH current_week AS (
    SELECT 
      ae.tg_user_id,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') + 
      COALESCE(SUM(ae.reactions_count), 0) as score
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= v_current_week_start
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id
  ),
  current_ranked AS (
    SELECT 
      cw.tg_user_id,
      cw.score,
      RANK() OVER (ORDER BY cw.score DESC) as rank
    FROM current_week cw
  ),
  previous_week AS (
    SELECT 
      ae.tg_user_id,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') + 
      COALESCE(SUM(ae.reactions_count), 0) as score
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= v_previous_week_start
      AND ae.created_at < v_current_week_start
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id
  ),
  previous_ranked AS (
    SELECT 
      pw.tg_user_id,
      pw.score,
      RANK() OVER (ORDER BY pw.score DESC) as rank
    FROM previous_week pw
  )
  SELECT 
    cr.tg_user_id,
    p.full_name,
    p.username,
    cr.score::INT as current_week_score,
    COALESCE(pr.score, 0)::INT as previous_week_score,
    cr.rank::INT as current_rank,
    COALESCE(pr.rank, 999)::INT as previous_rank,
    (COALESCE(pr.rank, 999) - cr.rank)::INT as rank_change,
    CASE 
      WHEN pr.rank IS NULL THEN 'NEW'
      WHEN pr.rank = cr.rank THEN '—'
      WHEN pr.rank > cr.rank THEN '↑ ' || (pr.rank - cr.rank)::TEXT
      ELSE '↓ ' || (cr.rank - pr.rank)::TEXT
    END as rank_change_label
  FROM current_ranked cr
  LEFT JOIN previous_ranked pr ON pr.tg_user_id = cr.tg_user_id
  LEFT JOIN participants p ON p.tg_user_id = cr.tg_user_id AND p.org_id = p_org_id
  ORDER BY cr.rank
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_top_contributors IS 'Returns top contributors for current week with ranking changes vs previous week';

-- ============================================================================
-- 3. Engagement Breakdown (Pie Chart Categories)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_engagement_breakdown(
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
  -- Get total participants count
  SELECT COUNT(DISTINCT p.id) INTO v_total_participants
  FROM participants p
  JOIN participant_groups pg ON pg.participant_id = p.id
  JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
  WHERE otg.org_id = p_org_id AND pg.is_active = TRUE;
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH participant_stats AS (
    SELECT 
      p.id,
      p.tg_user_id,
      p.last_activity_at,
      p.source,
      MIN(pg.joined_at) as first_joined_at,
      COUNT(*) FILTER (
        WHERE ae.event_type = 'message' 
        AND ae.created_at >= NOW() - INTERVAL '7 days'
      ) as messages_last_week,
      EXISTS(
        SELECT 1 FROM activity_events ae2
        WHERE ae2.tg_user_id = p.tg_user_id
          AND ae2.org_id = p_org_id
          AND ae2.created_at < NOW() - INTERVAL '30 days'
      ) as has_old_activity,
      EXISTS(
        SELECT 1 FROM activity_events ae3
        WHERE ae3.tg_user_id = p.tg_user_id
          AND ae3.org_id = p_org_id
          AND ae3.created_at >= NOW() - INTERVAL '30 days'
      ) as has_recent_activity
    FROM participants p
    JOIN participant_groups pg ON pg.participant_id = p.id
    JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
    LEFT JOIN activity_events ae ON ae.tg_user_id = p.tg_user_id 
      AND ae.org_id = p_org_id
      AND ae.created_at >= NOW() - INTERVAL '7 days'
    WHERE otg.org_id = p_org_id 
      AND pg.is_active = TRUE
    GROUP BY p.id, p.tg_user_id, p.last_activity_at, p.source
  ),
  categorized AS (
    SELECT 
      CASE
        -- Priority 1: Молчуны (no activity for 30 days)
        WHEN last_activity_at < NOW() - INTERVAL '30 days' OR last_activity_at IS NULL
          THEN 'Молчуны'
        -- Priority 2: Новички (joined < 30 days ago, source = telegram)
        WHEN first_joined_at >= NOW() - INTERVAL '30 days' AND source = 'telegram'
          THEN 'Новички'
        -- Priority 3: Ядро (old + recent activity + >= 3 messages/week)
        WHEN has_old_activity AND has_recent_activity AND messages_last_week >= 3
          THEN 'Ядро'
        -- Priority 4: Опытные (old + recent activity + < 3 messages/week)
        WHEN has_old_activity AND has_recent_activity AND messages_last_week < 3
          THEN 'Опытные'
        -- Default: Остальные
        ELSE 'Остальные'
      END as category
    FROM participant_stats
  )
  SELECT 
    c.category,
    COUNT(*)::BIGINT as count,
    ROUND((COUNT(*) * 100.0 / v_total_participants), 1) as percentage
  FROM categorized c
  GROUP BY c.category
  ORDER BY 
    CASE c.category
      WHEN 'Ядро' THEN 1
      WHEN 'Опытные' THEN 2
      WHEN 'Новички' THEN 3
      WHEN 'Молчуны' THEN 4
      ELSE 5
    END;
END;
$$;

COMMENT ON FUNCTION get_engagement_breakdown IS 'Returns engagement category breakdown for pie chart';

-- ============================================================================
-- 4. Reactions & Replies Stats (14 days with comparison)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_reactions_replies_stats(
  p_org_id UUID,
  p_period_days INT DEFAULT 14,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  current_period_replies BIGINT,
  current_period_reactions BIGINT,
  current_period_messages BIGINT,
  current_period_reply_ratio NUMERIC,
  previous_period_replies BIGINT,
  previous_period_reactions BIGINT,
  previous_period_messages BIGINT,
  previous_period_reply_ratio NUMERIC,
  replies_change_pct NUMERIC,
  reactions_change_pct NUMERIC,
  reply_ratio_change NUMERIC
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
  WITH current_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE reply_to_message_id IS NOT NULL) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE org_id = p_org_id
      AND created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  ),
  previous_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE reply_to_message_id IS NOT NULL) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE org_id = p_org_id
      AND created_at >= v_previous_start
      AND created_at < v_previous_end
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  )
  SELECT 
    cs.replies::BIGINT,
    cs.reactions::BIGINT,
    cs.messages::BIGINT,
    CASE WHEN cs.messages > 0 THEN ROUND((cs.replies::NUMERIC / cs.messages * 100), 1) ELSE 0 END,
    ps.replies::BIGINT,
    ps.reactions::BIGINT,
    ps.messages::BIGINT,
    CASE WHEN ps.messages > 0 THEN ROUND((ps.replies::NUMERIC / ps.messages * 100), 1) ELSE 0 END,
    CASE WHEN ps.replies > 0 THEN ROUND(((cs.replies - ps.replies)::NUMERIC / ps.replies * 100), 1) ELSE 0 END as replies_change_pct,
    CASE WHEN ps.reactions > 0 THEN ROUND(((cs.reactions - ps.reactions)::NUMERIC / ps.reactions * 100), 1) ELSE 0 END as reactions_change_pct,
    CASE 
      WHEN ps.messages > 0 AND cs.messages > 0 
      THEN ROUND((cs.replies::NUMERIC / cs.messages - ps.replies::NUMERIC / ps.messages) * 100, 1)
      ELSE 0 
    END as reply_ratio_change
  FROM current_stats cs, previous_stats ps;
END;
$$;

COMMENT ON FUNCTION get_reactions_replies_stats IS 'Returns reactions and replies statistics with period comparison';

-- ============================================================================
-- 5. Activity Heatmap (day of week × 3-hour intervals)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_activity_heatmap(
  p_org_id UUID,
  p_days INT DEFAULT 30,
  p_tg_chat_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  day_of_week INT,
  day_name TEXT,
  hour_interval INT,
  hour_label TEXT,
  activity_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(DOW FROM ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))::INT as day_of_week,
    CASE EXTRACT(DOW FROM ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))::INT
      WHEN 0 THEN 'Вс'
      WHEN 1 THEN 'Пн'
      WHEN 2 THEN 'Вт'
      WHEN 3 THEN 'Ср'
      WHEN 4 THEN 'Чт'
      WHEN 5 THEN 'Пт'
      WHEN 6 THEN 'Сб'
    END as day_name,
    (EXTRACT(HOUR FROM ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))::INT / 3) as hour_interval,
    CASE (EXTRACT(HOUR FROM ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))::INT / 3)
      WHEN 0 THEN '00-03'
      WHEN 1 THEN '03-06'
      WHEN 2 THEN '06-09'
      WHEN 3 THEN '09-12'
      WHEN 4 THEN '12-15'
      WHEN 5 THEN '15-18'
      WHEN 6 THEN '18-21'
      WHEN 7 THEN '21-24'
    END as hour_label,
    COUNT(*)::BIGINT as activity_count
  FROM activity_events ae
  JOIN organizations o ON o.id = ae.org_id
  WHERE ae.org_id = p_org_id
    AND ae.created_at >= NOW() - (p_days || ' days')::INTERVAL
    AND ae.event_type = 'message'
    AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
  GROUP BY 
    EXTRACT(DOW FROM ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))::INT,
    (EXTRACT(HOUR FROM ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))::INT / 3)
  ORDER BY day_of_week, hour_interval;
END;
$$;

COMMENT ON FUNCTION get_activity_heatmap IS 'Returns activity heatmap with day of week × 3-hour intervals';

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_activity_timeline(UUID, INT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_contributors(UUID, INT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_engagement_breakdown(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reactions_replies_stats(UUID, INT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_heatmap(UUID, INT, BIGINT) TO authenticated;

DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 085 Complete: Analytics RPC functions created';
  RAISE NOTICE '  - get_activity_timeline: messages + reactions per day';
  RAISE NOTICE '  - get_top_contributors: leaderboard with ranking changes';
  RAISE NOTICE '  - get_engagement_breakdown: engagement categories (pie chart)';
  RAISE NOTICE '  - get_reactions_replies_stats: reactions/replies with comparison';
  RAISE NOTICE '  - get_activity_heatmap: day × 3-hour intervals';
END $$;

