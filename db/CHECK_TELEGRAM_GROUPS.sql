-- ==========================================
-- ПРОВЕРКА СОСТОЯНИЯ TELEGRAM ГРУПП
-- ==========================================

-- 1. Проверяем, есть ли записи в telegram_groups
SELECT 
  'telegram_groups' as table_name,
  COUNT(*) as count,
  ARRAY_AGG(title) FILTER (WHERE title IS NOT NULL) as group_titles
FROM telegram_groups;

-- 2. Проверяем, есть ли записи в telegram_group_admins
SELECT 
  'telegram_group_admins' as table_name,
  COUNT(*) as count
FROM telegram_group_admins;

-- 3. Проверяем, есть ли записи в org_telegram_groups
SELECT 
  'org_telegram_groups' as table_name,
  COUNT(*) as count
FROM org_telegram_groups;

-- 4. Проверяем, есть ли записи в activity_events от бота
SELECT 
  'activity_events (bot messages)' as table_name,
  COUNT(*) as count,
  MAX(created_at) as last_activity
FROM activity_events
WHERE tg_chat_id IS NOT NULL;

-- 5. Проверяем ваш Telegram аккаунт
SELECT 
  'user_telegram_accounts' as table_name,
  telegram_user_id,
  telegram_username,
  is_verified,
  org_id
FROM user_telegram_accounts
WHERE is_verified = true;

-- 6. Проверяем вебхук бота
SELECT 
  'telegram_bots (if exists)' as info,
  COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public' 
AND table_name = 'telegram_bots';

