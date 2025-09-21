-- Проверяем и исправляем политики RLS для таблицы organizations

-- Включаем RLS для таблицы organizations, если еще не включено
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Удаляем существующие политики для organizations, если они есть
DO $$
BEGIN
  -- Проверяем существование политики и удаляем ее, если она существует
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organizations' AND policyname = 'organizations_select_policy'
  ) THEN
    DROP POLICY IF EXISTS organizations_select_policy ON organizations;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organizations' AND policyname = 'organizations_insert_policy'
  ) THEN
    DROP POLICY IF EXISTS organizations_insert_policy ON organizations;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organizations' AND policyname = 'organizations_update_policy'
  ) THEN
    DROP POLICY IF EXISTS organizations_update_policy ON organizations;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organizations' AND policyname = 'organizations_delete_policy'
  ) THEN
    DROP POLICY IF EXISTS organizations_delete_policy ON organizations;
  END IF;
END
$$;

-- Создаем политику для SELECT: пользователь может видеть организации, в которых он является участником
CREATE POLICY organizations_select_policy ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Создаем политику для INSERT: любой аутентифицированный пользователь может создавать организации
CREATE POLICY organizations_insert_policy ON organizations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Создаем политику для UPDATE: только участники с ролью 'owner' или 'admin' могут обновлять организацию
CREATE POLICY organizations_update_policy ON organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Создаем политику для DELETE: только владельцы могут удалять организацию
CREATE POLICY organizations_delete_policy ON organizations
  FOR DELETE
  USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Проверяем и исправляем политики RLS для таблицы memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Удаляем существующие политики для memberships, если они есть
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'memberships' AND policyname = 'memberships_select_policy'
  ) THEN
    DROP POLICY IF EXISTS memberships_select_policy ON memberships;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'memberships' AND policyname = 'memberships_insert_policy'
  ) THEN
    DROP POLICY IF EXISTS memberships_insert_policy ON memberships;
  END IF;
END
$$;

-- Создаем политику для SELECT: пользователь может видеть членства в организациях, в которых он состоит
CREATE POLICY memberships_select_policy ON memberships
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Создаем политику для INSERT: пользователь может добавлять членства только для организаций, где он владелец или админ
CREATE POLICY memberships_insert_policy ON memberships
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ) OR 
    -- Также разрешаем сервисной роли добавлять членства (для API)
    auth.role() = 'service_role'
  );
