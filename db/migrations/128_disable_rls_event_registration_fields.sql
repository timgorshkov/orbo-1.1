-- Migration 128: Disable RLS for event_registration_fields and drop policies
-- Date: Nov 19, 2025
-- Purpose: event_registration_fields has RLS disabled but policies still exist
--          This can cause "argument of OR must not return a set" during query planning

-- Drop all policies on event_registration_fields
DROP POLICY IF EXISTS "Admins can manage registration fields" ON public.event_registration_fields;
DROP POLICY IF EXISTS "Users can view registration fields for accessible events" ON public.event_registration_fields;
DROP POLICY IF EXISTS "Admins can create registration fields" ON public.event_registration_fields;
DROP POLICY IF EXISTS "Admins can update registration fields" ON public.event_registration_fields;
DROP POLICY IF EXISTS "Admins can delete registration fields" ON public.event_registration_fields;

-- Ensure RLS is disabled (should already be, but let's be explicit)
ALTER TABLE public.event_registration_fields DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.event_registration_fields IS 
'RLS disabled. Access control handled by API logic and SECURITY DEFINER triggers.';

DO $$ BEGIN RAISE NOTICE 'Migration 128 Complete: Disabled RLS and dropped policies for event_registration_fields.'; END $$;

