-- Migration 079: Fix dashboard attention zones (remove reference to deleted telegram_activity_events)

-- Fix get_inactive_newcomers to use activity_events instead of telegram_activity_events
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
      tg_user_id,
      MIN(created_at) as first_activity_date,
      COUNT(*) as activity_count
    FROM activity_events
    WHERE org_id = p_org_id
      AND event_type IN ('message', 'join')  -- Считаем только сообщения и вступления
    GROUP BY tg_user_id
  )
  SELECT 
    p.id,
    p.full_name,
    p.username,
    p.created_at,
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
    AND (p.status IS NULL OR p.status != 'inactive')
  ORDER BY p.created_at DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION get_inactive_newcomers IS 'Returns newcomers who joined but remain mostly inactive (using activity_events)';

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_inactive_newcomers TO authenticated;

DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 079 Complete: Fixed get_inactive_newcomers to use activity_events'; 
END $$;

