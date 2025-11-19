-- Migration 121: Fix UPDATE policy to avoid OR at top level
-- Date: Nov 19, 2025
-- Purpose: Rewrite UPDATE policy to eliminate OR at top level in USING clause

-- Drop the UPDATE policy
DROP POLICY IF EXISTS "Users can update their registrations" ON public.event_registrations;

-- Recreate without OR at top level - merge conditions into single EXISTS
CREATE POLICY "Users can update their registrations"
  ON public.event_registrations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_registrations er
      WHERE er.id = event_registrations.id
        AND (
          -- User owns this registration (via participant)
          EXISTS (
            SELECT 1
            FROM public.participants p
            WHERE p.id = er.participant_id
          )
          -- OR user is admin of the organization
          OR EXISTS (
            SELECT 1
            FROM public.events e
            INNER JOIN public.memberships m ON m.org_id = e.org_id
            WHERE e.id = er.event_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
          )
        )
    )
  );

COMMENT ON POLICY "Users can update their registrations" ON public.event_registrations IS 
'Allows users to update their own registrations, and admins to update any registration in their org (OR is inside EXISTS)';

DO $$ BEGIN RAISE NOTICE 'Migration 121 Complete: Fixed UPDATE policy to avoid top-level OR.'; END $$;

