-- Migration 117: Fix event_registrations RLS policy for INSERT
-- Date: Nov 19, 2025
-- Purpose: Fix "argument of OR must not return a set" error when registering for events

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can register for events" ON public.event_registrations;

-- Recreate with correct syntax using EXISTS instead of IN
CREATE POLICY "Users can register for events"
  ON public.event_registrations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.participants p
      INNER JOIN public.events e ON e.id = event_registrations.event_id
      WHERE p.id = event_registrations.participant_id
        AND p.org_id = e.org_id
    )
  );

COMMENT ON POLICY "Users can register for events" ON public.event_registrations IS 
'Allows users to register for events if participant belongs to the same organization as the event';

DO $$ BEGIN RAISE NOTICE 'Migration 117 Complete: Fixed event_registrations RLS policy for INSERT.'; END $$;

