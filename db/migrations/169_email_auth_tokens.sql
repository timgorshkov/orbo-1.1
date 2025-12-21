-- Таблица для одноразовых токенов авторизации по email
-- Замена Supabase Magic Link на собственную реализацию через Unisender Go

CREATE TABLE IF NOT EXISTS email_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) UNIQUE NOT NULL, -- Криптографически безопасный токен
  email TEXT NOT NULL, -- Email пользователя
  
  -- Контекст авторизации (опционально)
  redirect_url TEXT, -- URL для редиректа после успешной авторизации
  
  -- Статус токена
  is_used BOOLEAN DEFAULT FALSE, -- Токен был использован
  used_at TIMESTAMPTZ, -- Когда был использован
  
  -- Данные пользователя после использования
  user_id UUID, -- User ID после успешной авторизации
  
  -- Метаданные безопасности
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- Срок действия (обычно 15 минут)
  ip_address TEXT, -- IP адрес при создании
  user_agent TEXT -- User agent при создании
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_email_auth_tokens_token ON email_auth_tokens(token) WHERE is_used = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_auth_tokens_email ON email_auth_tokens(email);
CREATE INDEX IF NOT EXISTS idx_email_auth_tokens_expires_at ON email_auth_tokens(expires_at);

-- RLS политики (только сервисная роль)
ALTER TABLE email_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Политика: только сервисная роль может управлять токенами
CREATE POLICY "Service role can manage email auth tokens" ON email_auth_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Функция для очистки просроченных токенов
CREATE OR REPLACE FUNCTION cleanup_expired_email_auth_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM email_auth_tokens
  WHERE expires_at < NOW()
  OR (is_used = TRUE AND used_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Обновляем общую функцию очистки чтобы она очищала и telegram, и email токены
CREATE OR REPLACE FUNCTION cleanup_all_expired_auth_tokens()
RETURNS TABLE(telegram_deleted INTEGER, email_deleted INTEGER) AS $$
BEGIN
  SELECT cleanup_expired_auth_codes() INTO telegram_deleted;
  SELECT cleanup_expired_email_auth_tokens() INTO email_deleted;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарии для документации
COMMENT ON TABLE email_auth_tokens IS 'Одноразовые токены для авторизации по email (magic link через Unisender Go)';
COMMENT ON COLUMN email_auth_tokens.token IS 'Криптографически безопасный токен для magic link URL';
COMMENT ON COLUMN email_auth_tokens.email IS 'Email пользователя, на который отправлен magic link';
COMMENT ON COLUMN email_auth_tokens.expires_at IS 'Срок действия токена (15 минут после создания)';
COMMENT ON FUNCTION cleanup_expired_email_auth_tokens IS 'Удаляет просроченные и старые использованные токены авторизации';

