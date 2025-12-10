-- Migration 138: Add payment_link field to events
-- For external payment system links (bank, payment processor, etc.)

ALTER TABLE events
ADD COLUMN IF NOT EXISTS payment_link TEXT DEFAULT NULL;

COMMENT ON COLUMN events.payment_link IS 'External payment link URL (bank transfer page, payment processor, etc.)';

DO $$ BEGIN
  RAISE NOTICE 'Migration 138 Complete: Added payment_link field to events table.';
END $$;

