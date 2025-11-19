-- Migration 123: Create RPC function to register for events (bypasses RLS)
-- Date: Nov 19, 2025
-- Purpose: Use SECURITY DEFINER function to completely bypass RLS for event registration

CREATE OR REPLACE FUNCTION register_for_event(
  p_event_id UUID,
  p_participant_id UUID,
  p_registration_data JSONB DEFAULT '{}'::jsonb,
  p_quantity INTEGER DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  participant_id UUID,
  status TEXT,
  registration_source TEXT,
  registration_data JSONB,
  quantity INTEGER,
  registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_event_org_id UUID;
  v_registration_id UUID;
BEGIN
  -- Verify participant and event belong to same organization
  SELECT org_id INTO v_org_id
  FROM participants
  WHERE id = p_participant_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;
  
  SELECT org_id INTO v_event_org_id
  FROM events
  WHERE id = p_event_id;
  
  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  IF v_org_id != v_event_org_id THEN
    RAISE EXCEPTION 'Participant and event must belong to the same organization';
  END IF;
  
  -- Insert registration (bypasses RLS due to SECURITY DEFINER)
  INSERT INTO event_registrations (
    event_id,
    participant_id,
    registration_source,
    status,
    registration_data,
    quantity
  )
  VALUES (
    p_event_id,
    p_participant_id,
    'web',
    'registered',
    p_registration_data,
    p_quantity
  )
  RETURNING event_registrations.id INTO v_registration_id;
  
  -- Return the created registration
  RETURN QUERY
  SELECT 
    er.id,
    er.event_id,
    er.participant_id,
    er.status,
    er.registration_source,
    er.registration_data,
    er.quantity,
    er.registered_at
  FROM event_registrations er
  WHERE er.id = v_registration_id;
END;
$$;

COMMENT ON FUNCTION register_for_event IS 'Registers a participant for an event, bypassing RLS policies. Verifies participant and event belong to same organization.';

DO $$ BEGIN RAISE NOTICE 'Migration 123 Complete: Created register_for_event RPC function to bypass RLS.'; END $$;

