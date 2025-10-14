-- Таблица для одноразовых кодов авторизации через Telegram бота
-- Используется вместо Telegram Login Widget для более надежной авторизации

CREATE TABLE IF NOT EXISTS telegram_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL, -- Одноразовый код (например, "A3F7B2")
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- Организация (может быть NULL для общей авторизации)
  event_id UUID REFERENCES events(id) ON DELETE CASCADE, -- Событие (может быть NULL)
  redirect_url TEXT, -- URL для редиректа после успешной авторизации
  
  -- Статус кода
  is_used BOOLEAN DEFAULT FALSE, -- Код был использован
  used_at TIMESTAMPTZ, -- Когда был использован
  
  -- Данные пользователя после использования кода
  telegram_user_id BIGINT, -- Telegram ID пользователя, который использовал код
  telegram_username TEXT, -- Username пользователя
  
  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- Срок действия кода (обычно 10 минут)
  ip_address TEXT, -- IP адрес при создании кода (для безопасности)
  user_agent TEXT, -- User agent при создании кода
  
  -- Индексы для быстрого поиска
  CONSTRAINT unique_code UNIQUE(code)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_code ON telegram_auth_codes(code) WHERE is_used = FALSE;
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_expires_at ON telegram_auth_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_org_id ON telegram_auth_codes(org_id);
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_event_id ON telegram_auth_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_telegram_user_id ON telegram_auth_codes(telegram_user_id);

-- RLS политики
ALTER TABLE telegram_auth_codes ENABLE ROW LEVEL SECURITY;

-- Политика: только сервисная роль может читать/писать коды
CREATE POLICY "Service role can manage auth codes" ON telegram_auth_codes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Функция для очистки просроченных кодов (вызывается вручную или через cron)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_codes()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_auth_codes
  WHERE expires_at < NOW()
  OR (is_used = TRUE AND used_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарии для документации
COMMENT ON TABLE telegram_auth_codes IS 'Одноразовые коды для авторизации через Telegram бота (замена Telegram Login Widget)';
COMMENT ON COLUMN telegram_auth_codes.code IS 'Одноразовый код, генерируется при запросе авторизации (6-10 символов)';
COMMENT ON COLUMN telegram_auth_codes.org_id IS 'ID организации, если авторизация привязана к организации';
COMMENT ON COLUMN telegram_auth_codes.event_id IS 'ID события, если авторизация для регистрации на событие';
COMMENT ON COLUMN telegram_auth_codes.expires_at IS 'Срок действия кода (обычно 10 минут после создания)';
COMMENT ON FUNCTION cleanup_expired_auth_codes IS 'Удаляет просроченные и старые использованные коды авторизации';

