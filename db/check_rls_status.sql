-- Check RLS status and policies for all tables involved in event registration
-- This will help us identify if there are any remaining RLS policies causing issues

-- 1. Check RLS status for event_registrations
SELECT 
  'event_registrations' as table_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
FROM pg_class
WHERE relname = 'event_registrations' AND relnamespace = 'public'::regnamespace;

-- 2. Check all policies on event_registrations
SELECT 
  'event_registrations' as table_name,
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'event_registrations';

-- 3. Check RLS status for related tables
SELECT 
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  COUNT(p.policyname) as policy_count
FROM pg_class c
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('events', 'participants', 'event_registration_fields', 'memberships')
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;

-- 4. Check function owner and security settings
SELECT 
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as is_security_definer,
  p.proconfig as config_settings
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('register_for_event', 'set_registration_price_from_event', 'validate_registration_quantity', 'update_participant_from_registration_data')
ORDER BY p.proname;

-- 5. Check triggers on event_registrations
SELECT 
  tgname as trigger_name,
  tgtype as trigger_type,
  tgenabled as enabled,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgrelid = 'event_registrations'::regclass
  AND tgname NOT LIKE 'RI_%'  -- Exclude foreign key triggers
ORDER BY tgname;

