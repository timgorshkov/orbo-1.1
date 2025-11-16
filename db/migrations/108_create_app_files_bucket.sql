-- =====================================================
-- Migration: Setup RLS Policies for app-files Storage Bucket
-- =====================================================
-- Purpose: Configure RLS policies for Orbo Apps files (logos, images, etc)
-- Date: 2025-11-16
--
-- PREREQUISITE: Create 'app-files' bucket manually via Supabase Dashboard:
-- 1. Go to Storage > Create new bucket
-- 2. Name: app-files
-- 3. Public: YES
-- 4. File size limit: 10MB
-- 5. Allowed MIME types: image/*, video/*, application/pdf
-- =====================================================

-- =====================================================
-- STEP 1: Storage Policies (RLS)
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public read access to app files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload app files" ON storage.objects;
DROP POLICY IF EXISTS "App owners can update app files" ON storage.objects;
DROP POLICY IF EXISTS "App owners can delete app files" ON storage.objects;

-- Policy 1: Public READ access (anyone can view app logos/images)
CREATE POLICY "Public read access to app files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'app-files');

-- Policy 2: Authenticated users can INSERT (upload) files
-- But we'll verify permissions in the API layer
CREATE POLICY "Authenticated users can upload app files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'app-files'
  -- Path format: {org_id}/apps/{app_id}/...
  -- We verify org membership in API layer before upload
);

-- Policy 3: Owners/Admins can UPDATE files
-- We verify in API layer, but this allows the action
CREATE POLICY "App owners can update app files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'app-files'
  -- Additional checks done in API layer
);

-- Policy 4: Owners can DELETE files
CREATE POLICY "App owners can delete app files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'app-files'
  -- Additional checks done in API layer
);

-- =====================================================
-- STEP 2: Verification
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ app-files bucket RLS policies configured!';
  RAISE NOTICE 'Make sure to create the bucket manually in Supabase Dashboard first';
  RAISE NOTICE 'Bucket name: app-files';
  RAISE NOTICE 'RLS policies: 4 policies created (SELECT, INSERT, UPDATE, DELETE)';
END $$;

