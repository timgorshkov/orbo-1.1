-- Migration 113: Event Payments
-- Date: Nov 18, 2025
-- Purpose: Add payment tracking for events with individual pricing per participant

-- ============================================
-- STEP 1: Add payment fields to events table
-- ============================================

-- Add payment configuration fields to events
ALTER TABLE events
ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'RUB' CHECK (currency IN ('RUB', 'USD', 'EUR', 'KZT', 'BYN')),
ADD COLUMN IF NOT EXISTS payment_deadline_days INTEGER DEFAULT 3 CHECK (payment_deadline_days >= 0),
ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

COMMENT ON COLUMN events.requires_payment IS 'Whether this event requires payment';
COMMENT ON COLUMN events.default_price IS 'Default price for registration (can be overridden per participant)';
COMMENT ON COLUMN events.currency IS 'Currency code (ISO 4217)';
COMMENT ON COLUMN events.payment_deadline_days IS 'Days before event when payment is due (default 3)';
COMMENT ON COLUMN events.payment_instructions IS 'Payment instructions for participants (bank details, etc.)';

-- ============================================
-- STEP 2: Add payment fields to event_registrations
-- ============================================

-- Add individual payment tracking fields to registrations
ALTER TABLE event_registrations
ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending' CHECK (
  payment_status IN ('pending', 'paid', 'partially_paid', 'overdue', 'cancelled', 'refunded')
),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_notes TEXT,
ADD COLUMN IF NOT EXISTS payment_updated_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS payment_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN event_registrations.price IS 'Individual price for this participant (may differ from default_price)';
COMMENT ON COLUMN event_registrations.payment_status IS 'Payment status: pending, paid, partially_paid, overdue, cancelled, refunded';
COMMENT ON COLUMN event_registrations.payment_method IS 'Payment method: bank_transfer, cash, card, online, other';
COMMENT ON COLUMN event_registrations.paid_at IS 'When payment was received';
COMMENT ON COLUMN event_registrations.paid_amount IS 'Amount actually paid (for partial payments)';
COMMENT ON COLUMN event_registrations.payment_notes IS 'Admin notes about payment (transaction ID, comments, etc.)';
COMMENT ON COLUMN event_registrations.payment_updated_by IS 'User who last updated payment status';
COMMENT ON COLUMN event_registrations.payment_updated_at IS 'When payment status was last updated';

-- ============================================
-- STEP 3: Create indexes for performance
-- ============================================

-- Index for finding paid events
CREATE INDEX IF NOT EXISTS idx_events_requires_payment 
ON events(requires_payment) 
WHERE requires_payment = true;

-- Index for payment status queries
CREATE INDEX IF NOT EXISTS idx_event_registrations_payment_status 
ON event_registrations(event_id, payment_status);

-- Index for overdue payments (events in the past with unpaid registrations)
CREATE INDEX IF NOT EXISTS idx_event_registrations_overdue 
ON event_registrations(event_id, payment_status) 
WHERE payment_status IN ('pending', 'overdue');

-- ============================================
-- STEP 4: Create trigger to auto-set price on registration
-- ============================================

-- Function to auto-set price from event's default_price when registering
CREATE OR REPLACE FUNCTION set_registration_price_from_event()
RETURNS TRIGGER AS $$
BEGIN
  -- If event requires payment and no price is set, use default_price
  IF NEW.price IS NULL THEN
    SELECT default_price, requires_payment
    INTO NEW.price, NEW.price  -- dummy assignment to check
    FROM events
    WHERE id = NEW.event_id AND requires_payment = true;
    
    -- Set initial payment status
    IF NEW.price IS NOT NULL AND NEW.price > 0 THEN
      NEW.payment_status := 'pending';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set price on insert
DROP TRIGGER IF EXISTS trigger_set_registration_price ON event_registrations;
CREATE TRIGGER trigger_set_registration_price
  BEFORE INSERT ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION set_registration_price_from_event();

-- ============================================
-- STEP 5: Create helper function to get payment stats
-- ============================================

CREATE OR REPLACE FUNCTION get_event_payment_stats(p_event_id UUID)
RETURNS TABLE (
  total_registrations BIGINT,
  total_expected_amount DECIMAL,
  total_paid_amount DECIMAL,
  paid_count BIGINT,
  pending_count BIGINT,
  overdue_count BIGINT,
  payment_completion_percent INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_registrations,
    COALESCE(SUM(er.price), 0) AS total_expected_amount,
    COALESCE(SUM(er.paid_amount), 0) AS total_paid_amount,
    COUNT(*) FILTER (WHERE er.payment_status = 'paid')::BIGINT AS paid_count,
    COUNT(*) FILTER (WHERE er.payment_status = 'pending')::BIGINT AS pending_count,
    COUNT(*) FILTER (WHERE er.payment_status = 'overdue')::BIGINT AS overdue_count,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE er.payment_status = 'paid')::DECIMAL / COUNT(*)) * 100)::INTEGER
      ELSE 0
    END AS payment_completion_percent
  FROM event_registrations er
  WHERE er.event_id = p_event_id
    AND er.status != 'cancelled'
    AND er.price IS NOT NULL
    AND er.price > 0;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_event_payment_stats IS 'Get payment statistics for an event';

-- ============================================
-- STEP 6: Create function to mark payment as overdue
-- ============================================

CREATE OR REPLACE FUNCTION mark_overdue_payments()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Mark payments as overdue if:
  -- 1. Status is 'pending'
  -- 2. Event date has passed OR payment deadline has passed
  WITH overdue_registrations AS (
    UPDATE event_registrations er
    SET 
      payment_status = 'overdue',
      payment_updated_at = NOW()
    FROM events e
    WHERE er.event_id = e.id
      AND er.payment_status = 'pending'
      AND er.price IS NOT NULL
      AND er.price > 0
      AND (
        -- Event has already happened
        e.event_date < CURRENT_DATE
        OR
        -- Payment deadline has passed (event_date - payment_deadline_days)
        (e.event_date - INTERVAL '1 day' * COALESCE(e.payment_deadline_days, 3)) < CURRENT_DATE
      )
    RETURNING er.id
  )
  SELECT COUNT(*)::INTEGER INTO updated_count FROM overdue_registrations;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_overdue_payments IS 'Mark pending payments as overdue if deadline passed. Returns count of updated records.';

-- ============================================
-- STEP 7: Update RLS policies (if needed)
-- ============================================

-- Event registrations are already protected by existing RLS
-- Payment fields follow the same access rules:
-- - Participants can see their own registration (including price/payment_status)
-- - Admins can see and modify all registrations

-- Add explicit policy for payment updates (admin only)
DROP POLICY IF EXISTS "Admins can update payment info" ON event_registrations;
CREATE POLICY "Admins can update payment info"
  ON event_registrations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 
      FROM events e
      INNER JOIN memberships m ON m.org_id = e.org_id
      WHERE e.id = event_registrations.event_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- STEP 8: Sample data update (optional, for testing)
-- ============================================

-- Uncomment to set existing events as free (requires_payment = false is already default)
-- UPDATE events SET requires_payment = false WHERE requires_payment IS NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 113 Complete: Event payment tracking added with individual pricing.'; END $$;

