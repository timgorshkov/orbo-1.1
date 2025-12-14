-- Migration: Fix infinite recursion in memberships RLS policy
-- Issue: The SELECT policy on memberships references memberships itself, causing infinite recursion

-- =====================================================
-- 1. FIX MEMBERSHIPS SELECT POLICY
-- =====================================================

DROP POLICY IF EXISTS "Users can view memberships of their organizations" ON public.memberships;

-- Simple policy: users can see their own memberships + memberships of orgs they belong to
-- To avoid recursion, we use a different approach:
-- 1. Users can always see their own membership rows
-- 2. For seeing other members of the same org, we use a security definer function

-- Create a helper function to check org membership (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.user_is_member_of_org(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.user_is_member_of_org(UUID) TO authenticated;

-- Now create the policy using the helper function
CREATE POLICY "Users can view memberships of their organizations"
ON public.memberships FOR SELECT
USING (
  -- User can see their own memberships
  user_id = (select auth.uid())
  -- OR user is a member of the same organization (checked via security definer function)
  OR public.user_is_member_of_org(org_id)
);

-- =====================================================
-- 2. FIX INSERT POLICY (also has potential recursion)
-- =====================================================

DROP POLICY IF EXISTS "Admins can insert new memberships" ON public.memberships;

-- Create helper function for admin check
CREATE OR REPLACE FUNCTION public.user_is_org_admin(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_org_admin(UUID) TO authenticated;

CREATE POLICY "Admins can insert new memberships"
ON public.memberships FOR INSERT
WITH CHECK (
  public.user_is_org_admin(org_id)
);

-- =====================================================
-- 3. FIX UPDATE POLICY
-- =====================================================

DROP POLICY IF EXISTS "Admins can update memberships" ON public.memberships;

CREATE POLICY "Admins can update memberships"
ON public.memberships FOR UPDATE
USING (
  public.user_is_org_admin(org_id)
);

-- =====================================================
-- 4. FIX DELETE POLICY
-- =====================================================

DROP POLICY IF EXISTS "Admins can delete memberships" ON public.memberships;

CREATE POLICY "Admins can delete memberships"
ON public.memberships FOR DELETE
USING (
  public.user_is_org_admin(org_id)
);

-- =====================================================
-- 5. Also fix organizations policy which references memberships
-- =====================================================

DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can update organization" ON public.organizations;

CREATE POLICY "Members can view their organizations"
ON public.organizations FOR SELECT
USING (
  public.user_is_member_of_org(id)
);

CREATE POLICY "Owners and admins can update organization"
ON public.organizations FOR UPDATE
USING (
  public.user_is_org_admin(id)
);

