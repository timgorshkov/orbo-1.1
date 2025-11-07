-- Debug script for TelegramHealthStatus widget
-- Run these queries in Supabase SQL Editor

-- 1. Check if table exists and has data
SELECT COUNT(*) as total_events 
FROM telegram_health_events;

-- 2. Check recent events (last 24 hours)
SELECT 
  id,
  tg_chat_id,
  org_id,
  event_type,
  status,
  message,
  created_at
FROM telegram_health_events
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check events by status
SELECT 
  status,
  COUNT(*) as count,
  MAX(created_at) as latest_event
FROM telegram_health_events
GROUP BY status;

-- 4. Test get_telegram_health_status RPC for a specific group
-- Replace 123456 with actual tg_chat_id from telegram_groups table
SELECT * FROM get_telegram_health_status(123456);

-- 5. Check all telegram groups and their last_sync_at
SELECT 
  tg_chat_id,
  title,
  last_sync_at,
  bot_status,
  EXTRACT(EPOCH FROM (NOW() - last_sync_at)) / 60 as minutes_since_sync
FROM telegram_groups
ORDER BY last_sync_at DESC NULLS LAST
LIMIT 10;

-- 6. Check if RLS is blocking access (run as authenticated user)
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "YOUR_USER_ID_HERE"}';
SELECT COUNT(*) FROM telegram_health_events;
RESET role;

-- 7. Check superadmin access
SELECT 
  sa.user_id,
  p.email
FROM superadmins sa
LEFT JOIN auth.users p ON p.id = sa.user_id;

