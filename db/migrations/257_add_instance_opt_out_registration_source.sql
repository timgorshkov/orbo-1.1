-- Migration 257: Add instance_opt_out to event_registrations registration_source allowed values
-- Used when a participant in a recurring series opts out of a specific instance

ALTER TABLE event_registrations
DROP CONSTRAINT IF EXISTS event_registrations_registration_source_check;

ALTER TABLE event_registrations
ADD CONSTRAINT event_registrations_registration_source_check
CHECK (registration_source IN ('web', 'telegram', 'telegram_miniapp', 'admin', 'import', 'max_miniapp', 'instance_opt_out'));
