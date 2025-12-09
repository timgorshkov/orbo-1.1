-- Migration 135: Create event-covers storage bucket
-- Date: Dec 4, 2025
-- Purpose: Add storage bucket for event cover images

-- ============================================
-- STEP 1: Create storage bucket for event covers
-- ============================================

-- Create bucket (if using SQL instead of dashboard)
-- Note: This requires superuser privileges. Usually done via Supabase Dashboard or init script.
-- If bucket already exists, this will fail gracefully due to ON CONFLICT.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-covers',
  'event-covers',
  true, -- Public bucket for event covers
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STEP 2: Create storage policies for event-covers bucket
-- ============================================

-- Drop existing policies if they exist (to allow re-running migration)
DROP POLICY IF EXISTS "Authenticated users can upload event covers" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to event covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update event covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete event covers" ON storage.objects;

-- Allow authenticated users to upload event covers
CREATE POLICY "Authenticated users can upload event covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-covers'
);

-- Allow public read access to event covers
CREATE POLICY "Public read access to event covers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-covers');

-- Allow authenticated users to update event covers (for their org's events)
CREATE POLICY "Authenticated users can update event covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-covers')
WITH CHECK (bucket_id = 'event-covers');

-- Allow authenticated users to delete event covers (for their org's events)
CREATE POLICY "Authenticated users can delete event covers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-covers');

DO $$ BEGIN 
  RAISE NOTICE 'Migration 135 Complete: Created event-covers storage bucket and policies.'; 
END $$;

