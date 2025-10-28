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

-- НЕ обновляем существующих участников автоматически!
-- Поля tg_first_name и tg_last_name будут заполнены автоматически
-- при следующей активности пользователя (сообщение в группе).
-- Это гарантирует, что мы получим НАСТОЯЩИЕ имена из Telegram API,
-- а не неправильно разобранные из редактируемого поля full_name.

-- Если нужно принудительно обновить имена для конкретных участников,
-- можно использовать запрос:
-- UPDATE participants SET tg_first_name = NULL, tg_last_name = NULL WHERE tg_user_id IS NOT NULL;
-- И при следующем сообщении от пользователя имена обновятся автоматически.

