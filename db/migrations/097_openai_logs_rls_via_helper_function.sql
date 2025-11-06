-- Migration 097: OpenAI Logs RLS via Helper Function (Alternative)
-- Date: Nov 6, 2025
-- Purpose: Use SECURITY DEFINER function to avoid RLS recursion

-- Create helper function to check if user is superadmin
CREATE OR REPLACE FUNCTION public.is_user_superadmin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins 
    WHERE superadmins.user_id = $1
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_superadmin(UUID) TO authenticated;

-- Drop existing policies
DROP POLICY IF EXISTS "Superadmins can view all API logs" ON public.openai_api_logs;
DROP POLICY IF EXISTS "Organization owners can view their API logs" ON public.openai_api_logs;

-- Create policy using the helper function
CREATE POLICY "Superadmins can view all API logs" 
ON public.openai_api_logs 
FOR SELECT 
TO authenticated
USING (
  public.is_user_superadmin(auth.uid())
);

-- Organization owners can see their own org's logs
CREATE POLICY "Organization owners can view their API logs" 
ON public.openai_api_logs 
FOR SELECT 
TO authenticated
USING (
  NOT public.is_user_superadmin(auth.uid()) -- Only if not superadmin
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = openai_api_logs.org_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
    LIMIT 1
  )
);

DO $$ BEGIN RAISE NOTICE 'Migration 097 Complete: RLS via SECURITY DEFINER function.'; END $$;

