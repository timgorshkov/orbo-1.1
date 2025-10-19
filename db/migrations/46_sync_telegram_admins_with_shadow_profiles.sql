-- Migration: Update sync_telegram_admins to create shadow profiles
-- Created: 2025-10-19
-- Purpose: Automatically create memberships for Telegram admins, marking profiles without email as "shadow"

DO $$
BEGIN
  RAISE NOTICE 'Updating sync_telegram_admins function to support shadow profiles...';
END $$;

-- Drop old version of function (return type changed)
DROP FUNCTION IF EXISTS sync_telegram_admins(UUID);

CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(
  user_id UUID,
  action TEXT,
  groups_count INTEGER,
  is_shadow BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_record RECORD;
  v_has_email BOOLEAN;
  v_user_id UUID;
  v_existing_membership RECORD;
BEGIN
  -- Получаем админов из Telegram
  FOR v_admin_record IN (
    SELECT DISTINCT
      uta.user_id AS admin_user_id,
      uta.telegram_user_id,
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
      AND uta.is_verified = true
      AND tga.expires_at > NOW()
    GROUP BY uta.user_id, uta.telegram_user_id
  ) LOOP
    
    v_user_id := v_admin_record.admin_user_id;
    
    -- Проверяем, есть ли email у пользователя
    SELECT (email IS NOT NULL AND email_confirmed_at IS NOT NULL)
    INTO v_has_email
    FROM auth.users
    WHERE id = v_user_id;
    
    -- Проверяем, есть ли уже membership
    SELECT * INTO v_existing_membership
    FROM memberships m
    WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
    
    IF v_existing_membership IS NULL THEN
      -- Создаём новый membership с отметкой о теневом профиле
      BEGIN
        INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
        VALUES (
          p_org_id,
          v_user_id,
          'admin',
          'telegram_admin',
          jsonb_build_object(
            'telegram_groups', v_admin_record.group_ids,
            'telegram_group_titles', v_admin_record.group_titles,
            'custom_titles', v_admin_record.custom_titles,
            'shadow_profile', NOT v_has_email,
            'synced_at', NOW()
          )
        );
        
        RETURN QUERY SELECT 
          v_user_id,
          'added'::TEXT,
          array_length(v_admin_record.group_ids, 1),
          NOT v_has_email;
          
      EXCEPTION WHEN unique_violation THEN
        -- Если membership уже существует (race condition), обновляем его
        UPDATE memberships m
        SET 
          role = CASE 
            WHEN m.role = 'owner' THEN 'owner'
            ELSE 'admin'
          END,
          role_source = CASE 
            WHEN m.role = 'owner' THEN m.role_source
            ELSE 'telegram_admin'
          END,
          metadata = jsonb_build_object(
            'telegram_groups', v_admin_record.group_ids,
            'telegram_group_titles', v_admin_record.group_titles,
            'custom_titles', v_admin_record.custom_titles,
            'shadow_profile', NOT v_has_email,
            'synced_at', NOW()
          )
        WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
        
        RETURN QUERY SELECT 
          v_user_id,
          'updated'::TEXT,
          array_length(v_admin_record.group_ids, 1),
          NOT v_has_email;
      END;
    ELSE
      -- Обновляем существующий membership
      -- Не понижаем владельца до админа
      UPDATE memberships m
      SET 
        role = CASE 
          WHEN m.role = 'owner' THEN 'owner'
          ELSE 'admin'
        END,
        role_source = CASE 
          WHEN m.role = 'owner' THEN m.role_source
          ELSE 'telegram_admin'
        END,
        metadata = jsonb_build_object(
          'telegram_groups', v_admin_record.group_ids,
          'telegram_group_titles', v_admin_record.group_titles,
          'custom_titles', v_admin_record.custom_titles,
          'shadow_profile', NOT v_has_email,
          'synced_at', NOW()
        )
      WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
      
      RETURN QUERY SELECT 
        v_user_id,
        'updated'::TEXT,
        array_length(v_admin_record.group_ids, 1),
        NOT v_has_email;
    END IF;
  END LOOP;
  
  -- Удаляем админов, потерявших права
  -- Но только тех, кто получил права через telegram_admin
  RETURN QUERY
  WITH deleted_admins AS (
    DELETE FROM memberships m
    WHERE 
      m.org_id = p_org_id
      AND m.role = 'admin'
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1 
        FROM telegram_group_admins tga
        INNER JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        WHERE 
          uta.user_id = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
    RETURNING m.user_id
  )
  SELECT 
    deleted_admins.user_id,
    'removed'::TEXT,
    0::INTEGER,
    FALSE
  FROM deleted_admins;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Successfully updated sync_telegram_admins function';
END $$;

-- Test the function (optional, can be commented out)
DO $$
DECLARE
  test_result RECORD;
BEGIN
  RAISE NOTICE 'Testing sync_telegram_admins function...';
  
  -- Test for each organization that has telegram groups
  FOR test_result IN (
    SELECT DISTINCT org_id 
    FROM org_telegram_groups 
    LIMIT 1
  ) LOOP
    RAISE NOTICE 'Testing for org: %', test_result.org_id;
    
    -- Call the function (result will be visible in logs)
    PERFORM * FROM sync_telegram_admins(test_result.org_id);
  END LOOP;
  
  RAISE NOTICE 'Test completed';
END $$;

