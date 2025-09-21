-- Исправляем политики RLS для таблицы memberships, чтобы избежать бесконечной рекурсии

-- Удаляем существующие политики для memberships
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
  
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'memberships' AND policyname = 'memberships_update_policy'
  ) THEN
    DROP POLICY IF EXISTS memberships_update_policy ON memberships;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'memberships' AND policyname = 'memberships_delete_policy'
  ) THEN
    DROP POLICY IF EXISTS memberships_delete_policy ON memberships;
  END IF;
END
$$;

-- Создаем политику для SELECT: пользователь может видеть свои собственные членства
CREATE POLICY memberships_select_policy ON memberships
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    auth.role() = 'service_role'
  );

-- Создаем политику для INSERT: только владельцы и админы могут добавлять новых членов
CREATE POLICY memberships_insert_policy ON memberships
  FOR INSERT
  WITH CHECK (
    (
      -- Проверяем, что пользователь является владельцем или админом организации
      EXISTS (
        SELECT 1 FROM memberships AS m
        WHERE m.org_id = NEW.org_id 
        AND m.user_id = auth.uid() 
        AND m.role IN ('owner', 'admin')
      )
    ) OR 
    -- Также разрешаем сервисной роли добавлять членства
    auth.role() = 'service_role'
  );

-- Создаем политику для UPDATE: только владельцы и админы могут обновлять членства
CREATE POLICY memberships_update_policy ON memberships
  FOR UPDATE
  USING (
    (
      -- Проверяем, что пользователь является владельцем или админом организации
      EXISTS (
        SELECT 1 FROM memberships AS m
        WHERE m.org_id = OLD.org_id 
        AND m.user_id = auth.uid() 
        AND m.role IN ('owner', 'admin')
      )
    ) OR 
    -- Также разрешаем сервисной роли обновлять членства
    auth.role() = 'service_role'
  );

-- Создаем политику для DELETE: только владельцы могут удалять членства
CREATE POLICY memberships_delete_policy ON memberships
  FOR DELETE
  USING (
    (
      -- Проверяем, что пользователь является владельцем организации
      EXISTS (
        SELECT 1 FROM memberships AS m
        WHERE m.org_id = OLD.org_id 
        AND m.user_id = auth.uid() 
        AND m.role = 'owner'
      )
    ) OR 
    -- Также разрешаем сервисной роли удалять членства
    auth.role() = 'service_role'
  );
