-- Fix migration 43: Ensure telegram_group_admins has all columns
-- This handles cases where table was created by an earlier version

DO $$
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'telegram_group_admins'
  ) THEN
    RAISE NOTICE 'Table telegram_group_admins already exists, checking columns...';
    
    -- Add custom_title if missing
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'telegram_group_admins' 
      AND column_name = 'custom_title'
    ) THEN
      ALTER TABLE telegram_group_admins ADD COLUMN custom_title TEXT;
      RAISE NOTICE 'Added custom_title column';
    END IF;
    
    -- Add can_post_messages if missing
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'telegram_group_admins' 
      AND column_name = 'can_post_messages'
    ) THEN
      ALTER TABLE telegram_group_admins ADD COLUMN can_post_messages BOOLEAN DEFAULT FALSE;
      RAISE NOTICE 'Added can_post_messages column';
    END IF;
    
    -- Add can_edit_messages if missing
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'telegram_group_admins' 
      AND column_name = 'can_edit_messages'
    ) THEN
      ALTER TABLE telegram_group_admins ADD COLUMN can_edit_messages BOOLEAN DEFAULT FALSE;
      RAISE NOTICE 'Added can_edit_messages column';
    END IF;
    
    RAISE NOTICE 'Table telegram_group_admins is up to date';
  ELSE
    RAISE NOTICE 'Table does not exist, will be created by main migration';
  END IF;
END $$;

-- Now run the main migration (safe with IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS telegram_group_admins (
  id SERIAL PRIMARY KEY,
  
  -- Связи
  tg_chat_id BIGINT NOT NULL,
  tg_user_id BIGINT NOT NULL,
  user_telegram_account_id INTEGER REFERENCES user_telegram_accounts(id) ON DELETE CASCADE,
  
  -- Статус администратора
  is_admin BOOLEAN DEFAULT FALSE,
  is_owner BOOLEAN DEFAULT FALSE,
  custom_title TEXT, -- Название должности админа в Telegram
  
  -- Детальные права (из Telegram API)
  can_manage_chat BOOLEAN DEFAULT FALSE,
  can_delete_messages BOOLEAN DEFAULT FALSE,
  can_manage_video_chats BOOLEAN DEFAULT FALSE,
  can_restrict_members BOOLEAN DEFAULT FALSE,
  can_promote_members BOOLEAN DEFAULT FALSE,
  can_change_info BOOLEAN DEFAULT FALSE,
  can_invite_users BOOLEAN DEFAULT FALSE,
  can_pin_messages BOOLEAN DEFAULT FALSE,
  can_post_messages BOOLEAN DEFAULT FALSE,
  can_edit_messages BOOLEAN DEFAULT FALSE,
  
  -- Временные метки
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Уникальность
  UNIQUE(tg_chat_id, tg_user_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_telegram_group_admins_user_account ON telegram_group_admins(user_telegram_account_id);
CREATE INDEX IF NOT EXISTS idx_telegram_group_admins_chat ON telegram_group_admins(tg_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_group_admins_user ON telegram_group_admins(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_group_admins_expires ON telegram_group_admins(expires_at) WHERE is_admin = true;

-- Комментарии
COMMENT ON TABLE telegram_group_admins IS 'Подробная информация о правах администраторов в Telegram-группах с автоматической синхронизацией';
COMMENT ON COLUMN telegram_group_admins.custom_title IS 'Название должности администратора, установленное в Telegram';
COMMENT ON COLUMN telegram_group_admins.expires_at IS 'Время истечения прав (для периодической ресинхронизации)';
COMMENT ON COLUMN telegram_group_admins.user_telegram_account_id IS 'Ссылка на верифицированный Telegram аккаунт пользователя';

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_telegram_group_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS telegram_group_admins_updated_at ON telegram_group_admins;
CREATE TRIGGER telegram_group_admins_updated_at
  BEFORE UPDATE ON telegram_group_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_group_admins_updated_at();

DO $$
BEGIN
  RAISE NOTICE 'Migration 43: telegram_group_admins table is ready';
END $$;

