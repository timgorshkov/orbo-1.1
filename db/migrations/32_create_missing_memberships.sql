-- Migration: Create missing memberships for existing participants
-- Date: 12.10.2025
-- Purpose: Fix access for participants who were created before membership auto-creation was implemented

-- Create membership for all participants who don't have one
INSERT INTO memberships (org_id, user_id, role, role_source)
SELECT DISTINCT
  p.org_id,
  p.user_id,
  'member' AS role,
  COALESCE(p.source, 'telegram_group') AS role_source
FROM participants p
WHERE 
  p.user_id IS NOT NULL
  AND p.participant_status = 'participant'
  AND NOT EXISTS (
    SELECT 1 
    FROM memberships m 
    WHERE m.org_id = p.org_id 
      AND m.user_id = p.user_id
  )
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Log the result
DO $$
DECLARE
  inserted_count INT;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Created % missing memberships for existing participants', inserted_count;
END $$;

COMMENT ON TABLE memberships IS 'Stores organization membership with roles. Auto-created for participants during Telegram auth.';

