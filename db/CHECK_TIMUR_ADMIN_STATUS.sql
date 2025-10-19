-- Проверка статуса Тимура как админа

-- 1. Проверяем запись в telegram_group_admins
SELECT 
  'telegram_group_admins' as source,
  tga.tg_chat_id,
  tg.title,
  tga.tg_user_id,
  tga.is_admin,
  tga.is_owner,
  tga.custom_title
FROM telegram_group_admins tga
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
WHERE tga.tg_user_id = 5484900079;

-- 2. Проверяем участника Тимура
SELECT 
  'participants' as source,
  p.id,
  p.org_id,
  p.tg_user_id,
  p.full_name,
  p.username,
  p.user_id
FROM participants p
WHERE p.tg_user_id = 5484900079;

-- 3. Проверяем user_telegram_accounts для Тимура
SELECT 
  'user_telegram_accounts' as source,
  uta.user_id,
  uta.telegram_user_id,
  uta.org_id,
  uta.is_verified
FROM user_telegram_accounts uta
WHERE uta.telegram_user_id = 5484900079;

-- 4. Проверяем membership для Тимура
SELECT 
  'memberships' as source,
  m.user_id,
  m.org_id,
  m.role
FROM memberships m
WHERE m.user_id IN (
  SELECT user_id FROM user_telegram_accounts WHERE telegram_user_id = 5484900079
);

-- 5. Проверяем organization_admins view
SELECT 
  'organization_admins' as source,
  oa.*
FROM organization_admins oa
WHERE oa.tg_user_id = 5484900079 
   OR oa.telegram_username = 'timurgolitsyn'
   OR oa.full_name LIKE '%Тимур%';

-- 6. Проверяем metadata в memberships (если есть shadow profile)
SELECT 
  'memberships_metadata' as source,
  m.user_id,
  m.role,
  m.metadata
FROM memberships m
WHERE m.metadata::text LIKE '%5484900079%';

