-- Migration 132: Fix trigger back to use 'phone' instead of 'phone_number'
-- Date: Nov 21, 2025
-- Purpose: Table participants uses 'phone' column, not 'phone_number'

-- Drop and recreate the trigger function
DROP TRIGGER IF EXISTS trigger_update_participant_from_registration ON event_registrations;
DROP FUNCTION IF EXISTS update_participant_from_registration_data();

CREATE OR REPLACE FUNCTION update_participant_from_registration_data()
RETURNS TRIGGER AS $$
DECLARE
  field_key_var TEXT;
  field_mapping_var TEXT;
  field_value TEXT;
  participant_full_name TEXT;
  participant_email TEXT;
  participant_phone TEXT;
  participant_bio TEXT;
  participant_custom_attrs JSONB;
  attr_key TEXT;
BEGIN
  RAISE NOTICE '[TRIGGER update_participant] Starting for participant % and event %', NEW.participant_id, NEW.event_id;
  
  -- Only process if registration_data exists and is not empty
  IF NEW.registration_data IS NULL OR NEW.registration_data = '{}'::jsonb THEN
    RAISE NOTICE '[TRIGGER update_participant] No registration_data, skipping';
    RETURN NEW;
  END IF;

  -- Get participant record using EXECUTE to bypass RLS
  RAISE NOTICE '[TRIGGER update_participant] Fetching participant data';
  EXECUTE format('SELECT full_name, email, phone, bio, custom_attributes FROM %I.participants WHERE id = $1', 'public')
    INTO participant_full_name, participant_email, participant_phone, participant_bio, participant_custom_attrs
    USING NEW.participant_id;

  IF NOT FOUND THEN
    RAISE NOTICE '[TRIGGER update_participant] Participant not found, skipping';
    RETURN NEW;
  END IF;
  
  RAISE NOTICE '[TRIGGER update_participant] Participant found, processing fields';

  -- Process each field in registration_data
  -- Get field mappings using EXECUTE to bypass RLS
  FOR field_key_var, field_mapping_var IN
    EXECUTE format('SELECT field_key, participant_field_mapping FROM %I.event_registration_fields WHERE event_id = $1 AND participant_field_mapping IS NOT NULL', 'public')
    USING NEW.event_id
  LOOP
    RAISE NOTICE '[TRIGGER update_participant] Processing field: % -> %', field_key_var, field_mapping_var;
    
    -- Get value from registration_data
    field_value := NEW.registration_data->>field_key_var;

    -- Skip if value is empty or null
    IF field_value IS NULL OR field_value = '' THEN
      CONTINUE;
    END IF;

    -- Update participant field based on mapping using EXECUTE to bypass RLS
    -- Only update if participant field is NULL or empty (don't overwrite existing values)
    CASE field_mapping_var
      WHEN 'full_name' THEN
        -- Only update if participant.full_name is empty
        IF participant_full_name IS NULL OR participant_full_name = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating full_name to %', field_value;
          EXECUTE format('UPDATE %I.participants SET full_name = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'email' THEN
        -- Only update if participant.email is empty
        IF participant_email IS NULL OR participant_email = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating email to %', field_value;
          EXECUTE format('UPDATE %I.participants SET email = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'phone_number' THEN
        -- Support phone_number mapping, but update 'phone' column
        -- Only update if participant.phone is empty
        IF participant_phone IS NULL OR participant_phone = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating phone to %', field_value;
          EXECUTE format('UPDATE %I.participants SET phone = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'phone' THEN
        -- Support phone mapping, update 'phone' column
        -- Only update if participant.phone is empty
        IF participant_phone IS NULL OR participant_phone = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating phone to %', field_value;
          EXECUTE format('UPDATE %I.participants SET phone = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'bio' THEN
        -- Only update if participant.bio is empty
        IF participant_bio IS NULL OR participant_bio = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating bio to %', LEFT(field_value, 60);
          EXECUTE format('UPDATE %I.participants SET bio = $1 WHERE id = $2', 'public')
            USING LEFT(field_value, 60), NEW.participant_id;
        END IF;

      ELSE
        -- Custom attribute: format is 'custom_attributes.{key}'
        IF field_mapping_var LIKE 'custom_attributes.%' THEN
          attr_key := SUBSTRING(field_mapping_var FROM 'custom_attributes\.(.+)');
          
          -- Only update if attribute doesn't exist or is empty
          IF COALESCE(participant_custom_attrs, '{}'::jsonb)->>attr_key IS NULL OR 
             COALESCE(participant_custom_attrs, '{}'::jsonb)->>attr_key = '' THEN
            RAISE NOTICE '[TRIGGER update_participant] Updating custom_attributes.% to %', attr_key, field_value;
            EXECUTE format('UPDATE %I.participants SET custom_attributes = jsonb_set(COALESCE(custom_attributes, $1), $2, $3) WHERE id = $4', 'public')
              USING '{}'::jsonb, ARRAY[attr_key], to_jsonb(field_value), NEW.participant_id;
          END IF;
        END IF;
    END CASE;
  END LOOP;

  RAISE NOTICE '[TRIGGER update_participant] Complete';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trigger_update_participant_from_registration
  AFTER INSERT OR UPDATE OF registration_data ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_participant_from_registration_data();

-- Set function owner to postgres if possible
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER FUNCTION update_participant_from_registration_data() OWNER TO postgres;
    RAISE NOTICE 'Function update_participant_from_registration_data owner set to postgres.';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not set trigger function owner to postgres';
END $$;

COMMENT ON FUNCTION update_participant_from_registration_data IS 'Updates participant profile from registration data. Uses SECURITY DEFINER and EXECUTE to bypass RLS. Only updates fields if they are NULL or empty (does not overwrite existing values). Uses phone column (not phone_number). Supports both phone_number and phone mappings.';

DO $$ BEGIN RAISE NOTICE 'Migration 132 Complete: Fixed trigger to use phone column instead of phone_number.'; END $$;

