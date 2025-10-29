-- Migration 067: Create superadmins table
-- Таблица для управления доступом к технической админке платформы

-- Создаём таблицу суперадминов
CREATE TABLE IF NOT EXISTS superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  UNIQUE(user_id),
  UNIQUE(email)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_superadmins_user_id ON superadmins(user_id);
CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
CREATE INDEX IF NOT EXISTS idx_superadmins_is_active ON superadmins(is_active) WHERE is_active = true;

-- Комментарии
COMMENT ON TABLE superadmins IS 'Суперадмины платформы с доступом к технической админке';
COMMENT ON COLUMN superadmins.user_id IS 'ID пользователя из auth.users';
COMMENT ON COLUMN superadmins.email IS 'Email суперадмина';
COMMENT ON COLUMN superadmins.created_by IS 'Кто добавил этого суперадмина';
COMMENT ON COLUMN superadmins.last_login_at IS 'Дата последнего входа в админку';
COMMENT ON COLUMN superadmins.is_active IS 'Активен ли доступ';

-- RLS политики
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;

-- Политика: Суперадмины могут видеть всех суперадминов
CREATE POLICY "Superadmins can view all superadmins"
  ON superadmins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM superadmins sa
      WHERE sa.user_id = auth.uid() AND sa.is_active = true
    )
  );

-- Политика: Суперадмины могут добавлять новых суперадминов
CREATE POLICY "Superadmins can insert superadmins"
  ON superadmins
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM superadmins sa
      WHERE sa.user_id = auth.uid() AND sa.is_active = true
    )
  );

-- Политика: Суперадмины могут обновлять записи
CREATE POLICY "Superadmins can update superadmins"
  ON superadmins
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM superadmins sa
      WHERE sa.user_id = auth.uid() AND sa.is_active = true
    )
  );

-- Добавляем первого суперадмина: timfreelancer@gmail.com
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Ищем пользователя по email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'timfreelancer@gmail.com'
  LIMIT 1;
  
  IF v_user_id IS NOT NULL THEN
    -- Добавляем как суперадмина
    INSERT INTO superadmins (user_id, email, created_by, is_active)
    VALUES (v_user_id, 'timfreelancer@gmail.com', v_user_id, true)
    ON CONFLICT (user_id) DO NOTHING;
    
    RAISE NOTICE '✅ Superadmin added: timfreelancer@gmail.com (user_id: %)', v_user_id;
  ELSE
    RAISE NOTICE '⚠️ User not found: timfreelancer@gmail.com';
  END IF;
END $$;

-- Проверка результата
SELECT 
  'Superadmins count' as check_type,
  COUNT(*) as count
FROM superadmins;

