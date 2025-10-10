-- Migration: Add photo_url column to participants table and create storage bucket

-- 1. Add photo_url column to participants table
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Create storage bucket for participant photos (run this in Supabase Dashboard > Storage)
-- Bucket name: participant-photos
-- Public: true
-- File size limit: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp

-- SQL to create bucket (if using SQL instead of dashboard):
INSERT INTO storage.buckets (id, name, public)
VALUES ('participant-photos', 'participant-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Create storage policies for participant-photos bucket

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload participant photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'participant-photos'
);

-- Allow public read access to photos
CREATE POLICY "Public read access to participant photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'participant-photos');

-- Allow users to update/delete their own photos
CREATE POLICY "Users can update their participant photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'participant-photos');

CREATE POLICY "Users can delete their participant photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'participant-photos');

-- 4. Add index for photo_url for faster queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_participants_photo_url 
ON participants(photo_url) 
WHERE photo_url IS NOT NULL;

-- 5. Add comment
COMMENT ON COLUMN participants.photo_url IS 'URL to participant profile photo stored in Supabase Storage';

