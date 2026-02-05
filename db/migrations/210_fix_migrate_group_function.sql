-- ============================================
-- Fix: Remove invite_link from migrate_group_to_new_chat_id function
-- The invite_link column was removed in migration 071
-- ============================================

-- Drop existing function first
DROP FUNCTION IF EXISTS migrate_group_to_new_chat_id(BIGINT, BIGINT);

-- Recreate function without invite_link references
CREATE OR REPLACE FUNCTION migrate_group_to_new_chat_id(
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
BEGIN
  -- Find old group (can be TEXT or BIGINT format)
  SELECT * INTO v_old_group 
  FROM telegram_groups 
  WHERE tg_chat_id = old_chat_id::TEXT OR tg_chat_id = old_chat_id::TEXT;
  
  IF v_old_group IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Old chat_id not found');
  END IF;
  
  v_old_group_id := v_old_group.id;
  
  -- Check if new group already exists
  SELECT id INTO v_new_group_id 
  FROM telegram_groups 
  WHERE tg_chat_id = new_chat_id::TEXT;
  
  -- If new group doesn't exist, create it with data from old group
  -- Note: invite_link column was removed in migration 071
  IF v_new_group_id IS NULL THEN
    INSERT INTO telegram_groups (
      tg_chat_id, title, bot_status, last_sync_at, member_count, 
      new_members_count, migrated_from
    )
    VALUES (
      new_chat_id::TEXT, 
      v_old_group.title, 
      CASE WHEN v_old_group.bot_status = 'migrated' THEN 'connected' ELSE v_old_group.bot_status END,
      NOW(),
      v_old_group.member_count, 
      v_old_group.new_members_count,
      old_chat_id::TEXT
    )
    RETURNING id INTO v_new_group_id;
  ELSE
    -- Update existing new group with migrated_from reference
    UPDATE telegram_groups 
    SET migrated_from = old_chat_id::TEXT
    WHERE id = v_new_group_id;
  END IF;
  
  -- Mark old group as migrated
  UPDATE telegram_groups 
  SET migrated_to = new_chat_id::TEXT, 
      bot_status = 'migrated'
  WHERE id = v_old_group_id;
  
  -- Move org bindings (upsert to handle conflicts)
  INSERT INTO org_telegram_groups (org_id, tg_chat_id, created_by, created_at)
  SELECT org_id, new_chat_id::TEXT, created_by, created_at
  FROM org_telegram_groups
  WHERE tg_chat_id = old_chat_id::TEXT
  ON CONFLICT (org_id, tg_chat_id) DO NOTHING;
  
  GET DIAGNOSTICS v_moved_orgs = ROW_COUNT;
  
  -- Remove old org bindings
  DELETE FROM org_telegram_groups WHERE tg_chat_id = old_chat_id::TEXT;
  
  -- Move admin records - simplified (user_telegram_account_id removed in migration 071)
  INSERT INTO telegram_group_admins (
    tg_chat_id, tg_user_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  )
  SELECT 
    new_chat_id::TEXT, tg_user_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  FROM telegram_group_admins
  WHERE tg_chat_id = old_chat_id::TEXT
  ON CONFLICT (tg_chat_id, tg_user_id) DO NOTHING;
  
  GET DIAGNOSTICS v_moved_admins = ROW_COUNT;
  
  -- Delete old admin records
  DELETE FROM telegram_group_admins WHERE tg_chat_id = old_chat_id::TEXT;
  
  -- Move participant_groups records
  INSERT INTO participant_groups (participant_id, tg_group_id, is_active, joined_at, left_at)
  SELECT participant_id, new_chat_id::TEXT, is_active, joined_at, left_at
  FROM participant_groups
  WHERE tg_group_id = old_chat_id::TEXT
  ON CONFLICT (participant_id, tg_group_id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    joined_at = LEAST(participant_groups.joined_at, EXCLUDED.joined_at),
    left_at = EXCLUDED.left_at;
  
  GET DIAGNOSTICS v_moved_participants = ROW_COUNT;
  
  -- Delete old participant_groups records
  DELETE FROM participant_groups WHERE tg_group_id = old_chat_id::TEXT;
  
  -- Move activity_events
  UPDATE activity_events SET tg_chat_id = new_chat_id::TEXT WHERE tg_chat_id = old_chat_id::TEXT;
  GET DIAGNOSTICS v_moved_activities = ROW_COUNT;
  
  -- Update participant_messages
  UPDATE participant_messages SET tg_chat_id = new_chat_id::TEXT WHERE tg_chat_id = old_chat_id::TEXT;
  
  RETURN jsonb_build_object(
    'success', true,
    'old_chat_id', old_chat_id,
    'new_chat_id', new_chat_id,
    'old_group_id', v_old_group_id,
    'new_group_id', v_new_group_id,
    'moved_org_bindings', v_moved_orgs,
    'moved_admins', v_moved_admins,
    'moved_participants', v_moved_participants,
    'moved_activities', v_moved_activities
  );
END;
$$;

COMMENT ON FUNCTION migrate_group_to_new_chat_id IS 
'Migrates group data from old chat_id to new chat_id. Updated in migration 210 to remove invite_link references.';

-- Grant execute to necessary roles
GRANT EXECUTE ON FUNCTION migrate_group_to_new_chat_id TO service_role;
