-- Migration 095: Fix OpenAI Logs RPC and RLS
-- Date: Nov 6, 2025
-- Purpose: Fix ambiguous column references in RPC and infinite recursion in RLS

-- 1. Drop and recreate the RPC function with proper aliases
DROP FUNCTION IF EXISTS public.get_openai_cost_summary(UUID, INT);

CREATE OR REPLACE FUNCTION public.get_openai_cost_summary(
  p_org_id UUID DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost_usd NUMERIC,
  total_cost_rub NUMERIC,
  avg_cost_per_request_usd NUMERIC,
  by_request_type JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as req_count,
      SUM(logs.total_tokens) as tok_sum, -- ⭐ Explicit alias
      SUM(logs.cost_usd) as cost_usd_sum,
      SUM(logs.cost_rub) as cost_rub_sum,
      logs.request_type
    FROM public.openai_api_logs logs -- ⭐ Alias added
    WHERE (p_org_id IS NULL OR logs.org_id = p_org_id)
      AND logs.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY logs.request_type
  )
  SELECT
    SUM(s.req_count)::BIGINT as total_requests,
    SUM(s.tok_sum)::BIGINT as total_tokens,
    SUM(s.cost_usd_sum)::NUMERIC as total_cost_usd,
    SUM(s.cost_rub_sum)::NUMERIC as total_cost_rub,
    CASE 
      WHEN SUM(s.req_count) > 0 THEN (SUM(s.cost_usd_sum) / SUM(s.req_count))::NUMERIC
      ELSE 0::NUMERIC
    END as avg_cost_per_request_usd,
    jsonb_object_agg(
      s.request_type, 
      jsonb_build_object(
        'requests', s.req_count,
        'tokens', s.tok_sum,
        'cost_usd', s.cost_usd_sum,
        'cost_rub', s.cost_rub_sum
      )
    ) as by_request_type
  FROM stats s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_openai_cost_summary(UUID, INT) TO authenticated;

-- 2. Fix RLS policies - remove infinite recursion
DROP POLICY IF EXISTS "Superadmins can view all API logs" ON public.openai_api_logs;
DROP POLICY IF EXISTS "Organization owners can view their API logs" ON public.openai_api_logs;

-- Simplified superadmin check - use direct role check instead of table lookup
CREATE POLICY "Superadmins can view all API logs" 
ON public.openai_api_logs 
FOR SELECT 
USING (
  -- Check if user is superadmin by querying superadmins table directly
  auth.uid() IN (
    SELECT user_id FROM public.superadmins
  )
);

-- Organization owners can see their own logs
CREATE POLICY "Organization owners can view their API logs" 
ON public.openai_api_logs 
FOR SELECT 
USING (
  org_id IN (
    SELECT m.org_id 
    FROM public.memberships m
    WHERE m.user_id = auth.uid() 
      AND m.role = 'owner'
  )
);

DO $$ BEGIN RAISE NOTICE 'Migration 095 Complete: Fixed RPC ambiguous columns and RLS infinite recursion.'; END $$;

