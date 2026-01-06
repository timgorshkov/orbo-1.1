-- =====================================================
-- Migration: Fix sync_telegram_admins to not use auth.users
-- =====================================================
-- Purpose: Remove dependency on auth.users table (Supabase-specific)
-- Date: 2025-01-06
--
-- Problem: After migration to self-hosted PostgreSQL, auth.users doesn't exist
--          The function fails with "relation auth.users does not exist"
-- Solution: Use profiles table instead (which mirrors relevant auth.users data)
-- =====================================================

CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(
  tg_user_id BIGINT,
  action TEXT,
  groups_count INT,
  is_shadow BOOLEAN,
  full_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_record RECORD;
  v_user_id UUID;
  v_has_email BOOLEAN;
  v_existing_membership RECORD;
  v_participant RECORD;
BEGIN
  RAISE NOTICE 'Starting sync_telegram_admins for org %', p_org_id;

  -- Process each admin from telegram_group_admins
  FOR v_admin_record IN
    SELECT 
      tga.tg_user_id,
      array_agg(DISTINCT tga.tg_chat_id) as tg_chat_ids,
      array_agg(DISTINCT tg.title) as group_titles,
      array_agg(DISTINCT tga.custom_title) as custom_titles,
      bool_or(tga.is_owner) as is_owner_in_groups
    FROM telegram_group_admins tga
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND tga.expires_at > NOW()
    GROUP BY tga.tg_user_id
  LOOP
    RAISE NOTICE 'Processing tg_user_id=% with % groups', v_admin_record.tg_user_id, array_length(v_admin_record.tg_chat_ids, 1);

    -- Find participant
    SELECT * INTO v_participant
    FROM participants p
    WHERE p.org_id = p_org_id 
      AND p.tg_user_id = v_admin_record.tg_user_id
      AND p.merged_into IS NULL
    LIMIT 1;

    IF v_participant IS NULL THEN
      RAISE NOTICE 'No participant found for tg_user_id=%', v_admin_record.tg_user_id;
      CONTINUE;
    END IF;

    IF v_participant.user_id IS NULL THEN
      RAISE NOTICE 'Participant has no user_id (shadow), tg_user_id=%', v_admin_record.tg_user_id;
      CONTINUE;
    END IF;

    v_user_id := v_participant.user_id;

    -- Check if user has verified email using profiles table
    -- Instead of auth.users, check profiles (which should have email)
    SELECT (email IS NOT NULL AND email != '')
    INTO v_has_email
    FROM profiles
    WHERE id = v_user_id;
    
    IF NOT FOUND THEN
      v_has_email := FALSE;
    END IF;

    -- Check existing membership
    SELECT * INTO v_existing_membership
    FROM memberships m
    WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
    
    IF v_existing_membership IS NULL THEN
      -- Create new admin membership
      BEGIN
        INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
        VALUES (
          p_org_id,
          v_user_id,
          'admin',
          'telegram_admin',
          jsonb_build_object(
            'telegram_groups', ARRAY(SELECT unnest(v_admin_record.tg_chat_ids)::TEXT),
            'telegram_group_titles', v_admin_record.group_titles,
            'custom_titles', v_admin_record.custom_titles,
            'is_owner_in_groups', v_admin_record.is_owner_in_groups,
            'shadow_profile', NOT v_has_email,
            'synced_at', NOW()
          )
        );
        
        RETURN QUERY SELECT 
          v_admin_record.tg_user_id,
          'added'::TEXT,
          array_length(v_admin_record.tg_chat_ids, 1),
          NOT v_has_email,
          COALESCE(v_participant.full_name, 'Unknown');
          
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'Race condition for tg_user_id=%', v_admin_record.tg_user_id;
      END;
    ELSE
      -- Update existing membership
      UPDATE memberships m
      SET 
        role = CASE 
          WHEN m.role = 'owner' AND m.role_source != 'telegram_admin' THEN 'owner'
          ELSE 'admin'
        END,
        role_source = CASE 
          WHEN m.role = 'owner' AND m.role_source != 'telegram_admin' THEN m.role_source
          ELSE 'telegram_admin'
        END,
        metadata = jsonb_build_object(
          'telegram_groups', ARRAY(SELECT unnest(v_admin_record.tg_chat_ids)::TEXT),
          'telegram_group_titles', v_admin_record.group_titles,
          'custom_titles', v_admin_record.custom_titles,
          'is_owner_in_groups', v_admin_record.is_owner_in_groups,
          'shadow_profile', NOT v_has_email,
          'synced_at', NOW()
        )
      WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
      
      RETURN QUERY SELECT 
        v_admin_record.tg_user_id,
        'updated'::TEXT,
        array_length(v_admin_record.tg_chat_ids, 1),
        NOT v_has_email,
        COALESCE(v_participant.full_name, 'Unknown');
    END IF;
  END LOOP;
  
  -- Downgrade admins who lost admin rights to 'member' instead of deleting
  RETURN QUERY
  WITH downgraded_admins AS (
    UPDATE memberships m
    SET 
      role = 'member',
      role_source = 'telegram_group',
      metadata = jsonb_build_object(
        'downgraded_from_admin', true,
        'downgraded_at', NOW(),
        'previous_telegram_groups', m.metadata->'telegram_groups'
      )
    WHERE 
      m.org_id = p_org_id
      AND m.role IN ('admin', 'owner')
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1 
        FROM telegram_group_admins tga
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id AND p.org_id = p_org_id AND p.merged_into IS NULL
        WHERE 
          p.user_id = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
      -- Only downgrade if user still has a participant record (member of group)
      AND EXISTS (
        SELECT 1
        FROM participants p
        WHERE p.org_id = p_org_id
          AND p.user_id = m.user_id
          AND p.merged_into IS NULL
      )
    RETURNING m.user_id, m.role
  )
  SELECT 
    NULL::BIGINT,
    'downgraded'::TEXT,
    0::INTEGER,
    FALSE,
    'Downgraded from admin to member'::TEXT
  FROM downgraded_admins;
  
  -- DELETE memberships only if user is NO LONGER a participant in ANY group
  RETURN QUERY
  WITH deleted_admins AS (
    DELETE FROM memberships m
    WHERE 
      m.org_id = p_org_id
      AND m.role IN ('admin', 'owner')
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1 
        FROM telegram_group_admins tga
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id AND p.org_id = p_org_id AND p.merged_into IS NULL
        WHERE 
          p.user_id = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
      -- Only delete if user is NO LONGER a participant
      AND NOT EXISTS (
        SELECT 1
        FROM participants p
        WHERE p.org_id = p_org_id
          AND p.user_id = m.user_id
          AND p.merged_into IS NULL
      )
    RETURNING m.user_id
  )
  SELECT 
    NULL::BIGINT,
    'removed'::TEXT,
    0::INTEGER,
    FALSE,
    'Removed (no longer in any group)'::TEXT
  FROM deleted_admins;
END;
$$;

COMMENT ON FUNCTION sync_telegram_admins IS 'Синхронизирует админов из Telegram групп. Использует profiles вместо auth.users. При потере прав админа понижает до member.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ sync_telegram_admins updated to use profiles instead of auth.users';
END $$;

