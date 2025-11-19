-- Migration 123: Create RPC function to register for events (bypasses RLS)
-- Date: Nov 19, 2025
-- Purpose: Use SECURITY DEFINER function to completely bypass RLS for event registration

-- Drop existing function if it exists (needed when changing return type)
DROP FUNCTION IF EXISTS register_for_event(UUID, UUID, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION register_for_event(
  p_event_id UUID,
  p_participant_id UUID,
  p_registration_data JSONB DEFAULT '{}'::jsonb,
  p_quantity INTEGER DEFAULT 1
)
RETURNS TABLE (
  registration_id UUID,
  registration_event_id UUID,
  registration_participant_id UUID,
  registration_status TEXT,
  registration_source TEXT,
  registration_data JSONB,
  registration_quantity INTEGER,
  registration_registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_event_org_id UUID;
  v_registration_id UUID;
  v_registration RECORD;
BEGIN
  -- Disable RLS for this function's execution context
  -- This allows SELECT queries to bypass RLS policies
  PERFORM set_config('role', 'postgres', true);
  
  -- Verify participant and event belong to same organization
  SELECT org_id INTO v_org_id
  FROM public.participants
  WHERE id = p_participant_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;
  
  SELECT org_id INTO v_event_org_id
  FROM public.events
  WHERE id = p_event_id;
  
  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  IF v_org_id != v_event_org_id THEN
    RAISE EXCEPTION 'Participant and event must belong to the same organization';
  END IF;
  
  -- Insert registration (bypasses RLS due to SECURITY DEFINER)
  INSERT INTO public.event_registrations (
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
  RETURNING * INTO v_registration;
  
  -- Return the created registration
  registration_id := v_registration.id;
  registration_event_id := v_registration.event_id;
  registration_participant_id := v_registration.participant_id;
  registration_status := v_registration.status;
  registration_source := v_registration.registration_source;
  registration_data := v_registration.registration_data;
  registration_quantity := v_registration.quantity;
  registration_registered_at := v_registration.registered_at;
  
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION register_for_event IS 'Registers a participant for an event, bypassing RLS policies. Verifies participant and event belong to same organization.';

DO $$ BEGIN RAISE NOTICE 'Migration 123 Complete: Created register_for_event RPC function to bypass RLS.'; END $$;

