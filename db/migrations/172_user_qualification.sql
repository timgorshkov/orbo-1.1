-- User Qualification System
-- Flexible storage for qualification questions and responses
-- Questions can change over time without schema changes

-- Table for storing qualification responses
CREATE TABLE IF NOT EXISTS user_qualification_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Flexible JSONB storage for all responses
  -- Example structure:
  -- {
  --   "role": "owner",
  --   "community_type": "professional",
  --   "groups_count": "3-5",
  --   "pain_points": ["missing_messages", "inactive_tracking"],
  --   "referral_source": "friend"
  -- }
  responses JSONB NOT NULL DEFAULT '{}',
  
  -- Version of qualification form (to track which questions were asked)
  form_version TEXT NOT NULL DEFAULT 'v1',
  
  -- When qualification was completed
  completed_at TIMESTAMPTZ,
  
  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One qualification per user
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_qualification_responses ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own qualification
CREATE POLICY "Users can view own qualification"
  ON user_qualification_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own qualification"
  ON user_qualification_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own qualification"
  ON user_qualification_responses FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do everything (for superadmin)
CREATE POLICY "Service role full access to qualification"
  ON user_qualification_responses FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Index for quick lookups
CREATE INDEX idx_qualification_user_id ON user_qualification_responses(user_id);
CREATE INDEX idx_qualification_completed ON user_qualification_responses(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_qualification_form_version ON user_qualification_responses(form_version);

-- GIN index for JSONB queries in superadmin
CREATE INDEX idx_qualification_responses_gin ON user_qualification_responses USING GIN (responses);

-- Updated at trigger
CREATE TRIGGER update_qualification_updated_at
  BEFORE UPDATE ON user_qualification_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get qualification statistics (for superadmin)
CREATE OR REPLACE FUNCTION get_qualification_stats()
RETURNS TABLE (
  total_responses BIGINT,
  completed_count BIGINT,
  by_role JSONB,
  by_community_type JSONB,
  by_groups_count JSONB,
  top_pain_points JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_responses,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::BIGINT as completed_count,
    
    -- Count by role
    jsonb_object_agg(
      COALESCE(responses->>'role', 'unknown'),
      role_count
    ) as by_role,
    
    -- Count by community type
    jsonb_object_agg(
      COALESCE(responses->>'community_type', 'unknown'),
      community_count
    ) as by_community_type,
    
    -- Count by groups count
    jsonb_object_agg(
      COALESCE(responses->>'groups_count', 'unknown'),
      groups_count
    ) as by_groups_count,
    
    -- Top pain points
    '[]'::jsonb as top_pain_points
    
  FROM user_qualification_responses
  CROSS JOIN LATERAL (
    SELECT COUNT(*) as role_count
    FROM user_qualification_responses r2
    WHERE r2.responses->>'role' = user_qualification_responses.responses->>'role'
  ) roles
  CROSS JOIN LATERAL (
    SELECT COUNT(*) as community_count
    FROM user_qualification_responses r3
    WHERE r3.responses->>'community_type' = user_qualification_responses.responses->>'community_type'
  ) communities
  CROSS JOIN LATERAL (
    SELECT COUNT(*) as groups_count
    FROM user_qualification_responses r4
    WHERE r4.responses->>'groups_count' = user_qualification_responses.responses->>'groups_count'
  ) groups_stat;
END;
$$;

-- Simpler stats function
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

COMMENT ON TABLE user_qualification_responses IS 'Stores user qualification/onboarding survey responses in flexible JSONB format';
COMMENT ON COLUMN user_qualification_responses.responses IS 'JSONB object with all qualification answers. Keys: role, community_type, groups_count, pain_points, etc.';
COMMENT ON COLUMN user_qualification_responses.form_version IS 'Version of the qualification form to track which questions were asked';

