-- =====================================================
-- Migration: Fix get_qualification_summary to use local users table
-- =====================================================
-- Purpose: Replace auth.users reference with public.users
-- Date: 2025-01-09
-- =====================================================

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
  ),
  field_stats AS (
    SELECT jsonb_build_object(
      'role', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'role' as val, COUNT(*) as cnt
          FROM user_qualification_responses
          WHERE responses->>'role' IS NOT NULL
          GROUP BY responses->>'role'
        ) r
      ),
      'community_type', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'community_type' as val, COUNT(*) as cnt
          FROM user_qualification_responses
          WHERE responses->>'community_type' IS NOT NULL
          GROUP BY responses->>'community_type'
        ) c
      ),
      'groups_count', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'groups_count' as val, COUNT(*) as cnt
          FROM user_qualification_responses
          WHERE responses->>'groups_count' IS NOT NULL
          GROUP BY responses->>'groups_count'
        ) g
      ),
      'pain_points', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT pp.val, COUNT(*) as cnt
          FROM user_qualification_responses,
               jsonb_array_elements_text(responses->'pain_points') as pp(val)
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

-- Verification
DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM get_qualification_summary();
  RAISE NOTICE '✅ get_qualification_summary() updated to use public.users';
  RAISE NOTICE '   Total users: %, Completed: %', v_result.total_users, v_result.completed_qualification;
END $$;
