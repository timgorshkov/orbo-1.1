-- Migration 149: Fix SECURITY DEFINER views
-- Date: 2025-12-14
-- Problem: organization_admins and user_admin_status have SECURITY DEFINER
-- Solution: Recreate them with security_invoker = true

-- 1. Drop and recreate organization_admins view
DROP VIEW IF EXISTS public.organization_admins CASCADE;

CREATE VIEW public.organization_admins 
WITH (security_invoker = true) AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  m.metadata,
  m.created_at,
  p.full_name,
  p.email,
  p.phone,
  p.username as telegram_username,
  p.tg_user_id,
  o.name as org_name
FROM public.memberships m
LEFT JOIN public.participants p ON p.user_id = m.user_id AND p.org_id = m.org_id
LEFT JOIN public.organizations o ON o.id = m.org_id
WHERE m.role IN ('owner', 'admin');

GRANT SELECT ON public.organization_admins TO authenticated;

-- 2. Drop and recreate user_admin_status view
DROP VIEW IF EXISTS public.user_admin_status CASCADE;

CREATE VIEW public.user_admin_status 
WITH (security_invoker = true) AS
SELECT 
  m.user_id,
  m.org_id,
  m.role,
  m.role_source,
  CASE WHEN m.role IN ('owner', 'admin') THEN true ELSE false END as is_admin,
  p.email IS NOT NULL as has_email,
  p.full_name,
  p.tg_user_id IS NOT NULL as has_telegram
FROM public.memberships m
LEFT JOIN public.participants p ON p.user_id = m.user_id AND p.org_id = m.org_id;

GRANT SELECT ON public.user_admin_status TO authenticated;

-- 3. Add SET search_path to critical functions

-- Fix log_telegram_health
DROP FUNCTION IF EXISTS log_telegram_health(bigint,text,text,text,jsonb,uuid);
CREATE OR REPLACE FUNCTION log_telegram_health(
  p_tg_chat_id BIGINT,
  p_event_type TEXT,
  p_status TEXT,
  p_message TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_org_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO telegram_health_events (
    tg_chat_id, event_type, status, message, details, org_id
  ) VALUES (
    p_tg_chat_id, p_event_type, p_status, p_message, p_details, p_org_id
  );
END;
$$;

-- Fix cleanup_health_events
DROP FUNCTION IF EXISTS cleanup_health_events();
CREATE OR REPLACE FUNCTION cleanup_health_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_health_events WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Fix cleanup_error_logs
DROP FUNCTION IF EXISTS cleanup_error_logs();
CREATE OR REPLACE FUNCTION cleanup_error_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Fix cleanup_webhook_idempotency
DROP FUNCTION IF EXISTS cleanup_webhook_idempotency();
CREATE OR REPLACE FUNCTION cleanup_webhook_idempotency()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_idempotency WHERE created_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

DO $$ BEGIN 
  RAISE NOTICE 'Migration 149 complete: Fixed SECURITY DEFINER views'; 
END $$;

