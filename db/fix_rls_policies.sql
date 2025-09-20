-- Отключаем RLS для таблицы activity_events
ALTER TABLE activity_events DISABLE ROW LEVEL SECURITY;

-- Включаем RLS для таблицы activity_events
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- Создаем политику для чтения записей
CREATE POLICY activity_events_select_policy
  ON activity_events
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id = activity_events.org_id
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Создаем политику для вставки записей
CREATE POLICY activity_events_insert_policy
  ON activity_events
  FOR INSERT
  WITH CHECK (true);  -- Разрешаем вставку всем (включая сервисные роли)

-- Создаем политику для обновления записей
CREATE POLICY activity_events_update_policy
  ON activity_events
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id = activity_events.org_id
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Создаем политику для удаления записей
CREATE POLICY activity_events_delete_policy
  ON activity_events
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id = activity_events.org_id AND role = 'admin'
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Проверяем и создаем политики для таблицы group_metrics
ALTER TABLE group_metrics ENABLE ROW LEVEL SECURITY;

-- Создаем политику для чтения записей group_metrics
CREATE POLICY group_metrics_select_policy
  ON group_metrics
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id = group_metrics.org_id
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Создаем политику для вставки записей group_metrics
CREATE POLICY group_metrics_insert_policy
  ON group_metrics
  FOR INSERT
  WITH CHECK (true);  -- Разрешаем вставку всем (включая сервисные роли)

-- Создаем политику для обновления записей group_metrics
CREATE POLICY group_metrics_update_policy
  ON group_metrics
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id = group_metrics.org_id
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Создаем политику для удаления записей group_metrics
CREATE POLICY group_metrics_delete_policy
  ON group_metrics
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id = group_metrics.org_id AND role = 'admin'
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Проверяем и создаем политики для таблицы telegram_updates
ALTER TABLE telegram_updates ENABLE ROW LEVEL SECURITY;

-- Создаем политику для чтения записей telegram_updates
CREATE POLICY telegram_updates_select_policy
  ON telegram_updates
  FOR SELECT
  USING (true);  -- Разрешаем чтение всем

-- Создаем политику для вставки записей telegram_updates
CREATE POLICY telegram_updates_insert_policy
  ON telegram_updates
  FOR INSERT
  WITH CHECK (true);  -- Разрешаем вставку всем (включая сервисные роли)
