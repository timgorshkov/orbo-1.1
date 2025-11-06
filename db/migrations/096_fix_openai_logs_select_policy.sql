-- Migration 096: Fix OpenAI Logs SELECT Policy
-- Date: Nov 6, 2025
-- Purpose: Simplify RLS to avoid recursion and allow superadmins to read logs

-- Drop existing policies
DROP POLICY IF EXISTS "Superadmins can view all API logs" ON public.openai_api_logs;
DROP POLICY IF EXISTS "Organization owners can view their API logs" ON public.openai_api_logs;

-- Create a simple policy: superadmins can see everything
-- Using a more direct approach to avoid recursion
CREATE POLICY "Superadmins can view all API logs" 
ON public.openai_api_logs 
FOR SELECT 
TO authenticated
USING (
  -- Direct check without subquery
  EXISTS (
    SELECT 1 
    FROM public.superadmins sa
    WHERE sa.user_id = auth.uid()
    LIMIT 1
  )
);

-- Organization owners can see their own org's logs
CREATE POLICY "Organization owners can view their API logs" 
ON public.openai_api_logs 
FOR SELECT 
TO authenticated
USING (
  -- Check if user is owner of the org
  EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = openai_api_logs.org_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
    LIMIT 1
  )
);

-- Ensure RLS is enabled
ALTER TABLE public.openai_api_logs ENABLE ROW LEVEL SECURITY;

-- Grant SELECT to authenticated users (RLS will filter)
GRANT SELECT ON public.openai_api_logs TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 096 Complete: Simplified RLS policies for openai_api_logs.'; END $$;

