-- Migration 069: Handle Telegram chat_id migration
-- When a group becomes supergroup, Telegram changes chat_id from -XXXXX to -100XXXXXXXXXX
-- We need to detect this and merge the old record with the new one

-- Create function to migrate chat_id
CREATE OR REPLACE FUNCTION migrate_telegram_chat_id(
  old_chat_id BIGINT,
  new_chat_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_old_group_id BIGINT;
  v_new_group_id BIGINT;
  v_moved_orgs INT := 0;
  v_moved_admins INT := 0;
  v_moved_participants INT := 0;
  v_moved_activities INT := 0;
BEGIN
  -- Проверяем, что оба chat_id существуют
  SELECT id INTO v_old_group_id FROM telegram_groups WHERE tg_chat_id = old_chat_id;
  SELECT id INTO v_new_group_id FROM telegram_groups WHERE tg_chat_id = new_chat_id;
  
  IF v_old_group_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Old chat_id not found');
  END IF;
  
  IF v_new_group_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'New chat_id not found');
  END IF;
  
  -- 1. Переносим связи с организациями
  INSERT INTO org_telegram_groups (org_id, tg_chat_id, created_by, created_at)
  SELECT org_id, new_chat_id, created_by, created_at
  FROM org_telegram_groups
  WHERE tg_chat_id = old_chat_id
  ON CONFLICT (org_id, tg_chat_id) DO NOTHING;
  
  GET DIAGNOSTICS v_moved_orgs = ROW_COUNT;
  
  -- 2. Переносим админов
  INSERT INTO telegram_group_admins (
    tg_chat_id, tg_user_id, user_telegram_account_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  )
  SELECT 
    new_chat_id, tg_user_id, user_telegram_account_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  FROM telegram_group_admins
  WHERE tg_chat_id = old_chat_id
  ON CONFLICT (tg_chat_id, tg_user_id) DO UPDATE SET
    user_telegram_account_id = EXCLUDED.user_telegram_account_id,
    is_owner = EXCLUDED.is_owner,
    is_admin = EXCLUDED.is_admin,
    verified_at = EXCLUDED.verified_at,
    expires_at = EXCLUDED.expires_at;
  
  GET DIAGNOSTICS v_moved_admins = ROW_COUNT;
  
  -- 3. Обновляем participant_groups
  UPDATE participant_groups
  SET tg_group_id = new_chat_id
  WHERE tg_group_id = old_chat_id;
  
  GET DIAGNOSTICS v_moved_participants = ROW_COUNT;
  
  -- 4. Обновляем activity_events
  UPDATE activity_events
  SET tg_chat_id = new_chat_id
  WHERE tg_chat_id = old_chat_id;
  
  GET DIAGNOSTICS v_moved_activities = ROW_COUNT;
  
  -- 5. Удаляем старые записи
  DELETE FROM telegram_group_admins WHERE tg_chat_id = old_chat_id;
  DELETE FROM org_telegram_groups WHERE tg_chat_id = old_chat_id;
  DELETE FROM telegram_groups WHERE tg_chat_id = old_chat_id;
  
  -- Возвращаем результат
  v_result := jsonb_build_object(
    'success', true,
    'old_chat_id', old_chat_id,
    'new_chat_id', new_chat_id,
    'moved_orgs', v_moved_orgs,
    'moved_admins', v_moved_admins,
    'moved_participants', v_moved_participants,
    'moved_activities', v_moved_activities
  );
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION migrate_telegram_chat_id(BIGINT, BIGINT) TO authenticated;

COMMENT ON FUNCTION migrate_telegram_chat_id IS 'Migrate data from old chat_id to new chat_id when Telegram group becomes supergroup';

-- Создаем таблицу для отслеживания миграций chat_id
CREATE TABLE IF NOT EXISTS telegram_chat_migrations (
  id SERIAL PRIMARY KEY,
  old_chat_id BIGINT NOT NULL,
  new_chat_id BIGINT NOT NULL,
  migrated_at TIMESTAMPTZ DEFAULT NOW(),
  migration_result JSONB,
  UNIQUE(old_chat_id, new_chat_id)
);

COMMENT ON TABLE telegram_chat_migrations IS 'Track Telegram chat_id migrations when groups become supergroups';



