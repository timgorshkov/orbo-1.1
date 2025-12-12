-- Migration 142: Include WhatsApp activity in analytics
-- Date: Dec 10, 2025
-- Purpose: Include WhatsApp messages (tg_chat_id = 0) in dashboard metrics

-- ============================================================================
-- Drop existing functions to recreate
-- ============================================================================
DROP FUNCTION IF EXISTS get_top_contributors(UUID, INT, BIGINT);
DROP FUNCTION IF EXISTS get_activity_timeline(UUID, INT, BIGINT);
DROP FUNCTION IF EXISTS get_activity_heatmap(UUID, INT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS get_inactive_newcomers(UUID, INTEGER);

-- ============================================================================
-- Activity Timeline - Now includes WhatsApp activity
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
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  -- Telegram activity
  telegram_activity AS (
    SELECT 
      DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC')) as activity_date,
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
  ),
  -- WhatsApp activity (tg_chat_id = 0)
  whatsapp_activity AS (
    SELECT 
      DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC')) as activity_date,
      COUNT(*) as message_count,
      0::BIGINT as reaction_count,
      COUNT(DISTINCT (ae.meta->>'participant_id')) as active_users_count
    FROM activity_events ae
    JOIN organizations o ON o.id = p_org_id
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= CURRENT_DATE - (p_days - 1)
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't filter by chat_id
    GROUP BY DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))
  ),
  -- Combined activity by date
  combined_activity AS (
    SELECT 
      COALESCE(ta.activity_date, wa.activity_date) as activity_date,
      COALESCE(ta.message_count, 0) + COALESCE(wa.message_count, 0) as message_count,
      COALESCE(ta.reaction_count, 0) + COALESCE(wa.reaction_count, 0) as reaction_count,
      COALESCE(ta.active_users_count, 0) + COALESCE(wa.active_users_count, 0) as active_users_count
    FROM telegram_activity ta
    FULL OUTER JOIN whatsapp_activity wa ON ta.activity_date = wa.activity_date
  )
  SELECT 
    ds.date,
    COALESCE(ca.message_count, 0)::BIGINT,
    COALESCE(ca.reaction_count, 0)::BIGINT,
    COALESCE(ca.active_users_count, 0)::BIGINT
  FROM date_series ds
  LEFT JOIN combined_activity ca ON ca.activity_date = ds.date
  ORDER BY ds.date ASC;
END;
$$;

COMMENT ON FUNCTION get_activity_timeline IS 'Returns daily activity timeline including Telegram and WhatsApp';

GRANT EXECUTE ON FUNCTION get_activity_timeline(UUID, INT, BIGINT) TO authenticated;

-- ============================================================================
-- Activity Heatmap - Now includes WhatsApp activity
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
  ),
  -- Telegram activity
  telegram_heatmap AS (
    SELECT 
      EXTRACT(HOUR FROM ae.created_at AT TIME ZONE p_timezone)::INT as hour_of_day,
      EXTRACT(DOW FROM ae.created_at AT TIME ZONE p_timezone)::INT as day_of_week,
      COUNT(*)::BIGINT as message_count
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= NOW() - (p_days || ' days')::INTERVAL
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
      AND ae.event_type = 'message'
    GROUP BY 1, 2
  ),
  -- WhatsApp activity (tg_chat_id = 0)
  whatsapp_heatmap AS (
    SELECT 
      EXTRACT(HOUR FROM ae.created_at AT TIME ZONE p_timezone)::INT as hour_of_day,
      EXTRACT(DOW FROM ae.created_at AT TIME ZONE p_timezone)::INT as day_of_week,
      COUNT(*)::BIGINT as message_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= NOW() - (p_days || ' days')::INTERVAL
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't filter by chat_id
    GROUP BY 1, 2
  ),
  -- Combined
  combined AS (
    SELECT 
      COALESCE(th.hour_of_day, wh.hour_of_day) as hour_of_day,
      COALESCE(th.day_of_week, wh.day_of_week) as day_of_week,
      COALESCE(th.message_count, 0) + COALESCE(wh.message_count, 0) as message_count
    FROM telegram_heatmap th
    FULL OUTER JOIN whatsapp_heatmap wh 
      ON th.hour_of_day = wh.hour_of_day AND th.day_of_week = wh.day_of_week
  )
  SELECT 
    c.hour_of_day,
    c.day_of_week,
    c.message_count
  FROM combined c
  ORDER BY c.hour_of_day, c.day_of_week;
END;
$$;

COMMENT ON FUNCTION get_activity_heatmap IS 'Returns activity heatmap including Telegram and WhatsApp';

GRANT EXECUTE ON FUNCTION get_activity_heatmap(UUID, INT, BIGINT, TEXT) TO authenticated;

-- ============================================================================
-- Inactive Newcomers - Now includes WhatsApp participants
-- ============================================================================
CREATE OR REPLACE FUNCTION get_inactive_newcomers(
  p_org_id UUID,
  p_days_since_first INTEGER DEFAULT 14
)
RETURNS TABLE(
  participant_id UUID,
  full_name TEXT,
  username TEXT,
  created_at TIMESTAMPTZ,
  days_since_join INTEGER,
  activity_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Telegram activity
  telegram_activity AS (
    SELECT 
      ae.tg_user_id,
      MIN(ae.created_at) as first_activity_date,
      COUNT(*) as activity_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.event_type IN ('message', 'join')
      AND ae.tg_user_id IS NOT NULL
    GROUP BY ae.tg_user_id
  ),
  -- WhatsApp activity (by participant_id)
  whatsapp_activity AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      MIN(ae.created_at) as first_activity_date,
      COUNT(*) as activity_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Combined activity per participant
  participant_activity AS (
    SELECT 
      p.id as participant_id,
      LEAST(ta.first_activity_date, wa.first_activity_date) as first_activity_date,
      COALESCE(ta.activity_count, 0) + COALESCE(wa.activity_count, 0) as total_activity
    FROM participants p
    LEFT JOIN telegram_activity ta ON ta.tg_user_id = p.tg_user_id
    LEFT JOIN whatsapp_activity wa ON wa.participant_id = p.id
    WHERE p.org_id = p_org_id
  )
  SELECT 
    p.id as participant_id,
    p.full_name,
    p.username,
    p.created_at as created_at,
    EXTRACT(DAY FROM NOW() - COALESCE(pa.first_activity_date, p.created_at))::INTEGER as days_since_join,
    COALESCE(pa.total_activity, 0)::INTEGER as activity_count
  FROM participants p
  LEFT JOIN participant_activity pa ON pa.participant_id = p.id
  WHERE 
    p.org_id = p_org_id
    AND p.created_at > NOW() - INTERVAL '30 days' -- Joined in last 30 days
    AND (
      -- Either never had activity or had very little
      pa.total_activity IS NULL 
      OR pa.total_activity <= 2
    )
    AND COALESCE(pa.first_activity_date, p.created_at) < NOW() - (p_days_since_first || ' days')::INTERVAL
    AND COALESCE(p.source, '') != 'bot'
    AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
    AND p.merged_into IS NULL
  ORDER BY p.created_at DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION get_inactive_newcomers IS 'Returns inactive newcomers including WhatsApp participants';

GRANT EXECUTE ON FUNCTION get_inactive_newcomers(UUID, INTEGER) TO authenticated;

-- ============================================================================
-- Top Contributors - Now includes WhatsApp activity
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
  -- Telegram activity (from org groups)
  telegram_current AS (
    SELECT 
      ae.tg_user_id,
      p.id as participant_id,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COALESCE(SUM(ae.reactions_count), 0) as reactions
    FROM activity_events ae
    LEFT JOIN participants p ON p.tg_user_id = ae.tg_user_id AND p.org_id = p_org_id
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW())
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id, p.id
  ),
  -- WhatsApp activity (tg_chat_id = 0, participant_id in meta)
  whatsapp_current AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      COUNT(*) as messages
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW())
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't have chat_id filtering
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Combine Telegram and WhatsApp for current week
  current_week AS (
    SELECT 
      COALESCE(tc.participant_id, wc.participant_id) as participant_id,
      tc.tg_user_id,
      (COALESCE(tc.messages, 0) + COALESCE(wc.messages, 0))::INT as messages,
      COALESCE(tc.reactions, 0)::INT as reactions,
      (COALESCE(tc.messages, 0) + COALESCE(wc.messages, 0) + COALESCE(tc.reactions, 0))::INT as score
    FROM telegram_current tc
    FULL OUTER JOIN whatsapp_current wc ON tc.participant_id = wc.participant_id
    WHERE COALESCE(tc.participant_id, wc.participant_id) IS NOT NULL
  ),
  -- Previous week Telegram
  telegram_previous AS (
    SELECT 
      p.id as participant_id,
      ae.tg_user_id,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COALESCE(SUM(ae.reactions_count), 0) as reactions
    FROM activity_events ae
    LEFT JOIN participants p ON p.tg_user_id = ae.tg_user_id AND p.org_id = p_org_id
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
      AND ae.created_at < DATE_TRUNC('week', NOW())
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id, p.id
  ),
  -- Previous week WhatsApp
  whatsapp_previous AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      COUNT(*) as messages
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
      AND ae.created_at < DATE_TRUNC('week', NOW())
      AND p_tg_chat_id IS NULL
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Combine for previous week
  previous_week AS (
    SELECT 
      COALESCE(tp.participant_id, wp.participant_id) as participant_id,
      tp.tg_user_id,
      (COALESCE(tp.messages, 0) + COALESCE(wp.messages, 0) + COALESCE(tp.reactions, 0))::INT as score,
      ROW_NUMBER() OVER (ORDER BY (COALESCE(tp.messages, 0) + COALESCE(wp.messages, 0) + COALESCE(tp.reactions, 0)) DESC) as prev_rank
    FROM telegram_previous tp
    FULL OUTER JOIN whatsapp_previous wp ON tp.participant_id = wp.participant_id
    WHERE COALESCE(tp.participant_id, wp.participant_id) IS NOT NULL
  ),
  ranked_current AS (
    SELECT 
      cw.*,
      ROW_NUMBER() OVER (ORDER BY cw.score DESC) as curr_rank
    FROM current_week cw
  ),
  combined AS (
    SELECT 
      rc.participant_id,
      rc.tg_user_id,
      rc.score as activity_count,
      rc.messages as message_count,
      rc.reactions as reaction_count,
      rc.curr_rank::INT as rank,
      COALESCE(rc.curr_rank::INT - pw.prev_rank::INT, 0) as rank_change
    FROM ranked_current rc
    LEFT JOIN previous_week pw ON pw.participant_id = rc.participant_id
    WHERE rc.curr_rank <= p_limit
    ORDER BY rc.curr_rank ASC
  ),
  with_participants AS (
    SELECT DISTINCT ON (c.participant_id)
      c.participant_id,
      c.tg_user_id,
      c.rank,
      c.rank_change,
      c.activity_count,
      c.message_count,
      c.reaction_count,
      p.full_name,
      p.tg_first_name,
      p.tg_last_name,
      p.username
    FROM combined c
    LEFT JOIN participants p ON p.id = c.participant_id
    ORDER BY c.participant_id, p.created_at ASC NULLS LAST
  )
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
  ORDER BY wp.rank ASC;
END;
$$;

COMMENT ON FUNCTION get_top_contributors IS 'Returns top contributors including Telegram and WhatsApp activity';

GRANT EXECUTE ON FUNCTION get_top_contributors(UUID, INT, BIGINT) TO authenticated;

-- ============================================================================
-- Update get_engagement_breakdown to include WhatsApp activity
-- ============================================================================
DROP FUNCTION IF EXISTS get_engagement_breakdown(UUID);

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
  -- Get total participants in this org
  SELECT COUNT(*) INTO v_total_participants
  FROM participants p
  WHERE p.org_id = p_org_id
    AND p.merged_into IS NULL;
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH participant_activity AS (
    -- Calculate real_join_date and real_last_activity for each participant
    -- Now includes both participant_messages (Telegram) and activity_events (WhatsApp)
    SELECT 
      p.id,
      p.created_at,
      p.last_activity_at,
      p.activity_score,
      LEAST(
        MIN(pm.sent_at),
        (SELECT MIN(ae.created_at) FROM activity_events ae 
         WHERE ae.tg_chat_id = 0 
           AND ae.event_type = 'message' 
           AND ae.meta->>'participant_id' = p.id::TEXT)
      ) as first_message_at,
      GREATEST(
        MAX(pm.sent_at),
        (SELECT MAX(ae.created_at) FROM activity_events ae 
         WHERE ae.tg_chat_id = 0 
           AND ae.event_type = 'message' 
           AND ae.meta->>'participant_id' = p.id::TEXT)
      ) as last_message_at
    FROM participants p
    LEFT JOIN participant_messages pm ON pm.participant_id = p.id
    WHERE p.org_id = p_org_id
      AND p.merged_into IS NULL
    GROUP BY p.id, p.created_at, p.last_activity_at, p.activity_score
  ),
  participants_enriched AS (
    -- Add real_join_date and real_last_activity
    SELECT 
      id,
      created_at,
      last_activity_at,
      activity_score,
      first_message_at,
      last_message_at,
      -- real_join_date: earliest of first_message_at or created_at
      CASE 
        WHEN first_message_at IS NOT NULL AND first_message_at < created_at 
          THEN first_message_at
        ELSE created_at
      END as real_join_date,
      -- real_last_activity: latest of last_message_at or last_activity_at
      CASE
        WHEN last_message_at IS NOT NULL AND (last_activity_at IS NULL OR last_message_at > last_activity_at)
          THEN last_message_at
        ELSE last_activity_at
      END as real_last_activity
    FROM participant_activity
  ),
  categorized AS (
    SELECT 
      CASE
        -- Priority 1: Silent (no activity in 30 days OR never active and joined >7 days ago)
        WHEN real_last_activity IS NULL AND real_join_date < NOW() - INTERVAL '7 days'
          THEN 'silent'
        WHEN real_last_activity IS NOT NULL AND real_last_activity < NOW() - INTERVAL '30 days'
          THEN 'silent'
        
        -- Priority 2: Newcomers (joined <30 days ago AND not silent)
        WHEN real_join_date >= NOW() - INTERVAL '30 days'
          THEN 'newcomers'
        
        -- Priority 3: Core (activity_score >= 60)
        WHEN COALESCE(activity_score, 0) >= 60
          THEN 'core'
        
        -- Priority 4: Experienced (activity_score >= 30)
        WHEN COALESCE(activity_score, 0) >= 30
          THEN 'experienced'
        
        -- Default: other (doesn't fit any category)
        ELSE 'other'
      END as category
    FROM participants_enriched
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
    SELECT unnest(ARRAY['core', 'experienced', 'newcomers', 'silent', 'other']) as category
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

COMMENT ON FUNCTION get_engagement_breakdown IS 
'Returns engagement breakdown including both Telegram and WhatsApp activity:
- Silent: no activity >30d OR never active & joined >7d
- Newcomers: joined <30d (and not silent)
- Core: activity_score >= 60
- Experienced: activity_score >= 30';

GRANT EXECUTE ON FUNCTION get_engagement_breakdown(UUID) TO authenticated;

-- ============================================================================
-- Update get_key_metrics to:
-- 1. Count ALL participants in org (not just Telegram group members)
-- 2. Include WhatsApp messages in activity stats
-- ============================================================================
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
  
  -- Get TOTAL participants in org (not just Telegram group members)
  -- This is the base for engagement rate calculation
  SELECT COUNT(*) INTO v_total_participants
  FROM participants p
  WHERE p.org_id = p_org_id 
    AND p.merged_into IS NULL
    AND COALESCE(p.source, '') != 'bot';
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  -- Telegram activity (from org groups)
  telegram_current AS (
    SELECT 
      ae.tg_user_id,
      CASE WHEN ae.event_type = 'message' THEN 1 ELSE 0 END as is_message,
      CASE WHEN ae.reply_to_message_id IS NOT NULL 
              OR (ae.meta->'message'->>'reply_to_id') IS NOT NULL THEN 1 ELSE 0 END as is_reply,
      COALESCE(ae.reactions_count, 0) as reactions
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
  ),
  -- WhatsApp activity (tg_chat_id = 0)
  whatsapp_current AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      1 as is_message,
      0 as is_reply,
      0 as reactions
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= v_current_start
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't filter by chat_id
  ),
  current_stats AS (
    SELECT 
      -- Unique active participants (from both Telegram and WhatsApp)
      (
        SELECT COUNT(DISTINCT x.participant_id) FROM (
          -- Telegram participants (via tg_user_id -> participants mapping)
          SELECT p.id as participant_id
          FROM telegram_current tc
          JOIN participants p ON p.tg_user_id = tc.tg_user_id AND p.org_id = p_org_id
          WHERE tc.tg_user_id IS NOT NULL
          UNION
          -- WhatsApp participants (directly from meta)
          SELECT wc.participant_id
          FROM whatsapp_current wc
        ) x
      )::INT as participants,
      -- Total messages (Telegram + WhatsApp)
      (
        (SELECT COUNT(*) FROM telegram_current WHERE is_message = 1) +
        (SELECT COUNT(*) FROM whatsapp_current)
      )::INT as messages,
      -- Replies (Telegram only for now)
      (SELECT COUNT(*) FROM telegram_current WHERE is_reply = 1)::INT as replies,
      -- Reactions (Telegram only)
      (SELECT COALESCE(SUM(reactions), 0) FROM telegram_current)::BIGINT as reactions
  ),
  -- Previous period (same logic)
  telegram_previous AS (
    SELECT 
      ae.tg_user_id,
      CASE WHEN ae.event_type = 'message' THEN 1 ELSE 0 END as is_message,
      CASE WHEN ae.reply_to_message_id IS NOT NULL 
              OR (ae.meta->'message'->>'reply_to_id') IS NOT NULL THEN 1 ELSE 0 END as is_reply,
      COALESCE(ae.reactions_count, 0) as reactions
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= v_previous_start
      AND ae.created_at < v_previous_end
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
  ),
  whatsapp_previous AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      1 as is_message,
      0 as is_reply,
      0 as reactions
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= v_previous_start
      AND ae.created_at < v_previous_end
      AND p_tg_chat_id IS NULL
  ),
  previous_stats AS (
    SELECT 
      (
        SELECT COUNT(DISTINCT x.participant_id) FROM (
          SELECT p.id as participant_id
          FROM telegram_previous tp
          JOIN participants p ON p.tg_user_id = tp.tg_user_id AND p.org_id = p_org_id
          WHERE tp.tg_user_id IS NOT NULL
          UNION
          SELECT wp.participant_id
          FROM whatsapp_previous wp
        ) x
      )::INT as participants,
      (
        (SELECT COUNT(*) FROM telegram_previous WHERE is_message = 1) +
        (SELECT COUNT(*) FROM whatsapp_previous)
      )::INT as messages,
      (SELECT COUNT(*) FROM telegram_previous WHERE is_reply = 1)::INT as replies,
      (SELECT COALESCE(SUM(reactions), 0) FROM telegram_previous)::BIGINT as reactions
  )
  SELECT 
    cs.participants,
    cs.messages,
    ROUND((cs.participants::NUMERIC / v_total_participants::NUMERIC) * 100, 1) as engagement_rate,
    cs.replies,
    cs.reactions::INT,
    CASE WHEN cs.messages > 0 
      THEN ROUND((cs.replies::NUMERIC / cs.messages::NUMERIC) * 100, 1)
      ELSE 0 
    END as current_reply_ratio,
    ps.participants,
    ps.messages,
    ROUND((ps.participants::NUMERIC / v_total_participants::NUMERIC) * 100, 1) as engagement_rate_prev,
    ps.replies,
    ps.reactions::INT,
    CASE WHEN ps.messages > 0 
      THEN ROUND((ps.replies::NUMERIC / ps.messages::NUMERIC) * 100, 1)
      ELSE 0 
    END as previous_reply_ratio
  FROM current_stats cs, previous_stats ps;
END;
$$;

COMMENT ON FUNCTION get_key_metrics IS 'Returns key metrics including WhatsApp activity. Engagement = active/total participants.';

GRANT EXECUTE ON FUNCTION get_key_metrics(UUID, INT, BIGINT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 142 Complete: Analytics now includes WhatsApp activity'; END $$;

