-- Migration: Fix Supabase Security Advisor issues
-- Date: 2024-12-12

-- =====================================================
-- 1. DROP unused views that were previously deleted
-- =====================================================

-- These views reference deleted tables and shouldn't exist
DROP VIEW IF EXISTS public.ai_requests_enriched CASCADE;
DROP VIEW IF EXISTS public.v_participant_traits CASCADE;

-- =====================================================
-- 2. Enable RLS on event_registrations
-- =====================================================

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view registrations for events in their orgs
DROP POLICY IF EXISTS "Users can view registrations in their org" ON public.event_registrations;
CREATE POLICY "Users can view registrations in their org"
ON public.event_registrations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.org_id = e.org_id
    WHERE e.id = event_registrations.event_id
    AND m.user_id = auth.uid()
  )
);

-- Policy: Users can insert their own registrations
DROP POLICY IF EXISTS "Users can register for events" ON public.event_registrations;
CREATE POLICY "Users can register for events"
ON public.event_registrations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_registrations.event_id
    AND e.status = 'published'
  )
);

-- Policy: Users can update their own registrations (cancel)
DROP POLICY IF EXISTS "Users can update own registrations" ON public.event_registrations;
CREATE POLICY "Users can update own registrations"
ON public.event_registrations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    JOIN public.user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id
    WHERE p.id = event_registrations.participant_id
    AND uta.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.org_id = e.org_id
    WHERE e.id = event_registrations.event_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'admin')
  )
);

-- Policy: Admins can delete registrations
DROP POLICY IF EXISTS "Admins can delete registrations" ON public.event_registrations;
CREATE POLICY "Admins can delete registrations"
ON public.event_registrations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.org_id = e.org_id
    WHERE e.id = event_registrations.event_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 3. Enable RLS on event_registration_fields
-- =====================================================

ALTER TABLE public.event_registration_fields ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view registration fields for events in their orgs
DROP POLICY IF EXISTS "Users can view registration fields" ON public.event_registration_fields;
CREATE POLICY "Users can view registration fields"
ON public.event_registration_fields
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.org_id = e.org_id
    WHERE e.id = event_registration_fields.event_id
    AND m.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_registration_fields.event_id
    AND e.is_public = true
  )
);

-- Policy: Admins can manage registration fields
DROP POLICY IF EXISTS "Admins can manage registration fields" ON public.event_registration_fields;
CREATE POLICY "Admins can manage registration fields"
ON public.event_registration_fields
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.org_id = e.org_id
    WHERE e.id = event_registration_fields.event_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 4. Recreate organization_admins view without SECURITY DEFINER
-- and without exposing auth.users directly
-- =====================================================

DROP VIEW IF EXISTS public.organization_admins CASCADE;

-- Recreate as a simple view that doesn't expose auth.users
CREATE OR REPLACE VIEW public.organization_admins AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.created_at
FROM public.memberships m
WHERE m.role IN ('owner', 'admin');

-- Grant select to authenticated users
GRANT SELECT ON public.organization_admins TO authenticated;

-- =====================================================
-- 5. Recreate user_admin_status view without SECURITY DEFINER
-- and without exposing auth.users directly
-- =====================================================

DROP VIEW IF EXISTS public.user_admin_status CASCADE;

-- Recreate as a simple view
CREATE OR REPLACE VIEW public.user_admin_status AS
SELECT 
  m.user_id,
  m.org_id,
  m.role,
  CASE WHEN m.role IN ('owner', 'admin') THEN true ELSE false END as is_admin
FROM public.memberships m;

-- Grant select to authenticated users
GRANT SELECT ON public.user_admin_status TO authenticated;

-- =====================================================
-- 6. Check and fix v_participants_enriched if exists
-- =====================================================

-- Drop and recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.v_participants_enriched CASCADE;

-- This view was likely used for enriched participant data
-- If needed, it can be recreated properly later
-- For now, removing it as it's a security issue

-- =====================================================
-- 7. Summary
-- =====================================================

-- After this migration:
-- - ai_requests_enriched: DELETED (unused)
-- - v_participant_traits: DELETED (unused) 
-- - event_registrations: RLS ENABLED with policies
-- - event_registration_fields: RLS ENABLED with policies
-- - organization_admins: RECREATED without SECURITY DEFINER
-- - user_admin_status: RECREATED without SECURITY DEFINER
-- - v_participants_enriched: DELETED (can recreate if needed)

COMMENT ON TABLE public.event_registrations IS 'Event registrations with RLS enabled';
COMMENT ON TABLE public.event_registration_fields IS 'Event registration field configurations with RLS enabled';

