-- Migration 152: RPC function to fetch OpenAI API logs
-- Date: Dec 19, 2025
-- Purpose: Bypass RLS issues for superadmin access to logs

-- Create RPC function to fetch recent logs (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_openai_api_logs(
  p_org_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  org_id UUID,
  request_type TEXT,
  model TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  cost_usd NUMERIC,
  cost_rub NUMERIC,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  created_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_superadmin BOOLEAN;
BEGIN
  -- Check if caller is superadmin
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins 
    WHERE superadmins.user_id = auth.uid()
  ) INTO v_is_superadmin;
  
  -- If superadmin, return all logs (or filtered by org if specified)
  IF v_is_superadmin THEN
    RETURN QUERY
    SELECT 
      l.id,
      l.org_id,
      l.request_type,
      l.model,
      l.prompt_tokens,
      l.completion_tokens,
      l.total_tokens,
      l.cost_usd,
      l.cost_rub,
      l.metadata,
      l.created_at,
      l.created_by
    FROM public.openai_api_logs l
    WHERE (p_org_id IS NULL OR l.org_id = p_org_id)
    ORDER BY l.created_at DESC
    LIMIT p_limit;
  ELSE
    -- Non-superadmin: only return logs for orgs where user is owner
    RETURN QUERY
    SELECT 
      l.id,
      l.org_id,
      l.request_type,
      l.model,
      l.prompt_tokens,
      l.completion_tokens,
      l.total_tokens,
      l.cost_usd,
      l.cost_rub,
      l.metadata,
      l.created_at,
      l.created_by
    FROM public.openai_api_logs l
    WHERE EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = l.org_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
    AND (p_org_id IS NULL OR l.org_id = p_org_id)
    ORDER BY l.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_openai_api_logs(UUID, INT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 152 Complete: OpenAI logs fetch RPC function created.'; END $$;

