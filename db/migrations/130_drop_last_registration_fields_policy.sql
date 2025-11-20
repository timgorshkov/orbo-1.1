-- Migration 130: Drop last remaining policy on event_registration_fields
-- Date: Nov 19, 2025
-- Purpose: event_registration_fields still has one policy that might cause issues

DROP POLICY IF EXISTS "Anyone can read registration fields for published events" ON public.event_registration_fields;

-- Ensure RLS is disabled
ALTER TABLE public.event_registration_fields DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.event_registration_fields IS 
'RLS disabled. All policies removed. Access control via API and SECURITY DEFINER triggers.';

DO $$ BEGIN RAISE NOTICE 'Migration 130 Complete: Dropped last policy on event_registration_fields.'; END $$;

