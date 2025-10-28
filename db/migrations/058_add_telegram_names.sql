-- Добавляем поля для хранения оригинальных имен из Telegram профиля
-- Это НЕ редактируемые поля, они автоматически обновляются при активности пользователя

ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS tg_first_name TEXT,
ADD COLUMN IF NOT EXISTS tg_last_name TEXT;

COMMENT ON COLUMN participants.tg_first_name IS 'Имя пользователя из Telegram профиля (first_name из Bot API, автоматически обновляется)';
COMMENT ON COLUMN participants.tg_last_name IS 'Фамилия пользователя из Telegram профиля (last_name из Bot API, автоматически обновляется)';
COMMENT ON COLUMN participants.full_name IS 'Редактируемое полное имя участника (может отличаться от Telegram имени)';

-- Создаем индекс для поиска по telegram именам
CREATE INDEX IF NOT EXISTS idx_participants_tg_names 
ON participants(tg_first_name, tg_last_name) 
WHERE tg_first_name IS NOT NULL;

-- Обновляем существующих участников: пытаемся разделить full_name на first/last
-- Только для тех, у кого есть tg_user_id (т.е. они из Telegram)
UPDATE participants
SET 
  tg_first_name = CASE 
    WHEN full_name IS NOT NULL AND position(' ' in full_name) > 0 
    THEN split_part(full_name, ' ', 1)
    ELSE full_name
  END,
  tg_last_name = CASE 
    WHEN full_name IS NOT NULL AND position(' ' in full_name) > 0 
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE NULL
  END
WHERE tg_user_id IS NOT NULL 
  AND tg_first_name IS NULL;

