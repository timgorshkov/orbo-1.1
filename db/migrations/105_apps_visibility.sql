-- Migration: Add visibility to apps + public org fields
-- Purpose: Enable public/members/private access control for apps
-- Date: 2025-11-10

-- =====================================================
-- STEP 1: Add visibility to apps table
-- =====================================================

-- Add visibility column
ALTER TABLE apps 
ADD COLUMN IF NOT EXISTS visibility TEXT 
CHECK (visibility IN ('public', 'members', 'private')) 
DEFAULT 'members';

-- Update existing apps to 'members' if NULL
UPDATE apps SET visibility = 'members' WHERE visibility IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_apps_visibility_status 
ON apps(visibility, status) 
WHERE status = 'published';

-- =====================================================
-- STEP 2: Add public fields to organizations
-- =====================================================

-- Add description and Telegram link for Community Hub
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS public_description TEXT,
ADD COLUMN IF NOT EXISTS telegram_group_link TEXT;

-- =====================================================
-- STEP 3: Update RLS Policies for apps
-- =====================================================

-- Drop existing SELECT policies to recreate
DROP POLICY IF EXISTS "Apps are viewable by org members" ON apps;
DROP POLICY IF EXISTS "Admins can view org apps" ON apps;
DROP POLICY IF EXISTS "Public apps viewable by everyone" ON apps;

-- Policy 1: Public apps are viewable by everyone (no auth required)
CREATE POLICY "Public apps viewable by everyone"
  ON apps FOR SELECT
  USING (
    status = 'published' 
    AND visibility = 'public'
  );

-- Policy 2: Members-only apps viewable by participants
CREATE POLICY "Members apps viewable by participants"
  ON apps FOR SELECT
  USING (
    status = 'published' 
    AND visibility = 'members'
    AND org_id IN (
      SELECT org_id FROM participants
      WHERE id = auth.uid()
    )
  );

-- Policy 3: Private apps viewable only by admins
CREATE POLICY "Private apps viewable by admins"
  ON apps FOR SELECT
  USING (
    visibility = 'private'
    AND org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 4: Admins can always view their org's apps (bypass visibility)
CREATE POLICY "Admins can view all org apps"
  ON apps FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- STEP 4: Update RLS Policies for app_collections
-- =====================================================

-- Collections inherit visibility from parent app
DROP POLICY IF EXISTS "App collections viewable by org members" ON app_collections;
DROP POLICY IF EXISTS "Public app collections" ON app_collections;

CREATE POLICY "App collections inherit app visibility"
  ON app_collections FOR SELECT
  USING (
    app_id IN (
      SELECT a.id FROM apps a
      WHERE 
        -- Public apps
        (a.status = 'published' AND a.visibility = 'public')
        -- Members-only apps
        OR (
          a.status = 'published' 
          AND a.visibility = 'members'
          AND a.org_id IN (
            SELECT org_id FROM participants
            WHERE id = auth.uid()
          )
        )
        -- Admin access
        OR a.org_id IN (
          SELECT org_id FROM memberships
          WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
        )
    )
  );

-- =====================================================
-- STEP 5: Update RLS Policies for app_items
-- =====================================================

-- Items inherit visibility from parent app (through collection)
DROP POLICY IF EXISTS "App items viewable by org members" ON app_items;
DROP POLICY IF EXISTS "Public app items" ON app_items;

CREATE POLICY "App items inherit app visibility"
  ON app_items FOR SELECT
  USING (
    collection_id IN (
      SELECT ac.id FROM app_collections ac
      JOIN apps a ON ac.app_id = a.id
      WHERE 
        -- Public apps
        (a.status = 'published' AND a.visibility = 'public')
        -- Members-only apps
        OR (
          a.status = 'published' 
          AND a.visibility = 'members'
          AND a.org_id IN (
            SELECT org_id FROM participants
            WHERE id = auth.uid()
          )
        )
        -- Admin access
        OR a.org_id IN (
          SELECT org_id FROM memberships
          WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
        )
    )
  );

-- =====================================================
-- STEP 6: Verification
-- =====================================================

-- Count apps by visibility (for verification)
DO $$
DECLARE
  public_count INTEGER;
  members_count INTEGER;
  private_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO public_count FROM apps WHERE visibility = 'public';
  SELECT COUNT(*) INTO members_count FROM apps WHERE visibility = 'members';
  SELECT COUNT(*) INTO private_count FROM apps WHERE visibility = 'private';
  
  RAISE NOTICE 'Apps visibility distribution:';
  RAISE NOTICE '  Public: %', public_count;
  RAISE NOTICE '  Members: %', members_count;
  RAISE NOTICE '  Private: %', private_count;
END $$;

