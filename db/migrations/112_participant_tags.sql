-- Migration 112: Custom Tags System for CRM
-- Allows admins to create custom tags and assign them to participants
-- Tags are admin-only (not visible to regular members)

-- ============================================
-- TABLE: participant_tags
-- ============================================
CREATE TABLE IF NOT EXISTS participant_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6', -- Default blue
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique tag names per organization
  UNIQUE(org_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_participant_tags_org ON participant_tags(org_id);
CREATE INDEX IF NOT EXISTS idx_participant_tags_name ON participant_tags(org_id, name);

-- Comments
COMMENT ON TABLE participant_tags IS 'Custom tags for participant segmentation and CRM (admin-only)';
COMMENT ON COLUMN participant_tags.color IS 'Hex color code for tag display (e.g., #3B82F6)';

-- ============================================
-- TABLE: participant_tag_assignments
-- ============================================
CREATE TABLE IF NOT EXISTS participant_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES participant_tags(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  
  -- Prevent duplicate assignments
  UNIQUE(participant_id, tag_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tag_assignments_participant ON participant_tag_assignments(participant_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag ON participant_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_assigned_at ON participant_tag_assignments(assigned_at DESC);

-- Comments
COMMENT ON TABLE participant_tag_assignments IS 'Many-to-many relationship between participants and tags';
COMMENT ON COLUMN participant_tag_assignments.assigned_by IS 'Admin who assigned the tag';

-- ============================================
-- TRIGGER: Update updated_at on participant_tags
-- ============================================
CREATE OR REPLACE FUNCTION update_participant_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_participant_tags_updated_at
BEFORE UPDATE ON participant_tags
FOR EACH ROW
EXECUTE FUNCTION update_participant_tags_updated_at();

-- ============================================
-- RLS POLICIES: participant_tags
-- ============================================
ALTER TABLE participant_tags ENABLE ROW LEVEL SECURITY;

-- Policy: Admins of the organization can read tags
CREATE POLICY participant_tags_select_policy
  ON participant_tags
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_tags.org_id 
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can create tags
CREATE POLICY participant_tags_insert_policy
  ON participant_tags
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_tags.org_id 
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can update tags
CREATE POLICY participant_tags_update_policy
  ON participant_tags
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_tags.org_id 
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can delete tags
CREATE POLICY participant_tags_delete_policy
  ON participant_tags
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_tags.org_id 
        AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- RLS POLICIES: participant_tag_assignments
-- ============================================
ALTER TABLE participant_tag_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can read assignments
CREATE POLICY participant_tag_assignments_select_policy
  ON participant_tag_assignments
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT m.user_id 
      FROM memberships m
      JOIN participants p ON p.org_id = m.org_id
      WHERE p.id = participant_tag_assignments.participant_id 
        AND m.role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can create assignments
CREATE POLICY participant_tag_assignments_insert_policy
  ON participant_tag_assignments
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT m.user_id 
      FROM memberships m
      JOIN participants p ON p.org_id = m.org_id
      WHERE p.id = participant_tag_assignments.participant_id 
        AND m.role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can delete assignments
CREATE POLICY participant_tag_assignments_delete_policy
  ON participant_tag_assignments
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT m.user_id 
      FROM memberships m
      JOIN participants p ON p.org_id = m.org_id
      WHERE p.id = participant_tag_assignments.participant_id 
        AND m.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- HELPER FUNCTION: Get tags for a participant
-- ============================================
CREATE OR REPLACE FUNCTION get_participant_tags(p_participant_id UUID)
RETURNS TABLE (
  tag_id UUID,
  tag_name TEXT,
  tag_color TEXT,
  tag_description TEXT,
  assigned_at TIMESTAMPTZ,
  assigned_by_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pt.id as tag_id,
    pt.name as tag_name,
    pt.color as tag_color,
    pt.description as tag_description,
    pta.assigned_at,
    COALESCE(p.full_name, p.username, 'Unknown') as assigned_by_name
  FROM participant_tag_assignments pta
  JOIN participant_tags pt ON pt.id = pta.tag_id
  LEFT JOIN participants p ON p.user_id = pta.assigned_by AND p.org_id = pt.org_id
  WHERE pta.participant_id = p_participant_id
  ORDER BY pta.assigned_at DESC;
END;
$$;

COMMENT ON FUNCTION get_participant_tags IS 'Returns all tags assigned to a participant with metadata';

-- ============================================
-- HELPER FUNCTION: Get participants by tag
-- ============================================
CREATE OR REPLACE FUNCTION get_participants_by_tag(p_tag_id UUID)
RETURNS TABLE (
  participant_id UUID,
  full_name TEXT,
  username TEXT,
  photo_url TEXT,
  assigned_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as participant_id,
    p.full_name,
    p.username,
    p.photo_url,
    pta.assigned_at
  FROM participant_tag_assignments pta
  JOIN participants p ON p.id = pta.participant_id
  WHERE pta.tag_id = p_tag_id
    AND p.merged_into IS NULL
  ORDER BY pta.assigned_at DESC;
END;
$$;

COMMENT ON FUNCTION get_participants_by_tag IS 'Returns all participants assigned to a specific tag';

-- ============================================
-- HELPER FUNCTION: Get tag usage statistics
-- ============================================
CREATE OR REPLACE FUNCTION get_tag_stats(p_org_id UUID)
RETURNS TABLE (
  tag_id UUID,
  tag_name TEXT,
  tag_color TEXT,
  participant_count BIGINT,
  last_used TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pt.id as tag_id,
    pt.name as tag_name,
    pt.color as tag_color,
    COUNT(DISTINCT pta.participant_id) as participant_count,
    MAX(pta.assigned_at) as last_used
  FROM participant_tags pt
  LEFT JOIN participant_tag_assignments pta ON pta.tag_id = pt.id
  WHERE pt.org_id = p_org_id
  GROUP BY pt.id, pt.name, pt.color
  ORDER BY participant_count DESC, pt.name ASC;
END;
$$;

COMMENT ON FUNCTION get_tag_stats IS 'Returns usage statistics for all tags in an organization';

-- ============================================
-- PREDEFINED TAG COLOR PALETTE
-- ============================================
-- These are suggested colors for tag creation UI
-- (stored as comment for reference, not enforced in DB)
/*
Predefined Color Palette:
- Blue:    #3B82F6  (default, general purpose)
- Green:   #10B981  (positive, active, paid)
- Yellow:  #F59E0B  (warning, attention needed)
- Red:     #EF4444  (urgent, problem, risk)
- Purple:  #8B5CF6  (VIP, premium)
- Pink:    #EC4899  (special, featured)
- Indigo:  #6366F1  (expertise, mentor)
- Gray:    #6B7280  (neutral, archived)
- Orange:  #F97316  (in progress, pipeline)
- Teal:    #14B8A6  (success, completed)
*/

-- Grant permissions
GRANT SELECT ON participant_tags TO authenticated;
GRANT SELECT ON participant_tag_assignments TO authenticated;
GRANT EXECUTE ON FUNCTION get_participant_tags TO authenticated;
GRANT EXECUTE ON FUNCTION get_participants_by_tag TO authenticated;
GRANT EXECUTE ON FUNCTION get_tag_stats TO authenticated;

