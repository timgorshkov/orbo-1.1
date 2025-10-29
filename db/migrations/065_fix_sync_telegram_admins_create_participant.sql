-- Migration 065: Fix sync_telegram_admins to create participants if needed
-- Created: 2025-10-29
-- Purpose: Ensure sync_telegram_admins creates participants for admins in new orgs

DO $$
BEGIN
  RAISE NOTICE 'Fixing sync_telegram_admins to auto-create participants...';
END $$;

-- Обновляем sync_telegram_admins
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
  RAISE NOTICE 'sync_telegram_admins: Starting for org %', p_org_id;
  
  -- Обрабатываем админов из telegram_group_admins
  FOR v_admin_record IN (
    SELECT DISTINCT
      tga.tg_user_id,
      tga.user_telegram_account_id,
      ARRAY_AGG(DISTINCT tga.tg_chat_id) as tg_chat_ids,
      ARRAY_AGG(DISTINCT tg.title) as group_titles,
      ARRAY_AGG(DISTINCT tga.custom_title) FILTER (WHERE tga.custom_title IS NOT NULL) as custom_titles,
      BOOL_OR(tga.is_owner) as is_owner_in_groups
    FROM telegram_group_admins tga
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND tga.expires_at > NOW()
      -- ✅ Пропускаем известных ботов (на случай, если они уже в базе)
      AND tga.tg_user_id NOT IN (
        8355772450,  -- orbo_community_bot
        777000       -- Telegram Service Notifications
      )
    GROUP BY tga.tg_user_id, tga.user_telegram_account_id
  ) LOOP
    
    -- ✅ Шаг 1: Ищем user_id ГЛОБАЛЬНО
    v_user_id := find_user_id_by_telegram(v_admin_record.tg_user_id);
    
    IF v_user_id IS NOT NULL THEN
      -- ✅ Нашли существующий user_id
      RAISE NOTICE 'Found existing user_id % for tg_user_id %', v_user_id, v_admin_record.tg_user_id;
      
      -- Проверяем наличие email
      SELECT (email IS NOT NULL AND email_confirmed_at IS NOT NULL)
      INTO v_has_email
      FROM auth.users
      WHERE id = v_user_id;
      
      -- ✅ Ищем или создаём participant для этой организации
      SELECT * INTO v_participant
      FROM participants p
      WHERE p.org_id = p_org_id 
        AND p.tg_user_id = v_admin_record.tg_user_id
        AND p.merged_into IS NULL
      LIMIT 1;
      
      IF v_participant IS NULL THEN
        -- ✅ НОВОЕ: Создаём participant, если его нет
        RAISE NOTICE 'Creating participant for existing user % in org %', v_user_id, p_org_id;
        
        -- Получаем имя пользователя из auth.users
        DECLARE
          v_display_name TEXT;
        BEGIN
          SELECT 
            COALESCE(
              (raw_user_meta_data->>'full_name')::TEXT,
              (raw_user_meta_data->>'telegram_first_name')::TEXT,
              email,
              'User ' || v_admin_record.tg_user_id
            )
          INTO v_display_name
          FROM auth.users
          WHERE id = v_user_id;
          
          INSERT INTO participants (
            org_id,
            tg_user_id,
            user_id,
            full_name,
            username,
            source,
            participant_status,
            status
          )
          VALUES (
            p_org_id,
            v_admin_record.tg_user_id,
            v_user_id,
            v_display_name,
            (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = v_user_id),
            'telegram',
            'participant',
            'active'
          )
          RETURNING * INTO v_participant;
          
          RAISE NOTICE 'Created participant % for user %', v_participant.id, v_user_id;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Failed to create participant: %', SQLERRM;
          CONTINUE;
        END;
      ELSE
        -- Обновляем user_id у participant, если его нет
        IF v_participant.user_id IS NULL OR v_participant.user_id != v_user_id THEN
          UPDATE participants p 
          SET user_id = v_user_id 
          WHERE p.id = v_participant.id;
          
          RAISE NOTICE 'Updated participant % with user_id %', v_participant.id, v_user_id;
        END IF;
      END IF;
      
    ELSE
      -- user_id не найден глобально - создаём shadow user
      RAISE NOTICE 'No existing user_id found for tg_user_id %, creating shadow profile', v_admin_record.tg_user_id;
      
      -- ✅ Ищем или создаём participant для этой организации
      SELECT * INTO v_participant
      FROM participants p
      WHERE p.org_id = p_org_id 
        AND p.tg_user_id = v_admin_record.tg_user_id
        AND p.merged_into IS NULL
      LIMIT 1;
      
      IF v_participant IS NULL THEN
        -- ✅ НОВОЕ: Создаём participant из данных group admin
        RAISE NOTICE 'Creating participant for new shadow user, tg_user_id %', v_admin_record.tg_user_id;
        
        INSERT INTO participants (
          org_id,
          tg_user_id,
          full_name,
          source,
          participant_status,
          status
        )
        VALUES (
          p_org_id,
          v_admin_record.tg_user_id,
          'User ' || v_admin_record.tg_user_id, -- Временное имя, обновится при первом сообщении
          'telegram',
          'participant',
          'active'
        )
        RETURNING * INTO v_participant;
        
        RAISE NOTICE 'Created participant % for tg_user_id %', v_participant.id, v_admin_record.tg_user_id;
      END IF;
      
      -- Создаём shadow user
      BEGIN
        INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          NULL, '', NULL,
          jsonb_build_object('provider', 'telegram', 'providers', ARRAY['telegram']),
          jsonb_build_object(
            'telegram_user_id', v_admin_record.tg_user_id,
            'full_name', v_participant.full_name,
            'username', v_participant.username,
            'shadow_profile', true
          ),
          false, NOW(), NOW()
        )
        RETURNING id INTO v_user_id;
        
        UPDATE participants p SET user_id = v_user_id WHERE p.id = v_participant.id;
        v_has_email := FALSE;
        RAISE NOTICE 'Created shadow user % for tg_user_id %', v_user_id, v_admin_record.tg_user_id;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to create shadow user for tg_user_id %: %', v_admin_record.tg_user_id, SQLERRM;
        CONTINUE;
      END;
    END IF;
    
    -- Проверяем существующий membership
    SELECT * INTO v_existing_membership
    FROM memberships m
    WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
    
    IF v_existing_membership IS NULL THEN
      -- ✅ Создаём новый membership ВСЕГДА как admin
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
      -- ✅ Обновляем существующий membership
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
  
  -- Удаляем админов, потерявших права
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
  
  RAISE NOTICE 'sync_telegram_admins: Completed for org %', p_org_id;
END;
$$;

COMMENT ON FUNCTION sync_telegram_admins IS 'Sync admin roles from Telegram groups. Auto-creates participants if needed. Never promotes to org owner!';

DO $$
BEGIN
  RAISE NOTICE 'Migration 065 completed successfully!';
  RAISE NOTICE 'sync_telegram_admins will now auto-create participants for new admins.';
END $$;

