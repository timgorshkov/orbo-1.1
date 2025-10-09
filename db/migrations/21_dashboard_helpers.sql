-- Migration: Helper functions for dashboard attention zones

-- 1. Function to get participants on verge of churn (were active, now silent)
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
    AND (p.status IS NULL OR p.status != 'inactive')
  ORDER BY p.activity_score DESC, p.last_activity_at DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION get_churning_participants IS 'Returns participants who were active but are now silent for N days';

-- 2. Function to get inactive newcomers (first activity, then silent)
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
      participant_id,
      MIN(event_date) as first_activity_date,
      COUNT(*) as activity_count
    FROM telegram_activity_events
    WHERE org_id = p_org_id
    GROUP BY participant_id
  )
  SELECT 
    p.id,
    p.full_name,
    p.username,
    p.created_at,
    EXTRACT(DAY FROM NOW() - COALESCE(fa.first_activity_date, p.created_at))::INTEGER as days_since_join,
    COALESCE(fa.activity_count, 0)::INTEGER as activity_count
  FROM participants p
  LEFT JOIN first_activity fa ON fa.participant_id = p.id
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

COMMENT ON FUNCTION get_inactive_newcomers IS 'Returns newcomers who joined but remain mostly inactive';

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_churning_participants TO authenticated;
GRANT EXECUTE ON FUNCTION get_inactive_newcomers TO authenticated;

