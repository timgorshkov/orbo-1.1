-- =====================================================
-- Organization Status (archiving support)
-- =====================================================
-- Purpose: Allow archiving organizations without deleting data
-- Status values:
--   'active' - default, visible everywhere
--   'archived' - hidden from user lists, visible in superadmin
-- =====================================================

-- Add status column
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add check constraint for valid statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'organizations_status_check'
  ) THEN
    ALTER TABLE organizations 
    ADD CONSTRAINT organizations_status_check 
    CHECK (status IN ('active', 'archived'));
  END IF;
END$$;

-- Add archived_at timestamp for tracking when org was archived
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add archived_by for audit trail
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- Index for filtering active organizations (most common query)
CREATE INDEX IF NOT EXISTS idx_organizations_status 
ON organizations(status) 
WHERE status = 'active';

-- Comment
COMMENT ON COLUMN organizations.status IS 'Organization status: active (default) or archived';
COMMENT ON COLUMN organizations.archived_at IS 'When the organization was archived';
COMMENT ON COLUMN organizations.archived_by IS 'Who archived the organization (superadmin user_id)';

-- =====================================================
-- Helper function: Check if user has only archived orgs
-- =====================================================
-- Returns true if all user's organizations are archived (or they have none)
CREATE OR REPLACE FUNCTION user_has_only_archived_orgs(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_total_orgs INT;
  v_active_orgs INT;
BEGIN
  -- Count total memberships
  SELECT COUNT(*) INTO v_total_orgs
  FROM memberships
  WHERE user_id = p_user_id;
  
  -- Count active memberships
  SELECT COUNT(*) INTO v_active_orgs
  FROM memberships m
  JOIN organizations o ON o.id = m.org_id
  WHERE m.user_id = p_user_id
    AND COALESCE(o.status, 'active') = 'active';
  
  -- User has only archived orgs if they have orgs but none are active
  RETURN v_total_orgs > 0 AND v_active_orgs = 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- Function to reset qualification for users with all archived orgs
-- =====================================================
-- Called by superadmin when archiving to give users a fresh start
CREATE OR REPLACE FUNCTION reset_qualification_if_needed(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Only reset if user has only archived orgs
  IF user_has_only_archived_orgs(p_user_id) THEN
    -- Mark qualification as incomplete (but keep responses for reference)
    UPDATE user_qualification_responses
    SET completed_at = NULL
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

