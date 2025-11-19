-- Migration 122: Split SELECT policy into two separate policies to avoid OR
-- Date: Nov 19, 2025
-- Purpose: Eliminate OR from SELECT policy by creating two separate permissive policies

-- ============================================
-- STEP 1: Drop the existing SELECT policy
-- ============================================

DROP POLICY IF EXISTS "Users can view registrations for accessible events" ON public.event_registrations;

-- ============================================
-- STEP 2: Create two separate SELECT policies (both permissive, so they work as OR)
-- ============================================

-- Policy 1: Organization members can see registrations in their org
CREATE POLICY "Org members can view org registrations"
  ON public.event_registrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      INNER JOIN public.memberships m ON m.org_id = e.org_id
      WHERE e.id = event_registrations.event_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Org members can view org registrations" ON public.event_registrations IS 
'Allows organization members to view registrations for events in their org';

-- Policy 2: Anyone can see registrations for public published events
CREATE POLICY "Public can view public event registrations"
  ON public.event_registrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_registrations.event_id
        AND e.status = 'published'
        AND e.is_public = true
    )
  );

COMMENT ON POLICY "Public can view public event registrations" ON public.event_registrations IS 
'Allows anyone to view registrations for published public events';

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
  
  RAISE NOTICE 'Migration 122 Complete: Split SELECT policy into two separate policies. Total policies: %', policy_count;
END $$;

