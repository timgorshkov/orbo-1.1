-- Migration 077: Fix Duplicate Participant Scoring Trigger
-- Created: 2025-11-01
-- Purpose: Remove duplicate trigger_update_participant_scores

-- Drop all existing triggers with this name
DROP TRIGGER IF EXISTS trigger_update_participant_scores ON public.participants;

-- Recreate the trigger (only once)
CREATE TRIGGER trigger_update_participant_scores
  BEFORE INSERT OR UPDATE OF last_activity_at
  ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION update_participant_scores_trigger();

-- Verify
DO $$
BEGIN
  RAISE NOTICE '=== Migration 077 Complete ===';
  RAISE NOTICE 'Duplicate trigger removed';
  RAISE NOTICE 'Single trigger recreated';
  RAISE NOTICE '================================';
END $$;

