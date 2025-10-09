-- Migration: Organization settings and admin management
-- Adds logo support and admin role tracking based on Telegram groups

-- 1. Add logo_url to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN organizations.logo_url IS 'URL to organization logo stored in Supabase Storage';

-- 2. Add admin source tracking to memberships
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS role_source TEXT DEFAULT 'manual' CHECK (role_source IN ('manual', 'telegram_admin', 'invitation'));

COMMENT ON COLUMN memberships.role_source IS 'How the user got their role: manual (by owner), telegram_admin (from Telegram group), invitation (invited)';

-- 3. Add metadata column for storing group associations
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN memberships.metadata IS 'Additional metadata like telegram_groups where user is admin';

-- 4. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_memberships_role_source ON memberships(role_source);
CREATE INDEX IF NOT EXISTS idx_memberships_metadata ON memberships USING gin(metadata);

-- 5. Create a view for easy admin management
DROP VIEW IF EXISTS organization_admins;

CREATE VIEW organization_admins AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  m.metadata,
  m.created_at,
  u.email,
  COALESCE(
    CONCAT(uta.telegram_first_name, ' ', uta.telegram_last_name),
    uta.telegram_first_name,
    u.email
  ) as full_name,
  uta.telegram_username,
  uta.telegram_user_id as tg_user_id,
  o.name as org_name
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id AND uta.org_id = m.org_id AND uta.is_verified = true
LEFT JOIN organizations o ON o.id = m.org_id
WHERE m.role IN ('owner', 'admin');

COMMENT ON VIEW organization_admins IS 'View for managing organization admins with their Telegram info';

-- 6. Function to sync admin roles from Telegram groups
CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(
  user_id UUID,
  action TEXT,
  groups_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Get all users who are admins in at least one Telegram group for this org
  RETURN QUERY
  WITH telegram_admins AS (
    SELECT DISTINCT
      ugas.user_id,
      ARRAY_AGG(DISTINCT tg.id) as group_ids,
      ARRAY_AGG(DISTINCT tg.title) as group_titles
    FROM user_group_admin_status ugas
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = ugas.tg_chat_id
    WHERE 
      tg.org_id = p_org_id
      AND ugas.is_admin = true
      AND ugas.user_id IS NOT NULL
    GROUP BY ugas.user_id
  ),
  current_admins AS (
    SELECT 
      m.user_id,
      m.role,
      m.role_source,
      m.metadata
    FROM memberships m
    WHERE 
      m.org_id = p_org_id 
      AND m.role = 'admin'
      AND m.role_source = 'telegram_admin'
  )
  -- Add new admins
  INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
  SELECT 
    p_org_id,
    ta.user_id,
    'admin',
    'telegram_admin',
    jsonb_build_object(
      'telegram_groups', ta.group_ids,
      'telegram_group_titles', ta.group_titles,
      'synced_at', NOW()
    )
  FROM telegram_admins ta
  LEFT JOIN current_admins ca ON ca.user_id = ta.user_id
  WHERE ca.user_id IS NULL
  ON CONFLICT (org_id, user_id) 
  DO UPDATE SET
    role = CASE 
      WHEN memberships.role = 'owner' THEN 'owner'  -- Don't downgrade owner
      ELSE 'admin'
    END,
    role_source = CASE 
      WHEN memberships.role = 'owner' THEN memberships.role_source
      ELSE 'telegram_admin'
    END,
    metadata = EXCLUDED.metadata
  RETURNING 
    memberships.user_id,
    'added' as action,
    jsonb_array_length(EXCLUDED.metadata->'telegram_groups') as groups_count;
    
  -- Update existing admins with new group info
  UPDATE memberships m
  SET metadata = jsonb_build_object(
    'telegram_groups', ta.group_ids,
    'telegram_group_titles', ta.group_titles,
    'synced_at', NOW()
  )
  FROM telegram_admins ta
  WHERE 
    m.org_id = p_org_id
    AND m.user_id = ta.user_id
    AND m.role_source = 'telegram_admin';
    
  -- Remove admins who are no longer admins in any group
  DELETE FROM memberships m
  WHERE 
    m.org_id = p_org_id
    AND m.role = 'admin'
    AND m.role_source = 'telegram_admin'
    AND NOT EXISTS (
      SELECT 1 
      FROM telegram_admins ta 
      WHERE ta.user_id = m.user_id
    )
  RETURNING 
    m.user_id,
    'removed' as action,
    0 as groups_count;
END;
$$;

COMMENT ON FUNCTION sync_telegram_admins IS 'Synchronizes admin roles based on Telegram group admin status';

-- 7. Update RLS policies for organizations (allow logo update)
DROP POLICY IF EXISTS "Users can update their own organizations" ON organizations;
DROP POLICY IF EXISTS "Owners and admins can update organization" ON organizations;

CREATE POLICY "Owners and admins can update organization"
ON organizations FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id 
    FROM memberships 
    WHERE org_id = organizations.id 
    AND role IN ('owner', 'admin')
  )
);

-- 8. Grant necessary permissions
GRANT SELECT ON organization_admins TO authenticated;
GRANT EXECUTE ON FUNCTION sync_telegram_admins TO authenticated;

