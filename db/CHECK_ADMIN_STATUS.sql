-- Проверка статуса администраторов

-- 1. Записи в telegram_group_admins
SELECT 
  'telegram_group_admins' as check_name,
  tga.tg_chat_id,
  tg.title as group_title,
  tga.tg_user_id,
  tga.is_admin,
  tga.is_owner,
  tga.custom_title,
  tga.expires_at
FROM telegram_group_admins tga
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
ORDER BY tga.tg_chat_id, tga.is_owner DESC, tga.is_admin DESC;

-- 2. Участники с их tg_user_id
SELECT 
  'participants_with_tg_id' as check_name,
  p.id,
  p.org_id,
  p.tg_user_id,
  p.full_name,
  p.username
FROM participants p
WHERE p.merged_into IS NULL
ORDER BY p.tg_user_id;

-- 3. Участники, которые должны быть админами (по telegram_group_admins)
SELECT 
  'should_be_admins' as check_name,
  p.id as participant_id,
  p.full_name,
  p.username,
  p.tg_user_id,
  tga.tg_chat_id,
  tg.title as group_title,
  tga.is_admin,
  tga.is_owner,
  tga.custom_title
FROM participants p
INNER JOIN telegram_group_admins tga ON tga.tg_user_id = p.tg_user_id
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
WHERE p.merged_into IS NULL
  AND tga.is_admin = true
ORDER BY p.full_name;

-- 4. Memberships (команда организации)
SELECT 
  'memberships' as check_name,
  m.user_id,
  m.org_id,
  m.role,
  u.email
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
ORDER BY m.role, u.email;

-- 5. User Telegram Accounts (связь user_id с tg_user_id)
SELECT 
  'user_telegram_accounts' as check_name,
  uta.user_id,
  uta.telegram_user_id,
  uta.org_id,
  uta.is_verified,
  u.email
FROM user_telegram_accounts uta
LEFT JOIN auth.users u ON u.id = uta.user_id
ORDER BY uta.telegram_user_id;

-- 6. Organization Admins View (итоговый взгляд)
SELECT 
  'organization_admins_view' as check_name,
  *
FROM organization_admins
ORDER BY role, full_name;

