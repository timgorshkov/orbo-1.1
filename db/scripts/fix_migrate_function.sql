-- =====================================================
-- ИСПРАВЛЕНИЕ ФУНКЦИИ migrate_telegram_chat_id
-- telegram_groups.tg_chat_id = BIGINT
-- org_telegram_groups.tg_chat_id = TEXT
-- telegram_group_admins.tg_chat_id = TEXT  
-- participant_groups.tg_group_id = TEXT
-- activity_events.tg_chat_id = BIGINT
-- =====================================================

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
  v_old_group RECORD;
  v_moved_orgs INT := 0;
  v_moved_admins INT := 0;
  v_moved_participants INT := 0;
  v_moved_activities INT := 0;
  v_old_chat_text TEXT := old_chat_id::TEXT;
  v_new_chat_text TEXT := new_chat_id::TEXT;
BEGIN
  -- Find old group (telegram_groups.tg_chat_id is BIGINT)
  SELECT * INTO v_old_group 
  FROM telegram_groups 
  WHERE tg_chat_id = old_chat_id;
  
  IF v_old_group IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Old chat_id not found', 'old_chat_id', old_chat_id);
  END IF;
  
  v_old_group_id := v_old_group.id;
  
  -- Check if new group already exists (BIGINT comparison)
  SELECT id INTO v_new_group_id 
  FROM telegram_groups 
  WHERE tg_chat_id = new_chat_id;
  
  -- If new group doesn't exist, create it with data from old group
  IF v_new_group_id IS NULL THEN
    INSERT INTO telegram_groups (
      tg_chat_id, title, bot_status, last_sync_at, member_count, 
      new_members_count, invite_link, migrated_from
    )
    VALUES (
      new_chat_id,
      v_old_group.title, 
      CASE WHEN v_old_group.bot_status = 'migrated' THEN 'connected' ELSE v_old_group.bot_status END,
      NOW(),
      v_old_group.member_count, 
      v_old_group.new_members_count,
      v_old_group.invite_link,
      v_old_chat_text
    )
    RETURNING id INTO v_new_group_id;
  ELSE
    -- Update existing new group with migrated_from reference
    UPDATE telegram_groups 
    SET migrated_from = v_old_chat_text
    WHERE id = v_new_group_id;
  END IF;
  
  -- Mark old group as migrated
  UPDATE telegram_groups 
  SET migrated_to = v_new_chat_text, 
      bot_status = 'migrated'
  WHERE id = v_old_group_id;
  
  -- Move org bindings (org_telegram_groups.tg_chat_id is TEXT)
  INSERT INTO org_telegram_groups (org_id, tg_chat_id, created_by, created_at)
  SELECT org_id, v_new_chat_text, created_by, created_at
  FROM org_telegram_groups
  WHERE tg_chat_id = v_old_chat_text
  ON CONFLICT (org_id, tg_chat_id) DO NOTHING;
  
  GET DIAGNOSTICS v_moved_orgs = ROW_COUNT;
  
  DELETE FROM org_telegram_groups WHERE tg_chat_id = v_old_chat_text;
  
  -- Move admin records (telegram_group_admins.tg_chat_id is TEXT)
  INSERT INTO telegram_group_admins (
    tg_chat_id, tg_user_id, user_telegram_account_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  )
  SELECT 
    v_new_chat_text, tg_user_id, user_telegram_account_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  FROM telegram_group_admins
  WHERE tg_chat_id = v_old_chat_text
  ON CONFLICT (tg_chat_id, tg_user_id) DO UPDATE SET
    user_telegram_account_id = EXCLUDED.user_telegram_account_id,
    is_owner = EXCLUDED.is_owner,
    is_admin = EXCLUDED.is_admin,
    verified_at = EXCLUDED.verified_at,
    expires_at = EXCLUDED.expires_at;
  
  GET DIAGNOSTICS v_moved_admins = ROW_COUNT;
  
  DELETE FROM telegram_group_admins WHERE tg_chat_id = v_old_chat_text;
  
  -- Update participant_groups (tg_group_id is TEXT)
  UPDATE participant_groups
  SET tg_group_id = v_new_chat_text
  WHERE tg_group_id = v_old_chat_text;
  
  GET DIAGNOSTICS v_moved_participants = ROW_COUNT;
  
  -- Update activity_events (tg_chat_id is BIGINT)
  UPDATE activity_events
  SET tg_chat_id = new_chat_id
  WHERE tg_chat_id = old_chat_id;
  
  GET DIAGNOSTICS v_moved_activities = ROW_COUNT;
  
  -- Update group_metrics (tg_chat_id is BIGINT)
  UPDATE group_metrics
  SET tg_chat_id = new_chat_id
  WHERE tg_chat_id = old_chat_id;
  
  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'old_chat_id', old_chat_id,
    'new_chat_id', new_chat_id,
    'old_group_id', v_old_group_id,
    'new_group_id', v_new_group_id,
    'moved_orgs', v_moved_orgs,
    'moved_admins', v_moved_admins,
    'moved_participants', v_moved_participants,
    'moved_activities', v_moved_activities
  );
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION migrate_telegram_chat_id(BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_telegram_chat_id(BIGINT, BIGINT) TO service_role;

