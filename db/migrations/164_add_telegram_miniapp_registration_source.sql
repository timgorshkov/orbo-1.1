-- Migration: Add telegram_miniapp to registration_source allowed values
-- Date: 2025-12-20

-- Drop the existing check constraint
ALTER TABLE event_registrations 
DROP CONSTRAINT IF EXISTS event_registrations_registration_source_check;

-- Add updated check constraint with telegram_miniapp
ALTER TABLE event_registrations 
ADD CONSTRAINT event_registrations_registration_source_check 
CHECK (registration_source IN ('web', 'telegram', 'telegram_miniapp', 'admin', 'import'));

