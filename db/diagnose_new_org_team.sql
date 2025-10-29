-- Диагностика команды для новой организации

-- ЗАМЕНИТЕ ЭТО на ID вашей новой организации (созданной от лица Тимур Голицын)
\set ORG_ID 'REPLACE_WITH_YOUR_NEW_ORG_ID'

-- Проверка 1: Что в memberships?
SELECT 
  'Memberships' as check_type,
  m.user_id,
  m.role,
  m.role_source,
  u.email,
  m.metadata
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = :'ORG_ID'
ORDER BY 
  CASE m.role WHEN 'owner' THEN 1 ELSE 2 END,
  m.created_at;

-- Проверка 2: Что возвращает organization_admins VIEW?
SELECT 
  'Organization Admins VIEW' as check_type,
  user_id,
  role,
  full_name,
  email,
  telegram_username,
  (metadata->>'is_owner_in_groups')::boolean as is_owner_in_groups,
  role_source
FROM organization_admins
WHERE org_id = :'ORG_ID'
ORDER BY 
  CASE role WHEN 'owner' THEN 1 ELSE 2 END;

-- Проверка 3: Participants для этих пользователей
SELECT 
  'Participants' as check_type,
  p.id,
  p.user_id,
  p.full_name,
  p.tg_user_id,
  p.username
FROM participants p
WHERE p.org_id = :'ORG_ID'
  AND p.user_id IN (
    SELECT user_id FROM memberships WHERE org_id = :'ORG_ID'
  );

-- Проверка 4: Telegram group admins
SELECT 
  'Telegram Group Admins' as check_type,
  tga.tg_user_id,
  tga.is_owner,
  tga.is_admin,
  tga.custom_title,
  tg.title as group_title,
  tga.expires_at
FROM telegram_group_admins tga
INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
WHERE otg.org_id = :'ORG_ID'
  AND tga.expires_at > NOW()
ORDER BY tga.is_owner DESC, tga.is_admin DESC;

