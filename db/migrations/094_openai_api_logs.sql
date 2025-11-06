-- Migration 094: OpenAI API Logs
-- Date: Nov 6, 2025
-- Purpose: Track all OpenAI API calls for cost monitoring and optimization

-- Create openai_api_logs table
CREATE TABLE IF NOT EXISTS public.openai_api_logs (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL, -- 'participant_enrichment', 'weekly_digest', 'custom_analysis'
  model TEXT NOT NULL, -- 'gpt-4o-mini', 'gpt-4', etc.
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0, -- Cost in USD
  cost_rub NUMERIC(10, 2), -- Cost in RUB (optional, calculated)
  metadata JSONB, -- Additional context (participant_id, feature name, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL -- Who triggered the request
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_openai_logs_org_created 
ON public.openai_api_logs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openai_logs_created 
ON public.openai_api_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openai_logs_request_type 
ON public.openai_api_logs (request_type, created_at DESC);

-- Add RLS
ALTER TABLE public.openai_api_logs ENABLE ROW LEVEL SECURITY;

-- Superadmins can see all logs
CREATE POLICY "Superadmins can view all API logs" 
ON public.openai_api_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins 
    WHERE user_id = auth.uid()
  )
);

-- Organization owners can see their own logs
CREATE POLICY "Organization owners can view their API logs" 
ON public.openai_api_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = openai_api_logs.org_id 
      AND user_id = auth.uid() 
      AND role = 'owner'
  )
);

-- Service role can insert logs
CREATE POLICY "Service role can insert API logs" 
ON public.openai_api_logs 
FOR INSERT 
WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.openai_api_logs IS 'Logs all OpenAI API calls for cost monitoring and optimization';
COMMENT ON COLUMN public.openai_api_logs.request_type IS 'Type of AI request: participant_enrichment, weekly_digest, custom_analysis';
COMMENT ON COLUMN public.openai_api_logs.cost_usd IS 'Cost in USD (primary currency)';
COMMENT ON COLUMN public.openai_api_logs.cost_rub IS 'Cost in RUB for convenience (optional)';
COMMENT ON COLUMN public.openai_api_logs.metadata IS 'Additional context: participant_id, feature name, digest_id, etc.';

-- Create RPC function to get cost summary
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
      SUM(total_tokens) as tok_sum,
      SUM(cost_usd) as cost_usd_sum,
      SUM(cost_rub) as cost_rub_sum,
      request_type
    FROM public.openai_api_logs
    WHERE (p_org_id IS NULL OR org_id = p_org_id)
      AND created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY request_type
  )
  SELECT
    SUM(req_count)::BIGINT as total_requests,
    SUM(tok_sum)::BIGINT as total_tokens,
    SUM(cost_usd_sum)::NUMERIC as total_cost_usd,
    SUM(cost_rub_sum)::NUMERIC as total_cost_rub,
    CASE 
      WHEN SUM(req_count) > 0 THEN (SUM(cost_usd_sum) / SUM(req_count))::NUMERIC
      ELSE 0::NUMERIC
    END as avg_cost_per_request_usd,
    jsonb_object_agg(
      request_type, 
      jsonb_build_object(
        'requests', req_count,
        'tokens', tok_sum,
        'cost_usd', cost_usd_sum,
        'cost_rub', cost_rub_sum
      )
    ) as by_request_type
  FROM stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_openai_cost_summary(UUID, INT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Migration 094 Complete: OpenAI API logs table and cost summary function created.'; END $$;

