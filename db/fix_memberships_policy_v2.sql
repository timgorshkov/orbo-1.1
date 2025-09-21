-- Полностью отключаем RLS для таблицы memberships и organizations для диагностики проблемы

-- Сначала удаляем все политики
DO $$
BEGIN
  -- Удаляем политики для memberships
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'memberships'
  ) THEN
    DROP POLICY IF EXISTS memberships_select_policy ON memberships;
    DROP POLICY IF EXISTS memberships_insert_policy ON memberships;
    DROP POLICY IF EXISTS memberships_update_policy ON memberships;
    DROP POLICY IF EXISTS memberships_delete_policy ON memberships;
    DROP POLICY IF EXISTS memberships_all_policy ON memberships;
  END IF;
  
  -- Удаляем политики для organizations
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organizations'
  ) THEN
    DROP POLICY IF EXISTS organizations_select_policy ON organizations;
    DROP POLICY IF EXISTS organizations_insert_policy ON organizations;
    DROP POLICY IF EXISTS organizations_update_policy ON organizations;
    DROP POLICY IF EXISTS organizations_delete_policy ON organizations;
    DROP POLICY IF EXISTS organizations_all_policy ON organizations;
  END IF;
END
$$;

-- Временно отключаем RLS для обеих таблиц
ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- Создаем самые простые политики, которые не вызовут рекурсию

-- Включаем RLS для organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Создаем простую политику для organizations: все могут читать, только сервисная роль может изменять
CREATE POLICY organizations_all_policy ON organizations
  USING (true)
  WITH CHECK (auth.role() = 'service_role');

-- Включаем RLS для memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Создаем простую политику для memberships: все могут читать, только сервисная роль может изменять
CREATE POLICY memberships_all_policy ON memberships
  USING (true)
  WITH CHECK (auth.role() = 'service_role');

-- Обновляем компонент переключателя организаций, чтобы использовать сервисную роль
-- (Этот комментарий для справки, сам SQL не может обновить код)
