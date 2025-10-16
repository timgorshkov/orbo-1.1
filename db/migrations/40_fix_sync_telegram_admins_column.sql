-- Исправление функции sync_telegram_admins
-- Ошибка: column otg.telegram_group_id does not exist
-- Проблема: в строке 21 используется неправильное имя колонки
-- Решение: использовать правильное имя колонки из JOIN

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
  -- Получаем все Telegram группы для организации
  -- ИСПРАВЛЕНО: используем правильную колонку tg_chat_id вместо telegram_group_id
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg.id as group_id, otg.org_id
    FROM telegram_groups tg
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id
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

COMMENT ON FUNCTION sync_telegram_admins IS 'Синхронизирует роли админов на основе статуса админа в Telegram группах (исправлено telegram_group_id → tg_group_id)';

