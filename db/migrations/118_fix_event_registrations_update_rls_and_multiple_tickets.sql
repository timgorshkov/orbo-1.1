-- Migration 118: Fix event_registrations UPDATE RLS policy and add allow_multiple_tickets setting
-- Date: Nov 19, 2025
-- Purpose: Fix RLS policy for UPDATE and add setting to allow/disallow multiple tickets per registration

-- ============================================
-- STEP 1: Fix UPDATE RLS policy
-- ============================================

-- Drop the problematic UPDATE policy
DROP POLICY IF EXISTS "Users can cancel their registrations" ON public.event_registrations;

-- Recreate with correct syntax using EXISTS
CREATE POLICY "Users can cancel their registrations"
  ON public.event_registrations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = event_registrations.participant_id
    )
  );

COMMENT ON POLICY "Users can cancel their registrations" ON public.event_registrations IS 
'Allows users to update their own registrations (cancel, etc.)';

-- ============================================
-- STEP 2: Add allow_multiple_tickets setting to events
-- ============================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS allow_multiple_tickets BOOLEAN DEFAULT false;

COMMENT ON COLUMN events.allow_multiple_tickets IS 'If true, allows participants to register multiple tickets (quantity > 1) in a single registration';

-- ============================================
-- STEP 3: Update trigger to validate quantity based on allow_multiple_tickets
-- ============================================

CREATE OR REPLACE FUNCTION validate_registration_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_allow_multiple BOOLEAN;
BEGIN
  -- Get event setting
  SELECT allow_multiple_tickets INTO v_allow_multiple
  FROM events
  WHERE id = NEW.event_id;
  
  -- If multiple tickets not allowed, enforce quantity = 1
  IF v_allow_multiple = false AND NEW.quantity > 1 THEN
    RAISE EXCEPTION 'Multiple tickets are not allowed for this event. Set quantity to 1.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate quantity
DROP TRIGGER IF EXISTS trigger_validate_registration_quantity ON event_registrations;
CREATE TRIGGER trigger_validate_registration_quantity
  BEFORE INSERT OR UPDATE OF quantity ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION validate_registration_quantity();

COMMENT ON FUNCTION validate_registration_quantity IS 'Validates that quantity > 1 is only allowed if event.allow_multiple_tickets = true';

DO $$ BEGIN RAISE NOTICE 'Migration 118 Complete: Fixed event_registrations UPDATE RLS policy and added allow_multiple_tickets setting.'; END $$;

