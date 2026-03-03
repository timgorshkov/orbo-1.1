-- Migration 236: Add max_miniapp to event_registrations registration_source allowed values
-- Extends the check constraint to allow MAX MiniApp registrations

ALTER TABLE event_registrations
DROP CONSTRAINT IF EXISTS event_registrations_registration_source_check;

ALTER TABLE event_registrations
ADD CONSTRAINT event_registrations_registration_source_check
CHECK (registration_source IN ('web', 'telegram', 'telegram_miniapp', 'admin', 'import', 'max_miniapp'));
