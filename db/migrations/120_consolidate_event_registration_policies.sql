-- Migration 120: Consolidate and fix all event_registrations RLS policies
-- Date: Nov 19, 2025
-- Purpose: Drop ALL existing policies and recreate them correctly to fix "argument of OR must not return a set"

-- ============================================
-- STEP 1: Drop ALL existing policies
-- ============================================

DROP POLICY IF EXISTS "Users can view registrations for accessible events" ON public.event_registrations;
DROP POLICY IF EXISTS "Users can register for events" ON public.event_registrations;
DROP POLICY IF EXISTS "Users can cancel their registrations" ON public.event_registrations;
DROP POLICY IF EXISTS "Admins can update payment info" ON public.event_registrations;

-- ============================================
-- STEP 2: Recreate SELECT policy (for viewing registrations)
-- ============================================

CREATE POLICY "Users can view registrations for accessible events"
  ON public.event_registrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_registrations.event_id
        AND (
          -- User is a member of the organization
          EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.user_id = auth.uid()
              AND m.org_id = e.org_id
          )
          -- OR event is published and public
          OR (e.status = 'published' AND e.is_public = true)
        )
    )
  );

COMMENT ON POLICY "Users can view registrations for accessible events" ON public.event_registrations IS 
'Allows users to view registrations for events they have access to (org members or public published events)';

-- ============================================
-- STEP 3: Recreate INSERT policy (for registration)
-- ============================================

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

-- ============================================
-- STEP 4: Recreate UPDATE policy (for cancellation and status changes)
-- ============================================

CREATE POLICY "Users can update their registrations"
  ON public.event_registrations
  FOR UPDATE
  USING (
    -- Users can update their own registrations
    EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.id = event_registrations.participant_id
    )
    -- OR admins can update any registration
    OR EXISTS (
      SELECT 1
      FROM public.events e
      INNER JOIN public.memberships m ON m.org_id = e.org_id
      WHERE e.id = event_registrations.event_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

COMMENT ON POLICY "Users can update their registrations" ON public.event_registrations IS 
'Allows users to update their own registrations, and admins to update any registration in their org';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$ 
DECLARE
  policy_count INTEGER;
BEGIN
  -- Count policies for event_registrations
  SELECT COUNT(*) INTO policy_count
  FROM pg_policy
  WHERE polrelid = 'event_registrations'::regclass;
  
  RAISE NOTICE 'Migration 120 Complete: Consolidated event_registrations RLS policies. Total policies: %', policy_count;
END $$;

