-- Исправление функции sync_telegram_admins для решения проблемы "column reference user_id is ambiguous"
-- Проблема: в функции используется user_id без явного указания таблицы
-- Решение: добавляем префиксы таблиц для всех колонок user_id

CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(
  user_id UUID,
  action TEXT,
  groups_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Получаем всех пользователей, которые являются админами хотя бы в одной Telegram группе для этой организации
  -- Используем explicit table prefixes для избежания ambiguity
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg.id as group_id, otg.org_id
    FROM telegram_groups tg
    INNER JOIN org_telegram_groups otg ON otg.telegram_group_id = tg.id
    WHERE otg.org_id = p_org_id
  ),
  telegram_admins_in_org AS (
    SELECT DISTINCT uta.user_id, COUNT(DISTINCT og.group_id) as admin_groups_count
    FROM user_telegram_accounts uta
    INNER JOIN telegram_admins ta ON ta.telegram_user_id = uta.telegram_user_id
    INNER JOIN org_groups og ON ta.telegram_group_id = og.group_id
    WHERE uta.org_id = p_org_id
      AND uta.is_verified = true
    GROUP BY uta.user_id
    HAVING COUNT(DISTINCT og.group_id) > 0
  )
  -- Обновляем существующих участников до admin, если они админы в Telegram
  UPDATE memberships m
  SET role = 'admin'
  FROM telegram_admins_in_org tao
  WHERE m.user_id = tao.user_id
    AND m.org_id = p_org_id
    AND m.role NOT IN ('owner', 'admin')  -- Не понижаем owner
  RETURNING 
    m.user_id,
    'promoted_to_admin' as action,
    (SELECT admin_groups_count FROM telegram_admins_in_org WHERE user_id = m.user_id) as groups_count;

  -- Понижаем админов, которые больше не админы ни в одной группе
  -- Но НЕ трогаем owner-ов
  RETURN QUERY
  UPDATE memberships m
  SET role = 'member'
  WHERE m.org_id = p_org_id
    AND m.role = 'admin'
    AND m.user_id NOT IN (
      SELECT tao.user_id
      FROM telegram_admins_in_org tao
    )
  RETURNING 
    m.user_id,
    'demoted_to_member' as action,
    0 as groups_count;
END;
$$;

COMMENT ON FUNCTION sync_telegram_admins IS 'Синхронизирует роли админов на основе статуса админа в Telegram группах (исправлено ambiguous user_id)';

