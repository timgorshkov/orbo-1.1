-- Migration 133: Add end_date field to events table
-- Date: Dec 4, 2025
-- Purpose: Support events longer than 1 day or spanning midnight

-- ============================================
-- STEP 1: Add end_date column to events table
-- ============================================

-- Add end_date column (nullable, defaults to event_date for single-day events)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS end_date DATE;

COMMENT ON COLUMN events.end_date IS 'End date for multi-day events. If NULL, event ends on event_date';

-- ============================================
-- STEP 2: Set default end_date for existing events
-- ============================================

-- Set end_date = event_date for all existing events (backward compatibility)
UPDATE events
SET end_date = event_date
WHERE end_date IS NULL;

-- ============================================
-- STEP 3: Add constraint to ensure end_date >= event_date
-- ============================================

-- Add check constraint to ensure end_date is not before event_date
ALTER TABLE events
DROP CONSTRAINT IF EXISTS events_end_date_check;

ALTER TABLE events
ADD CONSTRAINT events_end_date_check 
CHECK (end_date IS NULL OR end_date >= event_date);

COMMENT ON CONSTRAINT events_end_date_check ON events IS 'Ensures end_date is not before event_date';

-- ============================================
-- STEP 4: Update index for better query performance
-- ============================================

-- Add index for queries filtering by end_date
CREATE INDEX IF NOT EXISTS idx_events_end_date ON events(end_date);

-- Add composite index for date range queries
CREATE INDEX IF NOT EXISTS idx_events_date_range ON events(event_date, end_date);

DO $$ BEGIN 
  RAISE NOTICE 'Migration 133 Complete: Added end_date field to events table for multi-day event support.'; 
END $$;

