-- Cleanup duplicate "Do it, with Hegai😎" group
-- Old chat_id: -4962287234 (id: 23)
-- New chat_id: -1002855950299 (id: 24)

-- 1. Найдем все связанные данные для старого chat_id
SELECT 'Org links for OLD chat_id' as info, * 
FROM org_telegram_groups 
WHERE tg_chat_id = -4962287234;

SELECT 'Org links for NEW chat_id' as info, * 
FROM org_telegram_groups 
WHERE tg_chat_id = -1002855950299;

SELECT 'Admins for OLD chat_id' as info, * 
FROM telegram_group_admins 
WHERE tg_chat_id = -4962287234;

SELECT 'Admins for NEW chat_id' as info, * 
FROM telegram_group_admins 
WHERE tg_chat_id = -1002855950299;

-- 2. Перенесем связи с организациями со старого на новый chat_id
INSERT INTO org_telegram_groups (org_id, tg_chat_id, created_by, created_at)
SELECT org_id, -1002855950299, created_by, created_at
FROM org_telegram_groups
WHERE tg_chat_id = -4962287234
ON CONFLICT (org_id, tg_chat_id) DO NOTHING;

-- 3. Перенесем админов со старого на новый chat_id
INSERT INTO telegram_group_admins (
  tg_chat_id, tg_user_id, user_telegram_account_id,
  is_owner, is_admin, custom_title,
  can_manage_chat, can_delete_messages, can_manage_video_chats,
  can_restrict_members, can_promote_members, can_change_info,
  can_invite_users, can_pin_messages, can_post_messages,
  can_edit_messages, verified_at, expires_at
)
SELECT 
  -1002855950299, tg_user_id, user_telegram_account_id,
  is_owner, is_admin, custom_title,
  can_manage_chat, can_delete_messages, can_manage_video_chats,
  can_restrict_members, can_promote_members, can_change_info,
  can_invite_users, can_pin_messages, can_post_messages,
  can_edit_messages, verified_at, expires_at
FROM telegram_group_admins
WHERE tg_chat_id = -4962287234
ON CONFLICT (tg_chat_id, tg_user_id) DO UPDATE SET
  user_telegram_account_id = EXCLUDED.user_telegram_account_id,
  is_owner = EXCLUDED.is_owner,
  is_admin = EXCLUDED.is_admin,
  verified_at = EXCLUDED.verified_at,
  expires_at = EXCLUDED.expires_at;

-- 4. Обновим participant_groups если есть ссылки на старый chat_id
UPDATE participant_groups
SET tg_group_id = -1002855950299
WHERE tg_group_id = -4962287234;

-- 5. Обновим activity_events если есть ссылки на старый chat_id  
UPDATE activity_events
SET tg_chat_id = -1002855950299
WHERE tg_chat_id = -4962287234;

-- 6. Удалим старую запись из telegram_groups
DELETE FROM telegram_groups WHERE tg_chat_id = -4962287234;

-- 7. Удалим связи со старым chat_id
DELETE FROM org_telegram_groups WHERE tg_chat_id = -4962287234;
DELETE FROM telegram_group_admins WHERE tg_chat_id = -4962287234;

-- 8. Проверяем результат
SELECT 'RESULT: telegram_groups' as info, * 
FROM telegram_groups 
WHERE title LIKE '%Do it, with Hegai%';

SELECT 'RESULT: org_telegram_groups' as info, COUNT(*) as count
FROM org_telegram_groups 
WHERE tg_chat_id = -1002855950299;



