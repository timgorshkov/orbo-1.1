-- Диагностика группы "Do it, with Hegai😎" (chat_id: -4962287234)
-- Запустить через Supabase SQL Editor

-- 1. Проверяем, есть ли группа в telegram_groups
SELECT 
  id,
  tg_chat_id,
  title,
  org_id,
  bot_status,
  analytics_enabled,
  member_count,
  verification_status,
  last_sync_at
FROM telegram_groups
WHERE tg_chat_id = -4962287234;

-- 2. Проверяем права администраторов для этой группы
SELECT 
  tga.id,
  tga.tg_user_id,
  tga.is_admin,
  tga.is_owner,
  tga.verified_at,
  tga.expires_at,
  uta.user_id as linked_user_id,
  uta.telegram_username
FROM telegram_group_admins tga
LEFT JOIN user_telegram_accounts uta ON uta.telegram_user_id = tga.tg_user_id
WHERE tga.tg_chat_id = -4962287234;

-- 3. Проверяем связь с организациями через org_telegram_groups
SELECT 
  otg.org_id,
  otg.tg_chat_id,
  otg.status,
  o.name as org_name
FROM org_telegram_groups otg
LEFT JOIN organizations o ON o.id = otg.org_id
WHERE otg.tg_chat_id = -4962287234;

-- 4. Проверяем активность в этой группе
SELECT 
  ae.id,
  ae.tg_chat_id,
  ae.tg_user_id,
  ae.event_type,
  ae.created_at
FROM activity_events ae
WHERE ae.tg_chat_id = -4962287234
ORDER BY ae.created_at DESC
LIMIT 10;

-- 5. Ищем Telegram аккаунт пользователя alexx_marchuk (telegram_user_id: 423400966)
SELECT 
  uta.id,
  uta.user_id,
  uta.telegram_user_id,
  uta.telegram_username,
  uta.is_verified,
  uta.org_id,
  uta.created_at
FROM user_telegram_accounts uta
WHERE uta.telegram_user_id = 423400966;

-- 5b. Показать ВСЕ верифицированные Telegram аккаунты (для сравнения)
SELECT 
  uta.id,
  uta.user_id,
  uta.telegram_user_id,
  uta.telegram_username,
  uta.is_verified,
  uta.org_id,
  uta.created_at
FROM user_telegram_accounts uta
WHERE uta.is_verified = true
ORDER BY uta.created_at DESC;

-- ИТОГ:
-- Если в telegram_group_admins нет записи для владельца группы,
-- то группа не появится в списке доступных групп!

