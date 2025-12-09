-- Migration 134: Fix events_time_order_check constraint for multi-day events
-- Date: Dec 4, 2025
-- Purpose: Update constraint to allow end_time < start_time when end_date > event_date

-- ============================================
-- STEP 1: Drop old constraint
-- ============================================

ALTER TABLE events
DROP CONSTRAINT IF EXISTS events_time_order_check;

-- ============================================
-- STEP 2: Add new constraint that accounts for end_date
-- ============================================

-- New constraint: end_time > start_time only if end_date is NULL or same as event_date
-- If end_date > event_date, any time is allowed (for events spanning midnight)
ALTER TABLE events
ADD CONSTRAINT events_time_order_check 
CHECK (
  -- If end_date is NULL or same as event_date, end_time must be after start_time
  (end_date IS NULL OR end_date = event_date) AND end_time > start_time
  OR
  -- If end_date > event_date, any time is allowed (multi-day event)
  (end_date IS NOT NULL AND end_date > event_date)
);

COMMENT ON CONSTRAINT events_time_order_check ON events IS 
'Ensures end_time > start_time for single-day events. Allows any time for multi-day events (end_date > event_date).';

DO $$ BEGIN 
  RAISE NOTICE 'Migration 134 Complete: Updated events_time_order_check constraint to support multi-day events.'; 
END $$;

