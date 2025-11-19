-- Migration 124: Fix trigger function to use SECURITY DEFINER to bypass RLS
-- Date: Nov 19, 2025
-- Purpose: Trigger function set_registration_price_from_event() applies RLS when selecting from events table

-- Drop and recreate trigger function with SECURITY DEFINER
DROP TRIGGER IF EXISTS trigger_set_registration_price ON event_registrations;
DROP FUNCTION IF EXISTS set_registration_price_from_event();

CREATE OR REPLACE FUNCTION set_registration_price_from_event()
RETURNS TRIGGER AS $$
DECLARE
  v_default_price DECIMAL(10,2);
  v_requires_payment BOOLEAN;
BEGIN
  -- If event requires payment and no price is set, use default_price
  IF NEW.price IS NULL THEN
    -- Get event payment info using EXECUTE to bypass RLS
    -- SECURITY DEFINER ensures this runs with function owner privileges
    EXECUTE format('SELECT default_price, requires_payment FROM %I.events WHERE id = $1', 'public')
      INTO v_default_price, v_requires_payment
      USING NEW.event_id;
    
    -- If event requires payment, set price from default_price
    IF v_requires_payment = true AND v_default_price IS NOT NULL THEN
      NEW.price := v_default_price;
      NEW.payment_status := 'pending';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trigger_set_registration_price
  BEFORE INSERT ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION set_registration_price_from_event();

-- Set function owner to postgres if possible
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER FUNCTION set_registration_price_from_event() OWNER TO postgres;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not set trigger function owner to postgres';
END $$;

COMMENT ON FUNCTION set_registration_price_from_event IS 'Auto-set price from event default_price on registration if event requires payment. Uses SECURITY DEFINER to bypass RLS.';

DO $$ BEGIN RAISE NOTICE 'Migration 124 Complete: Fixed trigger function to bypass RLS.'; END $$;

