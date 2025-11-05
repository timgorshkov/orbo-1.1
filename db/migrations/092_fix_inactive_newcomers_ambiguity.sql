-- Migration 092: Fix get_inactive_newcomers Ambiguous Column
-- Date: Nov 5, 2025
-- Purpose: Fix "column reference created_at is ambiguous" error

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
  WITH first_activity AS (
    SELECT 
      ae.tg_user_id,
      MIN(ae.created_at) as first_activity_date,  -- Explicit: ae.created_at
      COUNT(*) as activity_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.event_type IN ('message', 'join')  -- Считаем только сообщения и вступления
    GROUP BY ae.tg_user_id
  )
  SELECT 
    p.id as participant_id,
    p.full_name,
    p.username,
    p.created_at as created_at,  -- Explicit: p.created_at
    EXTRACT(DAY FROM NOW() - COALESCE(fa.first_activity_date, p.created_at))::INTEGER as days_since_join,
    COALESCE(fa.activity_count, 0)::INTEGER as activity_count
  FROM participants p
  LEFT JOIN first_activity fa ON fa.tg_user_id = p.tg_user_id
  WHERE 
    p.org_id = p_org_id
    AND p.created_at > NOW() - INTERVAL '30 days' -- Joined in last 30 days
    AND (
      -- Either never had activity or had very little
      fa.activity_count IS NULL 
      OR fa.activity_count <= 2
    )
    AND COALESCE(fa.first_activity_date, p.created_at) < NOW() - (p_days_since_first || ' days')::INTERVAL
    AND p.source != 'bot'
    AND (p.participant_status IS NULL OR p.participant_status != 'excluded')  -- Fixed: p.status -> p.participant_status
  ORDER BY p.created_at DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION get_inactive_newcomers IS 'Returns inactive newcomers who joined recently but have minimal activity';

GRANT EXECUTE ON FUNCTION get_inactive_newcomers(UUID, INTEGER) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 092 Complete: get_inactive_newcomers fixed (ambiguous column)'; END $$;

