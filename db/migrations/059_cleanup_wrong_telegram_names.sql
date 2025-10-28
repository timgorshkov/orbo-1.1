-- Очищаем неправильно заполненные Telegram имена
-- (которые были скопированы из full_name вместо получения из Bot API)

-- Очищаем все tg_first_name и tg_last_name для участников с tg_user_id
-- При следующем сообщении от этих пользователей поля заполнятся правильными данными из Telegram API
UPDATE participants
SET 
  tg_first_name = NULL,
  tg_last_name = NULL
WHERE tg_user_id IS NOT NULL
  AND (tg_first_name IS NOT NULL OR tg_last_name IS NOT NULL);

-- Логируем количество очищенных записей
DO $$
DECLARE
  cleared_count INTEGER;
BEGIN
  GET DIAGNOSTICS cleared_count = ROW_COUNT;
  RAISE NOTICE 'Cleared Telegram names for % participants. They will be auto-filled on next activity.', cleared_count;
END $$;

