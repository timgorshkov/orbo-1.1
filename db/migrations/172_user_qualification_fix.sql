-- Fix: Drop existing policies and recreate them
-- Run this if migration 172 failed partially

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own qualification" ON user_qualification_responses;
DROP POLICY IF EXISTS "Users can insert own qualification" ON user_qualification_responses;
DROP POLICY IF EXISTS "Users can update own qualification" ON user_qualification_responses;
DROP POLICY IF EXISTS "Service role full access to qualification" ON user_qualification_responses;

-- Recreate policies
CREATE POLICY "Users can view own qualification"
  ON user_qualification_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own qualification"
  ON user_qualification_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own qualification"
  ON user_qualification_responses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to qualification"
  ON user_qualification_responses FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Drop and recreate indexes (IF NOT EXISTS for safety)
DROP INDEX IF EXISTS idx_qualification_user_id;
DROP INDEX IF EXISTS idx_qualification_completed;
DROP INDEX IF EXISTS idx_qualification_form_version;
DROP INDEX IF EXISTS idx_qualification_responses_gin;

CREATE INDEX idx_qualification_user_id ON user_qualification_responses(user_id);
CREATE INDEX idx_qualification_completed ON user_qualification_responses(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_qualification_form_version ON user_qualification_responses(form_version);
CREATE INDEX idx_qualification_responses_gin ON user_qualification_responses USING GIN (responses);

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS update_qualification_updated_at ON user_qualification_responses;

CREATE TRIGGER update_qualification_updated_at
  BEFORE UPDATE ON user_qualification_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Recreate functions (OR REPLACE handles existing)
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
    FROM auth.users u
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

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION get_qualification_summary() TO service_role;

-- Add comments
COMMENT ON TABLE user_qualification_responses IS 'Stores user qualification/onboarding survey responses in flexible JSONB format';
COMMENT ON COLUMN user_qualification_responses.responses IS 'JSONB object with all qualification answers. Keys: role, community_type, groups_count, pain_points, etc.';
COMMENT ON COLUMN user_qualification_responses.form_version IS 'Version of the qualification form to track which questions were asked';

