-- Обновление функции sync_telegram_admins для использования telegram_group_admins вместо user_group_admin_status
-- Проблема: текущая функция использует старую таблицу user_group_admin_status
-- Решение: использовать telegram_group_admins, которая заполняется через API endpoint update-admin-rights

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
  -- Get all users who are admins in at least one Telegram group for this org
  RETURN QUERY
  WITH telegram_admins AS (
    SELECT DISTINCT
      uta.user_id AS admin_user_id,
      ARRAY_AGG(DISTINCT tg.id) as group_ids,
      ARRAY_AGG(DISTINCT tg.title) as group_titles,
      ARRAY_AGG(DISTINCT tga.custom_title) FILTER (WHERE tga.custom_title IS NOT NULL) as custom_titles
    FROM telegram_group_admins tga
    INNER JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND uta.user_id IS NOT NULL
      AND uta.is_verified = true
      AND tga.expires_at > NOW() -- Только актуальные права
    GROUP BY uta.user_id
  ),
  current_admins AS (
    SELECT 
      m.user_id AS current_user_id,
      m.role,
      m.role_source,
      m.metadata
    FROM memberships m
    WHERE 
      m.org_id = p_org_id 
      AND m.role = 'admin'
      AND m.role_source = 'telegram_admin'
  )
  -- Add new admins
  INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
  SELECT 
    p_org_id,
    ta.admin_user_id,
    'admin',
    'telegram_admin',
    jsonb_build_object(
      'telegram_groups', ta.group_ids,
      'telegram_group_titles', ta.group_titles,
      'custom_titles', ta.custom_titles,
      'synced_at', NOW()
    )
  FROM telegram_admins ta
  LEFT JOIN current_admins ca ON ca.current_user_id = ta.admin_user_id
  WHERE ca.current_user_id IS NULL
  ON CONFLICT (org_id, user_id) 
  DO UPDATE SET
    role = CASE 
      WHEN memberships.role = 'owner' THEN 'owner'  -- Don't downgrade owner
      ELSE 'admin'
    END,
    role_source = CASE 
      WHEN memberships.role = 'owner' THEN memberships.role_source
      ELSE 'telegram_admin'
    END,
    metadata = EXCLUDED.metadata
  RETURNING 
    memberships.user_id,
    'added' as action,
    jsonb_array_length(EXCLUDED.metadata->'telegram_groups') as groups_count;
    
  -- Update existing admins with new group info
  UPDATE memberships m
  SET metadata = jsonb_build_object(
    'telegram_groups', ta.group_ids,
    'telegram_group_titles', ta.group_titles,
    'custom_titles', ta.custom_titles,
    'synced_at', NOW()
  )
  FROM telegram_admins ta
  WHERE 
    m.org_id = p_org_id
    AND m.user_id = ta.admin_user_id
    AND m.role_source = 'telegram_admin';
    
  -- Remove admins who are no longer admins in any group
  DELETE FROM memberships m
  WHERE 
    m.org_id = p_org_id
    AND m.role = 'admin'
    AND m.role_source = 'telegram_admin'
    AND NOT EXISTS (
      SELECT 1 
      FROM telegram_admins ta 
      WHERE ta.admin_user_id = m.user_id
    )
  RETURNING 
    m.user_id,
    'removed' as action,
    0 as groups_count;
END;
$$;

COMMENT ON FUNCTION sync_telegram_admins IS 'Синхронизирует роли админов на основе telegram_group_admins (обновлено для использования новой таблицы с полными правами)';

