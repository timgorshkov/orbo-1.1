-- Расширяем таблицу profiles для хранения Telegram ID по организациям
CREATE TABLE IF NOT EXISTS user_telegram_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_code TEXT,
  verification_expires_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Уникальность: один пользователь может иметь только один Telegram ID на организацию
  UNIQUE(user_id, org_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_user_telegram_accounts_tg_id ON user_telegram_accounts(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_user_telegram_accounts_verification ON user_telegram_accounts(verification_code, verification_expires_at);

-- Обновляем таблицу telegram_groups для связи с пользователем через user_telegram_accounts
ALTER TABLE telegram_groups 
ADD COLUMN IF NOT EXISTS verified_by_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMP WITH TIME ZONE;

-- Добавляем ограничение для verification_status если его еще нет
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'telegram_groups_verification_status_check'
  ) THEN
    ALTER TABLE telegram_groups 
    ADD CONSTRAINT telegram_groups_verification_status_check 
    CHECK (verification_status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

-- Таблица для отслеживания админских прав в Telegram группах
CREATE TABLE IF NOT EXISTS telegram_group_admins (
  id BIGSERIAL PRIMARY KEY,
  tg_chat_id BIGINT NOT NULL,
  tg_user_id BIGINT NOT NULL,
  user_telegram_account_id BIGINT REFERENCES user_telegram_accounts(id) ON DELETE CASCADE,
  is_owner BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  can_manage_chat BOOLEAN DEFAULT FALSE,
  can_delete_messages BOOLEAN DEFAULT FALSE,
  can_manage_video_chats BOOLEAN DEFAULT FALSE,
  can_restrict_members BOOLEAN DEFAULT FALSE,
  can_promote_members BOOLEAN DEFAULT FALSE,
  can_change_info BOOLEAN DEFAULT FALSE,
  can_invite_users BOOLEAN DEFAULT FALSE,
  can_pin_messages BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  
  UNIQUE(tg_chat_id, tg_user_id)
);

-- Индексы для telegram_group_admins
CREATE INDEX IF NOT EXISTS idx_telegram_group_admins_chat ON telegram_group_admins(tg_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_group_admins_user ON telegram_group_admins(tg_user_id);

-- Таблица для логирования попыток верификации
CREATE TABLE IF NOT EXISTS telegram_verification_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  telegram_user_id BIGINT,
  verification_code TEXT,
  action TEXT NOT NULL, -- 'request', 'verify', 'expire', 'fail'
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS политики
ALTER TABLE user_telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_group_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_verification_logs ENABLE ROW LEVEL SECURITY;

-- Политики для user_telegram_accounts
DROP POLICY IF EXISTS "user_telegram_accounts_select_policy" ON user_telegram_accounts;
CREATE POLICY "user_telegram_accounts_select_policy" ON user_telegram_accounts
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM memberships m 
      WHERE m.org_id = user_telegram_accounts.org_id 
      AND m.user_id = auth.uid() 
      AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "user_telegram_accounts_insert_policy" ON user_telegram_accounts;
CREATE POLICY "user_telegram_accounts_insert_policy" ON user_telegram_accounts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "user_telegram_accounts_update_policy" ON user_telegram_accounts;
CREATE POLICY "user_telegram_accounts_update_policy" ON user_telegram_accounts
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    auth.role() = 'service_role'
  );

-- Политики для telegram_group_admins
DROP POLICY IF EXISTS "telegram_group_admins_select_policy" ON telegram_group_admins;
CREATE POLICY "telegram_group_admins_select_policy" ON telegram_group_admins
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM user_telegram_accounts uta
      WHERE uta.id = telegram_group_admins.user_telegram_account_id
      AND uta.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "telegram_group_admins_insert_policy" ON telegram_group_admins;
CREATE POLICY "telegram_group_admins_insert_policy" ON telegram_group_admins
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Политики для telegram_verification_logs
DROP POLICY IF EXISTS "telegram_verification_logs_select_policy" ON telegram_verification_logs;
CREATE POLICY "telegram_verification_logs_select_policy" ON telegram_verification_logs
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "telegram_verification_logs_insert_policy" ON telegram_verification_logs;
CREATE POLICY "telegram_verification_logs_insert_policy" ON telegram_verification_logs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    auth.role() = 'service_role'
  );

-- Функция для генерации кода верификации
CREATE OR REPLACE FUNCTION generate_verification_code() RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql;

-- Функция для очистки просроченных кодов верификации
CREATE OR REPLACE FUNCTION cleanup_expired_verifications() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE user_telegram_accounts 
  SET verification_code = NULL, verification_expires_at = NULL
  WHERE verification_expires_at < NOW() AND is_verified = FALSE;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Функция для проверки админских прав в группе
CREATE OR REPLACE FUNCTION check_user_admin_status(
  p_tg_chat_id BIGINT,
  p_tg_user_id BIGINT
) RETURNS TABLE (
  is_owner BOOLEAN,
  is_admin BOOLEAN,
  can_manage_chat BOOLEAN,
  expires_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tga.is_owner,
    tga.is_admin,
    tga.can_manage_chat,
    tga.expires_at
  FROM telegram_group_admins tga
  WHERE tga.tg_chat_id = p_tg_chat_id 
    AND tga.tg_user_id = p_tg_user_id
    AND tga.expires_at > NOW();
END;
$$ LANGUAGE plpgsql;
