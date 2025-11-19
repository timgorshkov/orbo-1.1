-- Migration 126: Fix validate_registration_quantity trigger to bypass RLS
-- Date: Nov 19, 2025
-- Purpose: This trigger executes BEFORE INSERT and does SELECT from events table
--          The SELECT applies RLS policies with OR causing "argument of OR must not return a set"

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_validate_registration_quantity ON event_registrations;
DROP FUNCTION IF EXISTS validate_registration_quantity();

-- Recreate function with SECURITY DEFINER and EXECUTE format to bypass RLS
CREATE OR REPLACE FUNCTION validate_registration_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_allow_multiple BOOLEAN;
BEGIN
  RAISE NOTICE '[TRIGGER validate_quantity] Starting for event_id %', NEW.event_id;
  
  -- Get event setting using EXECUTE to bypass RLS
  EXECUTE format('SELECT allow_multiple_tickets FROM %I.events WHERE id = $1', 'public')
    INTO v_allow_multiple
    USING NEW.event_id;
  
  RAISE NOTICE '[TRIGGER validate_quantity] allow_multiple_tickets = %', v_allow_multiple;
  
  -- If multiple tickets not allowed, enforce quantity = 1
  IF v_allow_multiple = false AND NEW.quantity > 1 THEN
    RAISE EXCEPTION 'Multiple tickets are not allowed for this event. Set quantity to 1.';
  END IF;
  
  RAISE NOTICE '[TRIGGER validate_quantity] Validation passed';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trigger_validate_registration_quantity
  BEFORE INSERT OR UPDATE OF quantity ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION validate_registration_quantity();

-- Set function owner to postgres if possible
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER FUNCTION validate_registration_quantity() OWNER TO postgres;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not set trigger function owner to postgres';
END $$;

COMMENT ON FUNCTION validate_registration_quantity IS 'Validates that quantity > 1 is only allowed if event.allow_multiple_tickets = true. Uses SECURITY DEFINER and EXECUTE to bypass RLS.';

DO $$ BEGIN RAISE NOTICE 'Migration 126 Complete: Fixed validate_registration_quantity trigger to bypass RLS.'; END $$;

