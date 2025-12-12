-- Migration 144: Add map_link field for offline events
-- Date: Dec 11, 2025
-- Purpose: Allow offline events to have a separate map link

ALTER TABLE events ADD COLUMN IF NOT EXISTS map_link TEXT;

COMMENT ON COLUMN events.map_link IS 'Link to location on map (for offline events)';

DO $$ BEGIN RAISE NOTICE 'Migration 144 Complete: Added map_link column to events'; END $$;

