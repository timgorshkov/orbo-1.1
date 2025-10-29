-- ДИАГНОСТИКА ДУБЛЕЙ В КОМАНДЕ (для Supabase SQL Editor)
-- Версия с SELECT вместо RAISE NOTICE

-- Замените на ваш org_id
\set target_org_id 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'

-- 1. ВСЕ ЗАПИСИ В MEMBERSHIPS
SELECT 
  '1. MEMBERSHIPS' as section,
  m.user_id,
  m.role,
  m.role_source,
  u.email,
  m.created_at,
  ROW_NUMBER() OVER (ORDER BY 
    CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    m.created_at
  ) as row_num
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = :'target_org_id'
ORDER BY row_num;

-- 2. ПРОВЕРКА ДУБЛЕЙ USER_ID
SELECT 
  '2. ДУБЛИ USER_ID' as section,
  user_id,
  COUNT(*) as records_count,
  array_agg(role ORDER BY role) as roles,
  array_agg(role_source ORDER BY role) as sources,
  CASE 
    WHEN COUNT(*) > 1 THEN '⚠️ ДУБЛЬ!'
    ELSE '✅ OK'
  END as status
FROM memberships
WHERE org_id = :'target_org_id'
GROUP BY user_id
ORDER BY records_count DESC, user_id;

-- 3. ДАННЫЕ ИЗ VIEW ORGANIZATION_ADMINS
SELECT 
  '3. ORGANIZATION_ADMINS VIEW' as section,
  user_id,
  role,
  role_source,
  full_name,
  email,
  email_confirmed,
  telegram_username,
  has_verified_telegram,
  is_shadow_profile,
  ROW_NUMBER() OVER (ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  ) as display_order
FROM organization_admins
WHERE org_id = :'target_org_id'
ORDER BY display_order;

-- 4. USER_TELEGRAM_ACCOUNTS
SELECT 
  '4. USER_TELEGRAM_ACCOUNTS' as section,
  uta.user_id,
  uta.telegram_user_id,
  uta.username as telegram_username,
  uta.is_verified,
  uta.telegram_first_name,
  uta.telegram_last_name,
  u.email
FROM user_telegram_accounts uta
LEFT JOIN auth.users u ON u.id = uta.user_id
WHERE uta.org_id = :'target_org_id'
ORDER BY u.email NULLS LAST;

-- 5. AUTH.USERS - EMAIL VERIFICATION STATUS
SELECT 
  '5. EMAIL VERIFICATION' as section,
  u.id as user_id,
  u.email,
  u.email_confirmed_at,
  CASE 
    WHEN u.email_confirmed_at IS NOT NULL THEN '✅ Подтверждён'
    ELSE '❌ Не подтверждён'
  END as email_status
FROM auth.users u
WHERE u.id IN (
  SELECT user_id FROM memberships WHERE org_id = :'target_org_id'
)
ORDER BY u.email NULLS LAST;

-- 6. АНАЛИЗ: ЧТО НЕ ТАК
WITH issues AS (
  -- Проблема 1: Дубли user_id в memberships
  SELECT 
    '❌ Дубль user_id в memberships' as issue,
    user_id::text as details,
    array_agg(role)::text as extra_info
  FROM memberships
  WHERE org_id = :'target_org_id'
  GROUP BY user_id
  HAVING COUNT(*) > 1
  
  UNION ALL
  
  -- Проблема 2: Email не подтверждён, хотя должен быть
  SELECT 
    '⚠️ Email не подтверждён' as issue,
    u.email as details,
    u.id::text as extra_info
  FROM auth.users u
  JOIN memberships m ON m.user_id = u.id
  WHERE m.org_id = :'target_org_id'
    AND m.role = 'owner'
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NULL
  
  UNION ALL
  
  -- Проблема 3: Telegram не верифицирован
  SELECT 
    '⚠️ Telegram не верифицирован' as issue,
    uta.username as details,
    u.email as extra_info
  FROM user_telegram_accounts uta
  LEFT JOIN auth.users u ON u.id = uta.user_id
  WHERE uta.org_id = :'target_org_id'
    AND uta.is_verified = false
    AND uta.username IS NOT NULL
)
SELECT 
  '6. НАЙДЕННЫЕ ПРОБЛЕМЫ' as section,
  issue,
  details,
  extra_info
FROM issues

UNION ALL

SELECT 
  '6. НАЙДЕННЫЕ ПРОБЛЕМЫ' as section,
  '✅ Проблем не найдено' as issue,
  '' as details,
  '' as extra_info
WHERE NOT EXISTS (SELECT 1 FROM issues);

-- 7. ИТОГОВЫЙ СЧЁТ
SELECT 
  '7. ИТОГОВАЯ СТАТИСТИКА' as section,
  (SELECT COUNT(*) FROM memberships WHERE org_id = :'target_org_id') as total_memberships,
  (SELECT COUNT(DISTINCT user_id) FROM memberships WHERE org_id = :'target_org_id') as unique_users,
  (SELECT COUNT(*) FROM memberships WHERE org_id = :'target_org_id' AND role = 'owner') as owners_count,
  (SELECT COUNT(*) FROM memberships WHERE org_id = :'target_org_id' AND role = 'admin') as admins_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM memberships WHERE org_id = :'target_org_id') > 
         (SELECT COUNT(DISTINCT user_id) FROM memberships WHERE org_id = :'target_org_id')
    THEN '⚠️ ЕСТЬ ДУБЛИ!'
    ELSE '✅ OK'
  END as duplication_status;


