-- Migration 115: Fix registration price trigger
-- Date: Nov 18, 2025
-- Purpose: Fix bug in set_registration_price_from_event() that was writing boolean to decimal field

-- Drop old trigger and function
DROP TRIGGER IF EXISTS trigger_set_registration_price ON event_registrations;
DROP FUNCTION IF EXISTS set_registration_price_from_event();

-- Create corrected function
CREATE OR REPLACE FUNCTION set_registration_price_from_event()
RETURNS TRIGGER AS $$
DECLARE
  v_default_price DECIMAL(10,2);
  v_requires_payment BOOLEAN;
BEGIN
  -- If event requires payment and no price is set, use default_price
  IF NEW.price IS NULL THEN
    -- Get event payment info
    SELECT default_price, requires_payment
    INTO v_default_price, v_requires_payment
    FROM events
    WHERE id = NEW.event_id;
    
    -- If event requires payment, set price from default_price
    IF v_requires_payment = true AND v_default_price IS NOT NULL THEN
      NEW.price := v_default_price;
      NEW.payment_status := 'pending';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trigger_set_registration_price
  BEFORE INSERT ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION set_registration_price_from_event();

COMMENT ON FUNCTION set_registration_price_from_event IS 'Auto-set price from event default_price on registration if event requires payment';

DO $$ BEGIN RAISE NOTICE 'Migration 115 Complete: Fixed registration price trigger.'; END $$;

