-- =============================================
-- Migration 161: Fix attention zone functions - only show participants in groups
-- Исправление: показывать только участников, которые состоят хотя бы в одной группе
-- WhatsApp-импортированные участники без групп не должны попадать в список
-- =============================================

-- 1. Fix get_churning_participants
CREATE OR REPLACE FUNCTION get_churning_participants(
  p_org_id UUID,
  p_days_silent INTEGER DEFAULT 14
)
RETURNS TABLE(
  participant_id UUID,
  full_name TEXT,
  username TEXT,
  last_activity_at TIMESTAMPTZ,
  days_since_activity INTEGER,
  previous_activity_score INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.username,
    p.last_activity_at,
    EXTRACT(DAY FROM NOW() - p.last_activity_at)::INTEGER as days_since,
    p.activity_score
  FROM participants p
  WHERE 
    p.org_id = p_org_id
    AND p.last_activity_at IS NOT NULL
    AND p.last_activity_at < NOW() - (p_days_silent || ' days')::INTERVAL
    AND p.activity_score > 10 -- Had meaningful activity before
    AND p.source != 'bot'
    AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
    -- CRITICAL: Must be in at least one group
    AND EXISTS (
      SELECT 1 FROM participant_groups pg 
      WHERE pg.participant_id = p.id
    )
  ORDER BY p.activity_score DESC, p.last_activity_at DESC
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION get_churning_participants IS 'Returns participants who were active but are now silent for N days. Only includes participants in groups.';

-- 2. Fix get_inactive_newcomers
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
  -- Participants who are ACTUALLY in groups (critical filter)
  participants_with_groups AS (
    SELECT DISTINCT pg.participant_id
    FROM participant_groups pg
    JOIN participants p ON p.id = pg.participant_id
    WHERE p.org_id = p_org_id
  ),
  -- Combined activity per participant
  participant_activity AS (
    SELECT 
      p.id as participant_id,
      -- Use earliest activity date from either source
      LEAST(
        COALESCE(ta.first_activity_date, wa.first_activity_date),
        COALESCE(wa.first_activity_date, ta.first_activity_date)
      ) as first_activity_date,
      -- Sum activity from both sources
      COALESCE(ta.activity_count, 0) + COALESCE(wa.activity_count, 0) as total_activity
    FROM participants p
    LEFT JOIN telegram_activity ta ON ta.tg_user_id = p.tg_user_id AND p.tg_user_id IS NOT NULL
    LEFT JOIN whatsapp_activity wa ON wa.participant_id = p.id
    WHERE p.org_id = p_org_id
  )
  SELECT 
    p.id as participant_id,
    p.full_name,
    p.username,
    p.created_at,
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
    AND p.source != 'bot'
    AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
    -- CRITICAL: Must be in at least one group (via participant_groups table)
    AND EXISTS (
      SELECT 1 FROM participants_with_groups pwg 
      WHERE pwg.participant_id = p.id
    )
  ORDER BY p.created_at DESC
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION get_inactive_newcomers IS 'Возвращает неактивных новичков, которые состоят хотя бы в одной группе. WhatsApp-импортированные участники без групп исключены.';

