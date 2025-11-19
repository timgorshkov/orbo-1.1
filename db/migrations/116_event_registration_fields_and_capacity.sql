-- Migration 116: Event Registration Fields, Capacity by Paid, and Quantity
-- Date: Nov 19, 2025
-- Purpose: Add custom registration fields, capacity counting by paid registrations, and quantity support

-- ============================================
-- STEP 1: Add capacity_count_by_paid flag to events
-- ============================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS capacity_count_by_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS show_participants_list BOOLEAN DEFAULT true;

COMMENT ON COLUMN events.capacity_count_by_paid IS 'If true, capacity limit counts only paid registrations. If false, counts all registered.';
COMMENT ON COLUMN events.show_participants_list IS 'Whether to show list of registered participants on event page';

-- ============================================
-- STEP 2: Create event_registration_fields table
-- ============================================

CREATE TABLE IF NOT EXISTS event_registration_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  field_label TEXT NOT NULL,
  field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('text', 'email', 'phone', 'textarea', 'select', 'checkbox')),
  required BOOLEAN DEFAULT false,
  field_order INTEGER DEFAULT 0,
  participant_field_mapping VARCHAR(100), -- Maps to participant field: 'full_name', 'email', 'phone', 'bio', or 'custom_attributes.{key}'
  options JSONB, -- For select/checkbox fields: {"options": ["Option 1", "Option 2"]}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, field_key)
);

CREATE INDEX idx_event_registration_fields_event_id ON event_registration_fields(event_id);
CREATE INDEX idx_event_registration_fields_order ON event_registration_fields(event_id, field_order);

COMMENT ON TABLE event_registration_fields IS 'Custom fields for event registration forms';
COMMENT ON COLUMN event_registration_fields.field_key IS 'Internal key (e.g., "full_name", "phone", "company")';
COMMENT ON COLUMN event_registration_fields.field_label IS 'Display label for the field';
COMMENT ON COLUMN event_registration_fields.field_type IS 'Input type: text, email, phone, textarea, select, checkbox';
COMMENT ON COLUMN event_registration_fields.participant_field_mapping IS 'Which participant field to update: full_name, email, phone, bio, or custom_attributes.{key}';

-- ============================================
-- STEP 3: Add registration_data JSONB to event_registrations
-- ============================================

ALTER TABLE event_registrations
ADD COLUMN IF NOT EXISTS registration_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 5);
-- Note: promo_code_id will be added in migration 117 when event_promo_codes table is created

CREATE INDEX idx_event_registrations_registration_data ON event_registrations USING gin(registration_data);

COMMENT ON COLUMN event_registrations.registration_data IS 'Custom field values collected during registration: {"full_name": "Иван Иванов", "phone": "+7..."}';
COMMENT ON COLUMN event_registrations.quantity IS 'Number of tickets/participants (1-5)';
COMMENT ON COLUMN event_registrations.promo_code_id IS 'Promo code used for this registration';

-- ============================================
-- STEP 4: Create function to update participant profile from registration data
-- ============================================

CREATE OR REPLACE FUNCTION update_participant_from_registration_data()
RETURNS TRIGGER AS $$
DECLARE
  field_mapping RECORD;
  field_value TEXT;
  participant_record RECORD;
BEGIN
  -- Only process if registration_data exists and has values
  IF NEW.registration_data IS NULL OR jsonb_object_keys(NEW.registration_data) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get participant record
  SELECT * INTO participant_record
  FROM participants
  WHERE id = NEW.participant_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Process each field in registration_data
  FOR field_mapping IN
    SELECT field_key, participant_field_mapping
    FROM event_registration_fields
    WHERE event_id = NEW.event_id
      AND participant_field_mapping IS NOT NULL
  LOOP
    -- Get value from registration_data
    field_value := NEW.registration_data->>field_mapping.field_key;

    -- Skip if value is empty or null
    IF field_value IS NULL OR field_value = '' THEN
      CONTINUE;
    END IF;

    -- Update participant field based on mapping
    CASE field_mapping.participant_field_mapping
      WHEN 'full_name' THEN
        -- Only update if participant.full_name is empty
        IF participant_record.full_name IS NULL OR participant_record.full_name = '' THEN
          UPDATE participants
          SET full_name = field_value
          WHERE id = NEW.participant_id;
        END IF;
      
      WHEN 'email' THEN
        -- Only update if participant.email is empty
        IF participant_record.email IS NULL OR participant_record.email = '' THEN
          UPDATE participants
          SET email = field_value
          WHERE id = NEW.participant_id;
        END IF;
      
      WHEN 'phone' THEN
        -- Only update if participant.phone is empty
        IF participant_record.phone IS NULL OR participant_record.phone = '' THEN
          UPDATE participants
          SET phone = field_value
          WHERE id = NEW.participant_id;
        END IF;
      
      WHEN 'bio' THEN
        -- Only update if participant.bio is empty
        IF participant_record.bio IS NULL OR participant_record.bio = '' THEN
          UPDATE participants
          SET bio = LEFT(field_value, 60) -- Enforce 60 char limit
          WHERE id = NEW.participant_id;
        END IF;
      
      ELSE
        -- Custom attribute: format is 'custom_attributes.{key}'
        IF field_mapping.participant_field_mapping LIKE 'custom_attributes.%' THEN
          DECLARE
            attr_key TEXT := SUBSTRING(field_mapping.participant_field_mapping FROM 'custom_attributes\.(.+)');
            current_attrs JSONB := COALESCE(participant_record.custom_attributes, '{}'::jsonb);
          BEGIN
            -- Only update if attribute doesn't exist or is empty
            IF current_attrs->>attr_key IS NULL OR current_attrs->>attr_key = '' THEN
              UPDATE participants
              SET custom_attributes = jsonb_set(
                COALESCE(custom_attributes, '{}'::jsonb),
                ARRAY[attr_key],
                to_jsonb(field_value)
              )
              WHERE id = NEW.participant_id;
            END IF;
          END;
        END IF;
    END CASE;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update participant profile after registration
CREATE TRIGGER trigger_update_participant_from_registration
  AFTER INSERT OR UPDATE OF registration_data ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_participant_from_registration_data();

COMMENT ON FUNCTION update_participant_from_registration_data IS 'Updates participant profile fields from registration_data, only if field is empty';

-- ============================================
-- STEP 5: Create helper function to count paid registrations for capacity check
-- ============================================

CREATE OR REPLACE FUNCTION get_event_registered_count(event_uuid UUID, count_by_paid BOOLEAN DEFAULT false)
RETURNS INTEGER AS $$
DECLARE
  result_count INTEGER;
BEGIN
  IF count_by_paid THEN
    -- Count only paid registrations (considering quantity)
    SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO result_count
    FROM event_registrations
    WHERE event_id = event_uuid
      AND status = 'registered'
      AND payment_status = 'paid';
  ELSE
    -- Count all registered (considering quantity)
    SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO result_count
    FROM event_registrations
    WHERE event_id = event_uuid
      AND status = 'registered';
  END IF;
  
  RETURN result_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_event_registered_count IS 'Returns count of registered participants for an event, optionally counting only paid registrations. Includes quantity multiplier.';

-- ============================================
-- STEP 6: RLS Policies for event_registration_fields
-- ============================================

-- Admins can manage registration fields
CREATE POLICY "Admins can manage registration fields"
  ON event_registration_fields
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      INNER JOIN memberships m ON m.org_id = e.org_id
      WHERE e.id = event_registration_fields.event_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- Anyone can read registration fields for published events
CREATE POLICY "Anyone can read registration fields for published events"
  ON event_registration_fields
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = event_registration_fields.event_id
        AND events.status = 'published'
    )
  );

DO $$ BEGIN RAISE NOTICE 'Migration 116 Complete: Event registration fields, capacity by paid, and quantity support added.'; END $$;

