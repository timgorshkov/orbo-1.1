-- ДИАГНОСТИКА ПРОБЛЕМЫ С ОТОБРАЖЕНИЕМ КОМАНДЫ
-- Исследуем почему владелец дублируется и статусы неверны

\echo '========================================'
\echo 'ДИАГНОСТИКА КОМАНДЫ ОРГАНИЗАЦИИ'
\echo '========================================'
\echo ''

-- Замените на ваш org_id
\set target_org_id 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'

\echo '1. ВСЕ ЗАПИСИ В MEMBERSHIPS'
\echo '----------------------------'
SELECT 
  m.user_id,
  m.role,
  u.email,
  m.created_at,
  m.metadata
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = :'target_org_id'
ORDER BY 
  CASE m.role 
    WHEN 'owner' THEN 1 
    WHEN 'admin' THEN 2 
    ELSE 3 
  END,
  m.created_at;

\echo ''
\echo '2. ДАННЫЕ ИЗ VIEW ORGANIZATION_ADMINS'
\echo '--------------------------------------'
SELECT 
  user_id,
  role,
  role_source,
  email,
  is_shadow_profile,
  telegram_username,
  email_confirmed,
  has_verified_telegram,
  metadata
FROM organization_admins
WHERE org_id = :'target_org_id'
ORDER BY 
  CASE role 
    WHEN 'owner' THEN 1 
    WHEN 'admin' THEN 2 
    ELSE 3 
  END;

\echo ''
\echo '3. USER_TELEGRAM_ACCOUNTS'
\echo '--------------------------'
SELECT 
  uta.user_id,
  uta.telegram_user_id,
  uta.username,
  uta.is_verified,
  u.email
FROM user_telegram_accounts uta
LEFT JOIN auth.users u ON u.id = uta.user_id
WHERE uta.org_id = :'target_org_id';

\echo ''
\echo '4. TELEGRAM_GROUP_ADMINS (роли в группах)'
\echo '------------------------------------------'
SELECT 
  tga.user_id,
  tga.tg_group_id,
  tg.title as group_title,
  tga.status,
  tga.is_creator,
  u.email
FROM telegram_group_admins tga
JOIN telegram_groups tg ON tg.id = tga.tg_group_id
LEFT JOIN auth.users u ON u.id = tga.user_id
JOIN org_telegram_groups otg ON otg.tg_group_id = tga.tg_group_id
WHERE otg.org_id = :'target_org_id'
ORDER BY tga.user_id, tg.title;

\echo ''
\echo '5. PARTICIPANTS (участники с user_id)'
\echo '--------------------------------------'
SELECT 
  p.id as participant_id,
  p.user_id,
  p.full_name,
  p.tg_user_id,
  p.username,
  p.tg_first_name,
  p.tg_last_name,
  u.email
FROM participants p
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE p.org_id = :'target_org_id'
  AND p.user_id IS NOT NULL
ORDER BY p.full_name;

\echo ''
\echo '6. ПОИСК ДУБЛЕЙ USER_ID В MEMBERSHIPS'
\echo '--------------------------------------'
SELECT 
  user_id,
  COUNT(*) as count,
  array_agg(role) as roles,
  array_agg(created_at::text) as created_dates
FROM memberships
WHERE org_id = :'target_org_id'
GROUP BY user_id
HAVING COUNT(*) > 1;

\echo ''
\echo '7. AUTH.USERS (все пользователи для этой организации)'
\echo '------------------------------------------------------'
SELECT DISTINCT
  u.id as user_id,
  u.email,
  u.created_at,
  CASE 
    WHEN u.email IS NULL OR u.email = '' THEN 'Теневой профиль'
    ELSE 'Обычный'
  END as profile_type
FROM auth.users u
WHERE u.id IN (
  SELECT user_id FROM memberships WHERE org_id = :'target_org_id'
)
ORDER BY profile_type, u.email;

\echo ''
\echo '8. ПРОВЕРКА VIEW - СРАВНЕНИЕ С РЕАЛЬНЫМИ ДАННЫМИ'
\echo '-------------------------------------------------'
\echo 'Email confirmed (из auth.users):'
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  CASE WHEN u.email_confirmed_at IS NOT NULL THEN TRUE ELSE FALSE END as should_be_confirmed
FROM auth.users u
WHERE u.id IN (SELECT user_id FROM memberships WHERE org_id = :'target_org_id')
ORDER BY u.email;

\echo ''
\echo 'Telegram verified (из user_telegram_accounts):'
SELECT 
  uta.user_id,
  uta.username,
  uta.is_verified,
  u.email
FROM user_telegram_accounts uta
LEFT JOIN auth.users u ON u.id = uta.user_id
WHERE uta.org_id = :'target_org_id'
ORDER BY u.email;

\echo ''
\echo '========================================'
\echo 'АНАЛИЗ ЗАВЕРШЁН'
\echo '========================================'
\echo ''
\echo 'Ключевые вопросы для анализа:'
\echo '1. Есть ли дубли user_id в memberships? (см. раздел 6)'
\echo '2. Совпадают ли данные из view с реальными данными? (см. разделы 2 и 8)'
\echo '3. Сколько записей в auth.users для организации? (см. раздел 7)'
\echo '4. Правильно ли заполнены user_telegram_accounts? (см. раздел 3)'
\echo ''


