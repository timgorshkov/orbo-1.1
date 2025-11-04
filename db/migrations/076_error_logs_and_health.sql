-- Migration 076: Error Logs & Health Monitoring
-- Created: 2025-11-01
-- Purpose: Internal observability without external services
-- Context: Solo-founder needs simple error tracking and health monitoring

-- =====================================================
-- 1. ERROR LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Context
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Error details
  level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  message TEXT NOT NULL,
  error_code TEXT, -- e.g., 'WEBHOOK_FAILURE', 'IMPORT_ERROR'
  
  -- Metadata
  context JSONB, -- { path: '/api/telegram/webhook', method: 'POST', ... }
  stack_trace TEXT,
  
  -- Grouping (for deduplication)
  fingerprint TEXT, -- hash of (error_code + message + path)
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ, -- mark as resolved after fix
  
  -- Request context
  request_id TEXT, -- for correlation
  user_agent TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_created 
ON public.error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_org 
ON public.error_logs(org_id, created_at DESC) WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_level 
ON public.error_logs(level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint 
ON public.error_logs(fingerprint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved 
ON public.error_logs(created_at DESC) WHERE resolved_at IS NULL;

-- =====================================================
-- 2. TELEGRAM HEALTH EVENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.telegram_health_events (
  id BIGSERIAL PRIMARY KEY,
  
  -- Group context
  tg_chat_id BIGINT NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Event type
  event_type TEXT NOT NULL CHECK (event_type IN (
    'webhook_success',
    'webhook_failure',
    'admin_check_success',
    'admin_check_failure',
    'sync_success',
    'sync_failure',
    'bot_removed',
    'bot_added'
  )),
  
  -- Details
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  message TEXT,
  details JSONB, -- error codes, response times, etc.
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_health_created 
ON public.telegram_health_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_health_chat 
ON public.telegram_health_events(tg_chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_health_org 
ON public.telegram_health_events(org_id, created_at DESC) WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_health_status 
ON public.telegram_health_events(status, created_at DESC);

-- =====================================================
-- 3. ADMIN ACTION LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id BIGSERIAL PRIMARY KEY,
  
  -- Who
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- What
  action TEXT NOT NULL, -- 'update_participant', 'delete_event', 'import_messages', etc.
  resource_type TEXT NOT NULL, -- 'participant', 'event', 'telegram_group', etc.
  resource_id TEXT, -- UUID or other identifier
  
  -- Details
  changes JSONB, -- before/after values
  metadata JSONB, -- additional context
  
  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Request context
  request_id TEXT,
  ip_address INET,
  user_agent TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_action_created 
ON public.admin_action_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_org 
ON public.admin_action_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_user 
ON public.admin_action_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_resource 
ON public.admin_action_log(resource_type, resource_id, created_at DESC);

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Log error helper
CREATE OR REPLACE FUNCTION log_error(
  p_level TEXT,
  p_message TEXT,
  p_error_code TEXT DEFAULT NULL,
  p_context JSONB DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fingerprint TEXT;
  v_error_id BIGINT;
BEGIN
  -- Generate fingerprint for deduplication
  v_fingerprint := MD5(
    COALESCE(p_error_code, '') || 
    COALESCE(p_message, '') || 
    COALESCE(p_context->>'path', '')
  );
  
  INSERT INTO public.error_logs (
    level, message, error_code, context, stack_trace,
    fingerprint, org_id, user_id
  )
  VALUES (
    p_level, p_message, p_error_code, p_context, p_stack_trace,
    v_fingerprint, p_org_id, p_user_id
  )
  RETURNING id INTO v_error_id;
  
  RETURN v_error_id;
END;
$$;

-- Log admin action helper
CREATE OR REPLACE FUNCTION log_admin_action(
  p_org_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_changes JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id BIGINT;
BEGIN
  INSERT INTO public.admin_action_log (
    org_id, user_id, action, resource_type, resource_id,
    changes, metadata
  )
  VALUES (
    p_org_id, p_user_id, p_action, p_resource_type, p_resource_id,
    p_changes, p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Log Telegram health event
CREATE OR REPLACE FUNCTION log_telegram_health(
  p_tg_chat_id BIGINT,
  p_event_type TEXT,
  p_status TEXT,
  p_message TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_org_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  INSERT INTO public.telegram_health_events (
    tg_chat_id, org_id, event_type, status, message, details
  )
  VALUES (
    p_tg_chat_id, p_org_id, p_event_type, p_status, p_message, p_details
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Get latest health status for chat
CREATE OR REPLACE FUNCTION get_telegram_health_status(p_tg_chat_id BIGINT)
RETURNS TABLE (
  status TEXT,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  failure_count_24h INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN MAX(CASE WHEN event_type LIKE '%_success' THEN created_at END) > 
           MAX(CASE WHEN event_type LIKE '%_failure' THEN created_at END)
      THEN 'healthy'::TEXT
      ELSE 'unhealthy'::TEXT
    END AS status,
    MAX(CASE WHEN event_type LIKE '%_success' THEN created_at END) AS last_success,
    MAX(CASE WHEN event_type LIKE '%_failure' THEN created_at END) AS last_failure,
    COUNT(*) FILTER (
      WHERE event_type LIKE '%_failure' 
      AND created_at > NOW() - INTERVAL '24 hours'
    )::INTEGER AS failure_count_24h
  FROM public.telegram_health_events
  WHERE tg_chat_id = p_tg_chat_id
  AND created_at > NOW() - INTERVAL '7 days';
END;
$$;

-- =====================================================
-- 5. CLEANUP FUNCTIONS
-- =====================================================

-- Cleanup old error logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_error_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.error_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Cleanup old health events (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_health_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.telegram_health_events
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Cleanup old admin logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_admin_action_log()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.admin_action_log
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- =====================================================
-- 6. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT ON public.error_logs TO authenticated;
GRANT SELECT, INSERT ON public.telegram_health_events TO authenticated;
GRANT SELECT, INSERT ON public.admin_action_log TO authenticated;

GRANT EXECUTE ON FUNCTION log_error TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_action TO authenticated;
GRANT EXECUTE ON FUNCTION log_telegram_health TO authenticated;
GRANT EXECUTE ON FUNCTION get_telegram_health_status TO authenticated;

GRANT EXECUTE ON FUNCTION cleanup_error_logs TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_health_events TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_admin_action_log TO authenticated;

-- =====================================================
-- 7. RLS POLICIES
-- =====================================================

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

-- Error logs: org members can see their org's errors
CREATE POLICY error_logs_select ON public.error_logs
FOR SELECT USING (
  org_id IS NULL OR 
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = error_logs.org_id
    AND m.user_id = auth.uid()
  )
);

-- Health events: org members can see their groups
CREATE POLICY telegram_health_select ON public.telegram_health_events
FOR SELECT USING (
  org_id IS NULL OR 
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = telegram_health_events.org_id
    AND m.user_id = auth.uid()
  )
);

-- Admin logs: org members can see their org's logs
CREATE POLICY admin_action_select ON public.admin_action_log
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = admin_action_log.org_id
    AND m.user_id = auth.uid()
  )
);

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration 076 Complete ===';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - error_logs (30-day retention)';
  RAISE NOTICE '  - telegram_health_events (7-day retention)';
  RAISE NOTICE '  - admin_action_log (90-day retention)';
  RAISE NOTICE '';
  RAISE NOTICE 'Helper functions:';
  RAISE NOTICE '  - log_error()';
  RAISE NOTICE '  - log_admin_action()';
  RAISE NOTICE '  - log_telegram_health()';
  RAISE NOTICE '  - get_telegram_health_status()';
  RAISE NOTICE '';
  RAISE NOTICE 'Cleanup functions (call via cron):';
  RAISE NOTICE '  - cleanup_error_logs()';
  RAISE NOTICE '  - cleanup_health_events()';
  RAISE NOTICE '  - cleanup_admin_action_log()';
  RAISE NOTICE '================================';
END $$;

