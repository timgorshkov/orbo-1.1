-- Check all RLS policies for tables involved in registration
-- Looking for policies with OR that might cause "argument of OR must not return a set"

-- 1. Policies on event_registration_fields
SELECT 
  'event_registration_fields' as table_name,
  policyname,
  cmd,
  permissive,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'event_registration_fields';

-- 2. Policies on events
SELECT 
  'events' as table_name,
  policyname,
  cmd,
  permissive,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'events';

-- 3. Policies on participants
SELECT 
  'participants' as table_name,
  policyname,
  cmd,
  permissive,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'participants';

-- 4. Policies on memberships
SELECT 
  'memberships' as table_name,
  policyname,
  cmd,
  permissive,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'memberships';

