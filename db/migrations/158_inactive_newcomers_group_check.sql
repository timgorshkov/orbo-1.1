-- =============================================
-- Migration 158: Fix inactive newcomers to check group membership
-- Участники, не состоящие ни в одной группе, не должны попадать в "новички без активности"
-- =============================================

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
  -- Participants in groups (via participant_groups table)
  participants_in_groups AS (
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
    -- NEW: Must be in at least one group OR have WhatsApp activity
    AND (
      EXISTS (SELECT 1 FROM participants_in_groups pig WHERE pig.participant_id = p.id)
      OR EXISTS (SELECT 1 FROM whatsapp_activity wa WHERE wa.participant_id = p.id)
      OR p.tg_user_id IS NOT NULL -- Telegram participants are always in groups by definition
    )
  ORDER BY p.created_at DESC
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION get_inactive_newcomers IS 'Возвращает неактивных новичков, которые состоят хотя бы в одной группе';

