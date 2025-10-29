-- Диагностика Tim Gorshkov (tg_user_id: 154588486)

-- Проверка 1: Participant для Tim
SELECT 
  'Participant для Tim' as check_type,
  p.id,
  p.user_id,
  p.full_name,
  p.tg_user_id,
  p.username,
  p.merged_into
FROM participants p
WHERE p.org_id = '960e2dab-8503-485b-b86c-181d9209f283'
  AND p.tg_user_id = 154588486;

-- Проверка 2: User для Tim (по tg_user_id)
SELECT 
  'User для Tim' as check_type,
  uta.user_id,
  uta.telegram_user_id,
  uta.org_id,
  uta.is_verified,
  u.email
FROM user_telegram_accounts uta
LEFT JOIN auth.users u ON u.id = uta.user_id
WHERE uta.telegram_user_id = 154588486;

-- Проверка 3: Membership для Tim (если есть user_id)
SELECT 
  'Membership для Tim' as check_type,
  m.user_id,
  m.role,
  m.role_source,
  m.org_id
FROM memberships m
WHERE m.user_id IN (
  SELECT user_id FROM user_telegram_accounts WHERE telegram_user_id = 154588486
)
AND m.org_id = '960e2dab-8503-485b-b86c-181d9209f283';

-- Проверка 4: Telegram group admin запись
SELECT 
  'Telegram group admin для Tim' as check_type,
  tga.tg_user_id,
  tga.is_owner,
  tga.is_admin,
  tga.user_telegram_account_id,
  tga.expires_at,
  tg.title
FROM telegram_group_admins tga
INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
WHERE tga.tg_user_id = 154588486
  AND otg.org_id = '960e2dab-8503-485b-b86c-181d9209f283'
  AND tga.expires_at > NOW();

