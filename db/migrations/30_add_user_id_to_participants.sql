-- Migration: Add user_id column to participants table
-- Date: 12.10.2025
-- Purpose: Link participants to auth.users for proper membership management

-- Add user_id column to participants (nullable initially)
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);

-- Create composite index for org_id + user_id queries
CREATE INDEX IF NOT EXISTS idx_participants_org_user ON participants(org_id, user_id);

-- Try to populate user_id from user_telegram_accounts
UPDATE participants p
SET user_id = uta.user_id
FROM user_telegram_accounts uta
WHERE 
  p.user_id IS NULL
  AND p.tg_user_id IS NOT NULL
  AND uta.telegram_user_id::text = p.tg_user_id::text
  AND uta.org_id = p.org_id;

-- Log the result
DO $$
DECLARE
  updated_count INT;
  total_without_user_id INT;
BEGIN
  SELECT COUNT(*) INTO total_without_user_id
  FROM participants
  WHERE user_id IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Populated user_id for existing participants';
  RAISE NOTICE '% participants still without user_id (will be linked on next login)', total_without_user_id;
END $$;

COMMENT ON COLUMN participants.user_id IS 'Reference to auth.users. Links participant to authenticated user account.';

