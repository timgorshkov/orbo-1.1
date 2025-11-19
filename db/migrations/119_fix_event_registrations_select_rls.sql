-- Migration 119: Fix event_registrations SELECT RLS policy
-- Date: Nov 19, 2025
-- Purpose: Fix "argument of OR must not return a set" error in SELECT policy

-- Drop the problematic SELECT policy
DROP POLICY IF EXISTS "Users can view registrations for accessible events" ON public.event_registrations;

-- Recreate with correct syntax using EXISTS instead of IN with OR
CREATE POLICY "Users can view registrations for accessible events"
  ON public.event_registrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_registrations.event_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.org_id = e.org_id
          )
          OR (e.status = 'published' AND e.is_public = true)
        )
    )
  );

COMMENT ON POLICY "Users can view registrations for accessible events" ON public.event_registrations IS 
'Allows users to view registrations for events they have access to (org members or public published events)';

DO $$ BEGIN RAISE NOTICE 'Migration 119 Complete: Fixed event_registrations SELECT RLS policy.'; END $$;

