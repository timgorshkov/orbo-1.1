-- Migration: Update sync_telegram_admins to handle admins without user_telegram_accounts
-- Created: 2025-10-19
-- Purpose: Create shadow profiles for Telegram admins who haven't linked their account yet

DO $$
BEGIN
  RAISE NOTICE 'Updating sync_telegram_admins to handle admins without linked accounts...';
END $$;

-- Drop old version
DROP FUNCTION IF EXISTS sync_telegram_admins(UUID);

CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(
  tg_user_id BIGINT,
  action TEXT,
  groups_count INTEGER,
  is_shadow BOOLEAN,
  full_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_record RECORD;
  v_participant RECORD;
  v_user_id UUID;
  v_existing_membership RECORD;
  v_has_email BOOLEAN;
BEGIN
  -- Обрабатываем админов из telegram_group_admins
  FOR v_admin_record IN (
    SELECT DISTINCT
      tga.tg_user_id,
      tga.user_telegram_account_id,
      ARRAY_AGG(DISTINCT tga.tg_chat_id) as tg_chat_ids,
      ARRAY_AGG(DISTINCT tg.title) as group_titles,
      ARRAY_AGG(DISTINCT tga.custom_title) FILTER (WHERE tga.custom_title IS NOT NULL) as custom_titles,
      BOOL_OR(tga.is_owner) as is_owner
    FROM telegram_group_admins tga
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND tga.expires_at > NOW()
    GROUP BY tga.tg_user_id, tga.user_telegram_account_id
  ) LOOP
    
    -- Сценарий 1: У админа есть привязанный user_telegram_account
    IF v_admin_record.user_telegram_account_id IS NOT NULL THEN
      -- Получаем user_id из user_telegram_accounts
      SELECT user_id INTO v_user_id
      FROM user_telegram_accounts
      WHERE id = v_admin_record.user_telegram_account_id;
      
      IF v_user_id IS NULL THEN
        RAISE NOTICE 'Admin telegram_user_id=% has user_telegram_account_id but no user found, skipping', v_admin_record.tg_user_id;
        CONTINUE;
      END IF;
      
      -- Проверяем email
      SELECT (email IS NOT NULL AND email_confirmed_at IS NOT NULL)
      INTO v_has_email
      FROM auth.users
      WHERE id = v_user_id;
      
    -- Сценарий 2: У админа НЕТ привязанного аккаунта - создаём shadow profile
    ELSE
      -- Ищем participant для этого tg_user_id в этой организации
      SELECT * INTO v_participant
      FROM participants p
      WHERE p.org_id = p_org_id 
        AND p.tg_user_id = v_admin_record.tg_user_id
        AND p.merged_into IS NULL
      LIMIT 1;
      
      IF v_participant IS NULL THEN
        RAISE NOTICE 'Admin telegram_user_id=% has no participant record, skipping', v_admin_record.tg_user_id;
        CONTINUE;
      END IF;
      
      -- Проверяем, есть ли уже user_id у participant
      IF v_participant.user_id IS NOT NULL THEN
        v_user_id := v_participant.user_id;
        
        -- Проверяем email
        SELECT (email IS NOT NULL AND email_confirmed_at IS NOT NULL)
        INTO v_has_email
        FROM auth.users
        WHERE id = v_user_id;
      ELSE
        -- Создаём shadow user в auth.users (без email)
        BEGIN
          INSERT INTO auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            NULL, -- NO EMAIL
            '', -- Empty password (can't login with password)
            NULL, -- Email not confirmed
            jsonb_build_object('provider', 'telegram', 'providers', ARRAY['telegram']),
            jsonb_build_object(
              'telegram_user_id', v_admin_record.tg_user_id,
              'full_name', v_participant.full_name,
              'username', v_participant.username,
              'shadow_profile', true
            ),
            false,
            NOW(),
            NOW()
          )
          RETURNING id INTO v_user_id;
          
          -- Обновляем participant с новым user_id
          UPDATE participants p
          SET user_id = v_user_id
          WHERE p.id = v_participant.id;
          
          v_has_email := FALSE;
          
          RAISE NOTICE 'Created shadow user for telegram_user_id=%', v_admin_record.tg_user_id;
          
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Failed to create shadow user for telegram_user_id=%: %', v_admin_record.tg_user_id, SQLERRM;
          CONTINUE;
        END;
      END IF;
    END IF;
    
    -- Теперь у нас есть v_user_id, создаём/обновляем membership
    SELECT * INTO v_existing_membership
    FROM memberships m
    WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
    
    IF v_existing_membership IS NULL THEN
      -- Создаём новый membership
      BEGIN
        INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
        VALUES (
          p_org_id,
          v_user_id,
          CASE WHEN v_admin_record.is_owner THEN 'owner' ELSE 'admin' END,
          'telegram_admin',
          jsonb_build_object(
            'telegram_groups', ARRAY(SELECT unnest(v_admin_record.tg_chat_ids)::TEXT),
            'telegram_group_titles', v_admin_record.group_titles,
            'custom_titles', v_admin_record.custom_titles,
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
        -- Race condition, update instead
        UPDATE memberships m
        SET 
          role = CASE 
            WHEN m.role = 'owner' THEN 'owner'
            WHEN v_admin_record.is_owner THEN 'owner'
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
      END;
    ELSE
      -- Обновляем существующий membership
      UPDATE memberships m
      SET 
        role = CASE 
          WHEN m.role = 'owner' THEN 'owner'
          WHEN v_admin_record.is_owner THEN 'owner'
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
  
  -- Удаляем админов, потерявших права
  -- Только тех, кто получил права через telegram_admin
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
        LEFT JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
        LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id AND p.org_id = p_org_id AND p.merged_into IS NULL
        WHERE 
          (uta.user_id = m.user_id OR p.user_id = m.user_id)
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
    RETURNING m.user_id
  )
  SELECT 
    NULL::BIGINT,
    'removed'::TEXT,
    0::INTEGER,
    FALSE,
    'Removed admin'::TEXT
  FROM deleted_admins;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Successfully updated sync_telegram_admins to handle admins without accounts';
END $$;

