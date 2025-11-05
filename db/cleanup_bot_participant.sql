-- OPTIONAL: Remove ChatKeeperBot from participants
-- This bot was created before the isBot() fix
-- Run this if you want to clean up existing bot records

-- ⚠️ IMPORTANT: Apply migration 082 FIRST!
-- Migration 082 fixes the check_participant_exclusion trigger
-- Otherwise deletion will fail with "column org_id does not exist" error

-- Step 1: Apply migration 082
-- Run this in Supabase SQL Editor: db/migrations/082_fix_check_participant_exclusion_trigger.sql

-- Step 2: Check what will be deleted
SELECT 
  p.id,
  p.org_id,
  p.full_name,
  p.tg_user_id,
  p.username,
  p.source,
  (SELECT COUNT(*) FROM participant_groups pg WHERE pg.participant_id = p.id) as group_count,
  (SELECT COUNT(*) FROM participant_messages pm WHERE pm.participant_id = p.id) as message_count
FROM participants p
WHERE p.tg_user_id = 553147242; -- ChatKeeperBot

-- Step 3: Delete (uncomment below after applying migration 082)

BEGIN;

-- Delete from participant_groups first (foreign key)
DELETE FROM participant_groups
WHERE participant_id = (SELECT id FROM participants WHERE tg_user_id = 553147242);

-- Delete participant_messages
DELETE FROM participant_messages
WHERE participant_id = (SELECT id FROM participants WHERE tg_user_id = 553147242);

-- Delete the participant
DELETE FROM participants
WHERE tg_user_id = 553147242;

COMMIT;


-- Expected result:
-- ✅ ChatKeeperBot and all related records removed
-- ✅ Future imports will automatically filter bots
