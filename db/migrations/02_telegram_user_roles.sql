-- Добавляем поле для связи с пользователем, который добавил группу
ALTER TABLE telegram_groups ADD COLUMN added_by_user_id UUID REFERENCES auth.users(id);

-- Таблица для связи пользователя с группами, где он админ
CREATE TABLE user_group_admin_status (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  tg_chat_id BIGINT,
  is_admin BOOLEAN DEFAULT FALSE,
  checked_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tg_chat_id)
);

-- Добавляем поле для хранения telegram_user_id пользователей
ALTER TABLE profiles ADD COLUMN telegram_user_id BIGINT;