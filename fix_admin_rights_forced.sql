-- ЭКСТРЕННОЕ РУЧНОЕ ИСПРАВЛЕНИЕ
-- Проблема: Тимур Голицын (tg_user_id: 5484900079) остается админом в Test2, 
-- хотя его убрали из админов в Telegram

-- Шаг 1: ВРУЧНУЮ деактивируем Тимура в telegram_group_admins
UPDATE telegram_group_admins
SET 
  is_admin = false,
  is_owner = false,
  verified_at = NOW(),
  expires_at = NOW() - INTERVAL '1 day', -- Истек вчера
  updated_at = NOW()
WHERE tg_user_id = 5484900079
  AND tg_chat_id = -1002994446785;

-- Шаг 2: Вызываем функцию синхронизации для удаления membership
SELECT * FROM sync_telegram_admins('a3e8bc8f-8171-472c-a955-2f7878aed6f1');

-- Шаг 3: Проверяем результат
SELECT 
  m.user_id,
  m.role,
  m.role_source,
  m.metadata->>'telegram_group_titles' as telegram_groups,
  u.email
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  AND m.role = 'admin'
  AND m.role_source = 'telegram_admin';
  
-- Ожидаемый результат: Тимур (tind@mail.ru) НЕ должен быть в списке

COMMENT ON TABLE telegram_group_admins IS 'ВАЖНО: После ручного обновления Тимура нужно понять, почему автоматическая деактивация не сработала';

