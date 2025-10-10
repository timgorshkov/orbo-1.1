-- Migration 23: Organization Invites for Member Access
-- Система приглашений для доступа участников к организациям

-- 1. Создать таблицу приглашений
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL, -- короткий токен для ссылки (напр. "abc123xyz")
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Настройки доступа
  access_type TEXT NOT NULL CHECK (access_type IN ('full', 'events_only', 'materials_only', 'limited')),
  allowed_materials UUID[], -- массив ID материалов (если limited)
  allowed_events UUID[], -- массив ID событий (если limited)
  
  -- Ограничения
  max_uses INTEGER, -- максимум использований (NULL = неограниченно)
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ, -- дата истечения (NULL = бессрочно)
  
  -- Метаданные
  description TEXT, -- описание приглашения для админа
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Создать таблицу использований приглашений (аудит)
CREATE TABLE IF NOT EXISTS organization_invite_uses (
  id BIGSERIAL PRIMARY KEY,
  invite_id UUID NOT NULL REFERENCES organization_invites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  telegram_user_id BIGINT,
  telegram_username TEXT,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- 3. Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_org ON organization_invites(org_id);
CREATE INDEX IF NOT EXISTS idx_invites_active ON organization_invites(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_invites_expires ON organization_invites(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invite_uses_invite ON organization_invite_uses(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_uses_user ON organization_invite_uses(user_id);

-- 4. Функция для генерации уникального короткого токена
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  token_exists BOOLEAN;
BEGIN
  LOOP
    result := '';
    -- Генерируем токен из 10 символов
    FOR i IN 1..10 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    -- Проверяем уникальность
    SELECT EXISTS(SELECT 1 FROM organization_invites WHERE token = result) INTO token_exists;
    
    EXIT WHEN NOT token_exists;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 5. Функция для проверки валидности приглашения
CREATE OR REPLACE FUNCTION is_invite_valid(p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite
  FROM organization_invites
  WHERE token = p_token
    AND is_active = TRUE;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Проверка истечения срока
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Проверка лимита использований
  IF v_invite.max_uses IS NOT NULL AND v_invite.current_uses >= v_invite.max_uses THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 6. Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_invite_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invite_updated_at ON organization_invites;
CREATE TRIGGER trigger_update_invite_updated_at
BEFORE UPDATE ON organization_invites
FOR EACH ROW
EXECUTE FUNCTION update_invite_updated_at();

-- 7. RLS политики для organization_invites

-- Включаем RLS
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invite_uses ENABLE ROW LEVEL SECURITY;

-- Admins могут создавать приглашения для своих организаций
DROP POLICY IF EXISTS "Admins can create invites" ON organization_invites;
CREATE POLICY "Admins can create invites"
ON organization_invites FOR INSERT
TO authenticated
WITH CHECK (
  org_id IN (
    SELECT org_id FROM memberships 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Admins могут просматривать приглашения своих организаций
DROP POLICY IF EXISTS "Admins can view org invites" ON organization_invites;
CREATE POLICY "Admins can view org invites"
ON organization_invites FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM memberships 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Admins могут обновлять приглашения своих организаций
DROP POLICY IF EXISTS "Admins can update org invites" ON organization_invites;
CREATE POLICY "Admins can update org invites"
ON organization_invites FOR UPDATE
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM memberships 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Admins могут удалять приглашения своих организаций
DROP POLICY IF EXISTS "Admins can delete org invites" ON organization_invites;
CREATE POLICY "Admins can delete org invites"
ON organization_invites FOR DELETE
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM memberships 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Admins могут просматривать использования приглашений
DROP POLICY IF EXISTS "Admins can view invite uses" ON organization_invite_uses;
CREATE POLICY "Admins can view invite uses"
ON organization_invite_uses FOR SELECT
TO authenticated
USING (
  invite_id IN (
    SELECT id FROM organization_invites
    WHERE org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  )
);

-- 8. Комментарии
COMMENT ON TABLE organization_invites IS 'Приглашения для доступа участников к организациям';
COMMENT ON COLUMN organization_invites.access_type IS 'Тип доступа: full (полный), events_only (только события), materials_only (только материалы), limited (ограниченный)';
COMMENT ON COLUMN organization_invites.token IS 'Короткий уникальный токен для ссылки (напр. abc123xyz)';
COMMENT ON COLUMN organization_invites.max_uses IS 'Максимум использований (NULL = неограниченно)';
COMMENT ON COLUMN organization_invites.expires_at IS 'Дата истечения (NULL = бессрочно)';

COMMENT ON TABLE organization_invite_uses IS 'Аудит использований приглашений';
COMMENT ON FUNCTION generate_invite_token IS 'Генерирует уникальный короткий токен для приглашения';
COMMENT ON FUNCTION is_invite_valid IS 'Проверяет валидность приглашения (срок, лимиты, активность)';

-- Готово!

