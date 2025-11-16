-- Migration 111: Fix app_items creator_id to use participant_id instead of user_id
-- 
-- Problem: creator_id in app_items was storing user_id, but should store participant_id
-- This migration fixes existing records and FK constraints

-- Step 1: Drop the incorrect foreign key constraint (if exists)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'app_items_creator_id_fkey'
  ) THEN
    ALTER TABLE app_items DROP CONSTRAINT app_items_creator_id_fkey;
    RAISE NOTICE 'Dropped constraint app_items_creator_id_fkey';
  END IF;
END $$;

-- Step 2: Update existing items where creator_id = user_id
-- Map user_id to participant_id for the same org
UPDATE app_items ai
SET creator_id = p.id
FROM participants p
WHERE 
  -- Current creator_id matches a user_id in participants
  ai.creator_id = p.user_id
  -- Same organization
  AND ai.org_id = p.org_id
  -- Only update if not already using participant_id
  AND NOT EXISTS (
    SELECT 1 FROM participants p2 
    WHERE p2.id = ai.creator_id
  );

-- Step 3: Add correct foreign key constraint to participants
ALTER TABLE app_items
ADD CONSTRAINT app_items_creator_id_fkey 
FOREIGN KEY (creator_id) 
REFERENCES participants(id) 
ON DELETE SET NULL;

-- Step 4: Verify the fix
-- This query should return 0 rows after the migration
DO $$
DECLARE
  broken_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO broken_count
  FROM app_items ai
  WHERE ai.creator_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = ai.creator_id
        AND p.org_id = ai.org_id
    );
  
  IF broken_count > 0 THEN
    RAISE WARNING 'Found % items with broken creator_id references', broken_count;
  ELSE
    RAISE NOTICE 'All items have valid creator_id references';
  END IF;
END $$;

-- Step 5: Add a helpful comment
COMMENT ON COLUMN app_items.creator_id IS 'References participants.id (NOT users.id)';

