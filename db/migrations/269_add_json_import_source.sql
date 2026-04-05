-- Add json_import as allowed import_source for activity_events
ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_import_source_check;
ALTER TABLE activity_events ADD CONSTRAINT activity_events_import_source_check
  CHECK (import_source = ANY (ARRAY['webhook', 'html_import', 'json_import', 'manual']));
