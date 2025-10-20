-- Диагностика: почему владелец не видит свой participant профиль

-- 1. Проверяем auth.users (текущий владелец)
SELECT 
  'auth.users' as source,
  id as user_id,
  email,
  email_confirmed_at,
  raw_user_meta_data
FROM auth.users
WHERE email = 'timgorshkov@gmail.com' -- ЗАМЕНИТЕ НА ВАШ EMAIL
LIMIT 1;

-- 2. Проверяем memberships для владельца
SELECT 
  'memberships' as source,
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  o.name as org_name
FROM memberships m
LEFT JOIN organizations o ON o.id = m.org_id
WHERE m.user_id IN (
  SELECT id FROM auth.users WHERE email = 'timgorshkov@gmail.com' -- ЗАМЕНИТЕ НА ВАШ EMAIL
);

-- 3. Проверяем user_telegram_accounts для владельца
SELECT 
  'user_telegram_accounts' as source,
  uta.id,
  uta.user_id,
  uta.org_id,
  uta.telegram_user_id,
  uta.telegram_username,
  uta.is_verified
FROM user_telegram_accounts uta
WHERE uta.user_id IN (
  SELECT id FROM auth.users WHERE email = 'timgorshkov@gmail.com' -- ЗАМЕНИТЕ НА ВАШ EMAIL
);

-- 4. Проверяем participants для владельца (по telegram_user_id)
SELECT 
  'participants (by tg_user_id)' as source,
  p.id,
  p.org_id,
  p.user_id,
  p.tg_user_id,
  p.full_name,
  p.username,
  p.merged_into,
  o.name as org_name
FROM participants p
LEFT JOIN organizations o ON o.id = p.org_id
WHERE p.tg_user_id IN (
  SELECT telegram_user_id FROM user_telegram_accounts 
  WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'timgorshkov@gmail.com') -- ЗАМЕНИТЕ
);

-- 5. Проверяем participants для владельца (по user_id)
SELECT 
  'participants (by user_id)' as source,
  p.id,
  p.org_id,
  p.user_id,
  p.tg_user_id,
  p.full_name,
  p.username,
  p.merged_into,
  o.name as org_name
FROM participants p
LEFT JOIN organizations o ON o.id = p.org_id
WHERE p.user_id IN (
  SELECT id FROM auth.users WHERE email = 'timgorshkov@gmail.com' -- ЗАМЕНИТЕ НА ВАШ EMAIL
);

-- 6. Если participant НЕ найден, показываем все participants в организации
SELECT 
  'all participants in org' as source,
  p.id,
  p.org_id,
  p.user_id,
  p.tg_user_id,
  p.full_name,
  p.username,
  p.merged_into,
  p.source
FROM participants p
WHERE p.org_id IN (
  SELECT m.org_id FROM memberships m
  WHERE m.user_id IN (SELECT id FROM auth.users WHERE email = 'timgorshkov@gmail.com') -- ЗАМЕНИТЕ
)
ORDER BY p.created_at DESC;

