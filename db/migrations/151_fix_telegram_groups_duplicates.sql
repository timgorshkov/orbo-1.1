-- Migration 151: Fix Telegram groups duplicates and add unique constraint
-- This migration:
-- 1. Identifies and merges duplicate groups
-- 2. Adds unique constraint on tg_chat_id
-- 3. Adds columns for tracking migrations (migrated_to, migrated_from)
-- 4. Updates bot_status enum to include 'migrated'

-- Step 1: Add new columns for migration tracking (before fixing duplicates)
ALTER TABLE telegram_groups 
ADD COLUMN IF NOT EXISTS migrated_to TEXT,
ADD COLUMN IF NOT EXISTS migrated_from TEXT;

COMMENT ON COLUMN telegram_groups.migrated_to IS 'New chat_id after group was migrated to supergroup';
COMMENT ON COLUMN telegram_groups.migrated_from IS 'Old chat_id before this group was created from migration';

-- Step 2: Create function to safely merge duplicate groups
CREATE OR REPLACE FUNCTION merge_duplicate_telegram_groups()
RETURNS TABLE(
  tg_chat_id TEXT,
  duplicates_merged INT,
  kept_id BIGINT,
  removed_ids BIGINT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_duplicate RECORD;
  v_keep_id BIGINT;
  v_remove_ids BIGINT[];
  v_removed_count INT;
BEGIN
  -- Find all chat_ids with duplicates
  FOR v_duplicate IN 
    SELECT tg.tg_chat_id, array_agg(tg.id ORDER BY 
      -- Prefer: connected > pending > inactive, then by most recent activity
      CASE tg.bot_status 
        WHEN 'connected' THEN 1 
        WHEN 'pending' THEN 2 
        WHEN 'inactive' THEN 3 
        ELSE 4 
      END,
      tg.last_sync_at DESC NULLS LAST,
      tg.id
    ) as ids
    FROM telegram_groups tg
    GROUP BY tg.tg_chat_id
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the first (best) record
    v_keep_id := v_duplicate.ids[1];
    v_remove_ids := v_duplicate.ids[2:array_length(v_duplicate.ids, 1)];
    v_removed_count := array_length(v_remove_ids, 1);
    
    -- Update org_telegram_groups to point to kept record's tg_chat_id
    -- (This handles cases where duplicates might have different org bindings)
    -- Note: org_telegram_groups uses tg_chat_id (text), not id
    
    -- Update telegram_group_admins to point to kept chat_id
    -- (Same as above - uses tg_chat_id)
    
    -- Update participant_groups to point to kept chat_id
    UPDATE participant_groups
    SET tg_group_id = v_duplicate.tg_chat_id
    WHERE tg_group_id IN (
      SELECT tg_chat_id FROM telegram_groups WHERE id = ANY(v_remove_ids)
    )
    AND tg_group_id != v_duplicate.tg_chat_id;
    
    -- Delete duplicate records (keep the best one)
    DELETE FROM telegram_groups WHERE id = ANY(v_remove_ids);
    
    -- Return info about this merge
    tg_chat_id := v_duplicate.tg_chat_id;
    duplicates_merged := v_removed_count;
    kept_id := v_keep_id;
    removed_ids := v_remove_ids;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;

-- Step 3: Run the merge function to clean up existing duplicates
DO $$
DECLARE
  v_result RECORD;
  v_total_merged INT := 0;
BEGIN
  RAISE NOTICE 'Starting duplicate telegram_groups cleanup...';
  
  FOR v_result IN SELECT * FROM merge_duplicate_telegram_groups()
  LOOP
    RAISE NOTICE 'Merged % duplicates for chat_id %, kept id %, removed ids %',
      v_result.duplicates_merged, v_result.tg_chat_id, v_result.kept_id, v_result.removed_ids;
    v_total_merged := v_total_merged + v_result.duplicates_merged;
  END LOOP;
  
  RAISE NOTICE 'Cleanup complete. Total duplicates merged: %', v_total_merged;
END;
$$;

-- Step 4: Add unique constraint on tg_chat_id
-- First drop any existing index that might conflict
DROP INDEX IF EXISTS idx_telegram_groups_tg_chat_id_unique;
DROP INDEX IF EXISTS idx_telegram_groups_chat_id;

-- Create unique index
CREATE UNIQUE INDEX idx_telegram_groups_tg_chat_id_unique 
ON telegram_groups(tg_chat_id);

COMMENT ON INDEX idx_telegram_groups_tg_chat_id_unique IS 'Ensures no duplicate chat_ids in telegram_groups';

-- Step 5: Add indexes for migration tracking
CREATE INDEX IF NOT EXISTS idx_telegram_groups_migrated_to 
ON telegram_groups(migrated_to) 
WHERE migrated_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_groups_migrated_from 
ON telegram_groups(migrated_from) 
WHERE migrated_from IS NOT NULL;

-- Step 6: Update the migrate_telegram_chat_id function to also set migrated_to/migrated_from
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
  IF v_new_group_id IS NULL THEN
    INSERT INTO telegram_groups (
      tg_chat_id, title, bot_status, last_sync_at, member_count, 
      new_members_count, invite_link, migrated_from
    )
    VALUES (
      new_chat_id::TEXT, 
      v_old_group.title, 
      CASE WHEN v_old_group.bot_status = 'migrated' THEN 'connected' ELSE v_old_group.bot_status END,
      NOW(),
      v_old_group.member_count, 
      v_old_group.new_members_count,
      v_old_group.invite_link,
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
  
  -- Move admin records (upsert to handle conflicts)
  INSERT INTO telegram_group_admins (
    tg_chat_id, tg_user_id, user_telegram_account_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  )
  SELECT 
    new_chat_id::TEXT, tg_user_id, user_telegram_account_id,
    is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  FROM telegram_group_admins
  WHERE tg_chat_id = old_chat_id::TEXT
  ON CONFLICT (tg_chat_id, tg_user_id) DO UPDATE SET
    user_telegram_account_id = EXCLUDED.user_telegram_account_id,
    is_owner = EXCLUDED.is_owner,
    is_admin = EXCLUDED.is_admin,
    verified_at = EXCLUDED.verified_at,
    expires_at = EXCLUDED.expires_at;
  
  GET DIAGNOSTICS v_moved_admins = ROW_COUNT;
  
  -- Remove old admin records
  DELETE FROM telegram_group_admins WHERE tg_chat_id = old_chat_id::TEXT;
  
  -- Update participant_groups
  UPDATE participant_groups
  SET tg_group_id = new_chat_id::TEXT
  WHERE tg_group_id = old_chat_id::TEXT;
  
  GET DIAGNOSTICS v_moved_participants = ROW_COUNT;
  
  -- Update activity_events
  UPDATE activity_events
  SET tg_chat_id = new_chat_id
  WHERE tg_chat_id = old_chat_id;
  
  GET DIAGNOSTICS v_moved_activities = ROW_COUNT;
  
  -- Update group_metrics
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
GRANT EXECUTE ON FUNCTION merge_duplicate_telegram_groups() TO service_role;

COMMENT ON FUNCTION migrate_telegram_chat_id IS 'Migrate data from old chat_id to new chat_id when Telegram group becomes supergroup. Updates all related tables and marks old group as migrated.';

-- Step 7: Add helper function to resolve migrated chat_ids
CREATE OR REPLACE FUNCTION resolve_telegram_chat_id(p_chat_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_resolved TEXT;
BEGIN
  -- Check if this chat_id was migrated to a new one
  SELECT migrated_to INTO v_resolved
  FROM telegram_groups
  WHERE tg_chat_id = p_chat_id
  AND migrated_to IS NOT NULL;
  
  -- If found migration, return new chat_id, otherwise return original
  RETURN COALESCE(v_resolved, p_chat_id);
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_telegram_chat_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_telegram_chat_id(TEXT) TO service_role;

COMMENT ON FUNCTION resolve_telegram_chat_id IS 'Returns the current/active chat_id for a group, resolving any migrations';

