-- Migration 137: Add registration_fields_config to events
-- This JSONB field stores detailed configuration for each registration field

ALTER TABLE events
ADD COLUMN IF NOT EXISTS registration_fields_config JSONB DEFAULT NULL;

COMMENT ON COLUMN events.registration_fields_config IS 'Configuration for registration form fields. Structure: { field_key: { status: "required"|"optional"|"disabled", label?: string } }';

-- Backfill from existing event_registration_fields
-- Convert existing registration fields to the new config format
UPDATE events e
SET registration_fields_config = (
  SELECT jsonb_object_agg(
    erf.field_key,
    jsonb_build_object(
      'status', CASE WHEN erf.required THEN 'required' ELSE 'optional' END,
      'label', erf.field_label
    )
  )
  FROM event_registration_fields erf
  WHERE erf.event_id = e.id
)
WHERE EXISTS (
  SELECT 1 FROM event_registration_fields erf 
  WHERE erf.event_id = e.id
);

DO $$ BEGIN
  RAISE NOTICE 'Migration 137 Complete: Added registration_fields_config JSONB to events table.';
END $$;

