-- Диагностика дублирования пользователей для Telegram ID 154588486

-- 1. Проверяем auth.users
SELECT 
  'AUTH.USERS' as source,
  id as user_id,
  email,
  email_confirmed_at IS NOT NULL as email_confirmed,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE id IN (
  '9bb4b601-fa85-44d4-a811-58bf0c889e93',
  'd64f3cd8-093e-496a-868a-cf1bece66ee4'
)
ORDER BY created_at;

-- 2. Проверяем user_telegram_accounts
SELECT 
  'USER_TELEGRAM_ACCOUNTS' as source,
  id as record_id,
  user_id,
  org_id,
  telegram_user_id,
  telegram_username,
  is_verified,
  verified_at,
  created_at
FROM user_telegram_accounts
WHERE telegram_user_id = 154588486
ORDER BY created_at;

-- 3. Проверяем memberships для обоих user_id
SELECT 
  'MEMBERSHIPS' as source,
  m.user_id,
  m.org_id,
  m.role,
  m.role_source,
  m.metadata->>'shadow_profile' as is_shadow,
  m.created_at
FROM memberships m
WHERE m.user_id IN (
  '9bb4b601-fa85-44d4-a811-58bf0c889e93',
  'd64f3cd8-093e-496a-868a-cf1bece66ee4'
)
ORDER BY m.user_id, m.created_at;

-- 4. Проверяем participants
SELECT 
  'PARTICIPANTS' as source,
  id as participant_id,
  user_id,
  org_id,
  full_name,
  tg_user_id,
  username,
  source,
  created_at
FROM participants
WHERE tg_user_id = 154588486
ORDER BY created_at;

-- 5. Итоговая сводка
SELECT 
  telegram_user_id,
  COUNT(DISTINCT user_id) as auth_users_count,
  COUNT(DISTINCT id) as telegram_accounts_count,
  string_agg(DISTINCT user_id::text, ', ') as user_ids
FROM user_telegram_accounts
WHERE telegram_user_id = 154588486
GROUP BY telegram_user_id;


