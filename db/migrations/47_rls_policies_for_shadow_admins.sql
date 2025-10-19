-- Migration: RLS policies for shadow admin profiles
-- Created: 2025-10-19
-- Purpose: Restrict create/update operations to activated admins only (those with confirmed email)

DO $$
BEGIN
  RAISE NOTICE 'Creating helper function for checking activated admin status...';
END $$;

-- Функция для проверки, является ли админ активированным (имеет подтверждённый email)
CREATE OR REPLACE FUNCTION is_activated_admin(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM memberships m
    INNER JOIN auth.users u ON u.id = m.user_id
    WHERE 
      m.user_id = p_user_id
      AND m.org_id = p_org_id
      AND m.role IN ('owner', 'admin')
      AND (
        m.role = 'owner' 
        OR (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL)  -- Админы должны иметь подтверждённый email
      )
  );
$$;

COMMENT ON FUNCTION is_activated_admin(UUID, UUID) IS 
'Returns true if user is an activated admin (owner or admin with confirmed email) in the organization';

DO $$
BEGIN
  RAISE NOTICE 'Updating RLS policies for material_pages...';
END $$;

-- =====================================
-- MATERIAL PAGES POLICIES
-- =====================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create materials" ON material_pages;
DROP POLICY IF EXISTS "Admins can update materials" ON material_pages;
DROP POLICY IF EXISTS "Admins can delete materials" ON material_pages;

-- Create new policies that check for activated admin
CREATE POLICY "Activated admins can create materials"
  ON material_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_activated_admin(auth.uid(), org_id)
  );

COMMENT ON POLICY "Activated admins can create materials" ON material_pages IS
'Only activated admins (with confirmed email) can create materials';

CREATE POLICY "Activated admins can update materials"
  ON material_pages
  FOR UPDATE
  TO authenticated
  USING (
    is_activated_admin(auth.uid(), org_id)
  );

COMMENT ON POLICY "Activated admins can update materials" ON material_pages IS
'Only activated admins (with confirmed email) can update materials';

CREATE POLICY "Activated admins can delete materials"
  ON material_pages
  FOR DELETE
  TO authenticated
  USING (
    is_activated_admin(auth.uid(), org_id)
  );

COMMENT ON POLICY "Activated admins can delete materials" ON material_pages IS
'Only activated admins (with confirmed email) can delete materials';

-- Read policy остаётся прежним (все члены организации могут читать)
-- Предполагается, что уже есть политика для чтения

DO $$
BEGIN
  RAISE NOTICE 'Updating RLS policies for events...';
END $$;

-- =====================================
-- EVENTS POLICIES
-- =====================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create events" ON events;
DROP POLICY IF EXISTS "Admins can update events" ON events;
DROP POLICY IF EXISTS "Admins can delete events" ON events;

-- Create new policies that check for activated admin
CREATE POLICY "Activated admins can create events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_activated_admin(auth.uid(), org_id)
  );

COMMENT ON POLICY "Activated admins can create events" ON events IS
'Only activated admins (with confirmed email) can create events';

CREATE POLICY "Activated admins can update events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (
    is_activated_admin(auth.uid(), org_id)
  );

COMMENT ON POLICY "Activated admins can update events" ON events IS
'Only activated admins (with confirmed email) can update events';

CREATE POLICY "Activated admins can delete events"
  ON events
  FOR DELETE
  TO authenticated
  USING (
    is_activated_admin(auth.uid(), org_id)
  );

COMMENT ON POLICY "Activated admins can delete events" ON events IS
'Only activated admins (with confirmed email) can delete events';

DO $$
BEGIN
  RAISE NOTICE 'Creating view for admin status check...';
END $$;

-- =====================================
-- HELPER VIEW FOR UI
-- =====================================

-- Создаём view для удобной проверки статуса админа в UI
CREATE OR REPLACE VIEW user_admin_status AS
SELECT 
  m.user_id,
  m.org_id,
  m.role,
  m.role_source,
  u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL AS has_confirmed_email,
  m.metadata->>'shadow_profile' = 'true' AS is_shadow_profile,
  is_activated_admin(m.user_id, m.org_id) AS is_activated
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.role IN ('owner', 'admin');

COMMENT ON VIEW user_admin_status IS
'Shows admin activation status for easy UI checks. is_activated = true means full edit rights.';

DO $$
BEGIN
  RAISE NOTICE 'RLS policies successfully updated for shadow admin profiles';
  RAISE NOTICE 'Shadow admins (without email) can now only read, not create/edit/delete';
  RAISE NOTICE 'To get full rights, admin must confirm email via /settings/profile';
END $$;

