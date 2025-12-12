-- Migration 143: Fix inactive newcomers for WhatsApp participants
-- Date: Dec 11, 2025
-- Problem: WhatsApp participants imported recently but with old messages (114+ days) 
--          are incorrectly shown as "newcomers" because we check p.created_at
--          instead of first_activity_date from their messages

DROP FUNCTION IF EXISTS get_inactive_newcomers(UUID, INTEGER);

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
      -- Use earliest activity date from either source
      LEAST(
        COALESCE(ta.first_activity_date, wa.first_activity_date),
        COALESCE(wa.first_activity_date, ta.first_activity_date)
      ) as first_activity_date,
      COALESCE(ta.activity_count, 0) + COALESCE(wa.activity_count, 0) as total_activity
    FROM participants p
    LEFT JOIN telegram_activity ta ON ta.tg_user_id = p.tg_user_id
    LEFT JOIN whatsapp_activity wa ON wa.participant_id = p.id
    WHERE p.org_id = p_org_id
  ),
  -- Determine real join date for each participant
  participant_dates AS (
    SELECT 
      p.id,
      p.full_name,
      p.username,
      p.created_at,
      -- Real join date: earliest of first_activity_date or created_at
      CASE 
        WHEN pa.first_activity_date IS NOT NULL AND pa.first_activity_date < p.created_at 
          THEN pa.first_activity_date
        ELSE p.created_at
      END as real_join_date,
      pa.first_activity_date,
      COALESCE(pa.total_activity, 0) as total_activity
    FROM participants p
    LEFT JOIN participant_activity pa ON pa.participant_id = p.id
    WHERE p.org_id = p_org_id
      AND COALESCE(p.source, '') != 'bot'
      AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
      AND p.merged_into IS NULL
  )
  SELECT 
    pd.id as participant_id,
    pd.full_name,
    pd.username,
    pd.created_at,
    -- Days since real join (based on first activity, not import date)
    EXTRACT(DAY FROM NOW() - pd.real_join_date)::INTEGER as days_since_join,
    pd.total_activity::INTEGER as activity_count
  FROM participant_dates pd
  WHERE 
    -- REAL newcomer: joined in last 30 days based on ACTIVITY, not import date
    pd.real_join_date > NOW() - INTERVAL '30 days'
    -- Had little or no activity
    AND pd.total_activity <= 2
    -- Has been inactive for at least p_days_since_first days
    AND pd.real_join_date < NOW() - (p_days_since_first || ' days')::INTERVAL
  ORDER BY pd.real_join_date DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION get_inactive_newcomers IS 
'Returns inactive newcomers using real_join_date (first activity or created_at).
WhatsApp participants imported recently but with old messages are NOT considered newcomers.';

GRANT EXECUTE ON FUNCTION get_inactive_newcomers(UUID, INTEGER) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 143 Complete: Fixed inactive newcomers for WhatsApp participants'; END $$;

