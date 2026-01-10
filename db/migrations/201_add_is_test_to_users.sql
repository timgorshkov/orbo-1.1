-- Migration: Add is_test field to users table
-- For marking test users that should be excluded from qualification statistics

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_users_is_test ON public.users(is_test) WHERE is_test = TRUE;

COMMENT ON COLUMN public.users.is_test IS 'Test user flag - excluded from qualification statistics';

-- Update get_qualification_summary to exclude test users
CREATE OR REPLACE FUNCTION get_qualification_summary()
RETURNS TABLE (
  total_users BIGINT,
  completed_qualification BIGINT,
  completion_rate NUMERIC,
  responses_by_field JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(DISTINCT u.id) as total_users,
      COUNT(DISTINCT q.user_id) FILTER (WHERE q.completed_at IS NOT NULL) as completed
    FROM public.users u
    LEFT JOIN user_qualification_responses q ON q.user_id = u.id
    WHERE u.is_test IS NOT TRUE  -- Exclude test users
  ),
  field_stats AS (
    SELECT jsonb_build_object(
      'role', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'role' as val, COUNT(*) as cnt
          FROM user_qualification_responses q
          JOIN public.users u ON u.id = q.user_id
          WHERE responses->>'role' IS NOT NULL
            AND u.is_test IS NOT TRUE  -- Exclude test users
          GROUP BY responses->>'role'
        ) r
      ),
      'community_type', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'community_type' as val, COUNT(*) as cnt
          FROM user_qualification_responses q
          JOIN public.users u ON u.id = q.user_id
          WHERE responses->>'community_type' IS NOT NULL
            AND u.is_test IS NOT TRUE  -- Exclude test users
          GROUP BY responses->>'community_type'
        ) c
      ),
      'groups_count', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'groups_count' as val, COUNT(*) as cnt
          FROM user_qualification_responses q
          JOIN public.users u ON u.id = q.user_id
          WHERE responses->>'groups_count' IS NOT NULL
            AND u.is_test IS NOT TRUE  -- Exclude test users
          GROUP BY responses->>'groups_count'
        ) g
      ),
      'pain_points', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT pp.val, COUNT(*) as cnt
          FROM user_qualification_responses q
          JOIN public.users u ON u.id = q.user_id,
               jsonb_array_elements_text(q.responses->'pain_points') as pp(val)
          WHERE u.is_test IS NOT TRUE  -- Exclude test users
          GROUP BY pp.val
        ) p
      )
    ) as stats
  )
  SELECT 
    s.total_users,
    s.completed,
    CASE WHEN s.total_users > 0 
         THEN ROUND((s.completed::NUMERIC / s.total_users) * 100, 1)
         ELSE 0 
    END as completion_rate,
    f.stats as responses_by_field
  FROM stats s, field_stats f;
END;
$$;
