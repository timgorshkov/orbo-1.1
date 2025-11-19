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
  -- SECURITY DEFINER functions run with the privileges of the function owner
  -- If RLS is still applied, we need to use direct SQL execution
  -- Verify participant and event belong to same organization using direct SQL
  EXECUTE format('SELECT org_id FROM %I.participants WHERE id = $1', 'public')
    INTO v_org_id
    USING p_participant_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;
  
  EXECUTE format('SELECT org_id FROM %I.events WHERE id = $1', 'public')
    INTO v_event_org_id
    USING p_event_id;
  
  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  IF v_org_id != v_event_org_id THEN
    RAISE EXCEPTION 'Participant and event must belong to the same organization';
  END IF;
  
  -- Insert registration using EXECUTE to bypass RLS
  EXECUTE format('
    INSERT INTO %I.event_registrations (
      event_id,
      participant_id,
      registration_source,
      status,
      registration_data,
      quantity
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *',
    'public'
  )
  INTO v_registration
  USING p_event_id, p_participant_id, 'web', 'registered', p_registration_data, p_quantity;
  
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

-- Set function owner to postgres (superuser) to ensure RLS is bypassed
-- This is required because SECURITY DEFINER functions still apply RLS unless owner is superuser
DO $$
BEGIN
  -- Try to set owner to postgres if it exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER FUNCTION register_for_event(UUID, UUID, JSONB, INTEGER) OWNER TO postgres;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    -- If we can't change owner, function will still work but RLS may apply
    RAISE NOTICE 'Could not set function owner to postgres - RLS may still apply';
END $$;

DO $$ BEGIN RAISE NOTICE 'Migration 123 Complete: Created register_for_event RPC function to bypass RLS.'; END $$;

