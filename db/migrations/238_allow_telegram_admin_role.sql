-- =====================================================
-- Migration 238: allow_telegram_admin_role setting
-- =====================================================
-- Добавляет настройку организации, которая управляет тем,
-- получают ли администраторы Telegram-групп роль администратора
-- в организации автоматически.
--
-- Когда allow_telegram_admin_role = false:
--   - Telegram-администраторы НЕ получают admin-доступ
--   - Организация не показывается им в списке пространств
--   - Существующие telegram_admin-членства понижаются до member/удаляются
--   - Ручно добавленные (role_source = 'manual') администраторы не затрагиваются
-- =====================================================

-- 1. Add column to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS allow_telegram_admin_role BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN organizations.allow_telegram_admin_role IS
  'Если true (по умолчанию), админы Telegram-групп автоматически становятся '
  'администраторами организации. Если false — они теряют права при следующей синхронизации.';

-- 2. Replace sync_telegram_admins to respect the new setting
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
  v_allow_tg_admin BOOLEAN;
  v_admin_record RECORD;
  v_user_id UUID;
  v_has_email BOOLEAN;
  v_existing_membership RECORD;
  v_participant RECORD;
BEGIN
  RAISE NOTICE 'Starting sync_telegram_admins for org %', p_org_id;

  -- Read org setting
  SELECT allow_telegram_admin_role
  INTO v_allow_tg_admin
  FROM organizations
  WHERE id = p_org_id;

  -- -------------------------------------------------------
  -- If the feature is DISABLED: downgrade/remove all existing
  -- telegram_admin memberships and exit early.
  -- Manual (invited) admins are NOT touched (role_source != 'telegram_admin').
  -- -------------------------------------------------------
  IF v_allow_tg_admin IS NOT TRUE THEN
    RAISE NOTICE 'allow_telegram_admin_role=false for org %, cleaning up telegram_admin memberships', p_org_id;

    -- Downgrade if user is still a participant in any group
    RETURN QUERY
    WITH downgraded AS (
      UPDATE memberships m
      SET
        role        = 'member',
        role_source = 'telegram_group',
        metadata    = jsonb_build_object(
          'downgraded_from_admin', true,
          'downgraded_at', NOW(),
          'reason', 'allow_telegram_admin_role отключён владельцем',
          'previous_telegram_groups', m.metadata->'telegram_groups'
        )
      WHERE
        m.org_id      = p_org_id
        AND m.role    IN ('admin', 'owner')
        AND m.role_source = 'telegram_admin'
        AND EXISTS (
          SELECT 1 FROM participants p
          WHERE p.org_id = p_org_id
            AND p.user_id = m.user_id
            AND p.merged_into IS NULL
        )
      RETURNING m.user_id
    )
    SELECT
      NULL::BIGINT,
      'downgraded'::TEXT,
      0::INTEGER,
      FALSE,
      'Telegram-admin разжалован (настройка отключена)'::TEXT
    FROM downgraded;

    -- Delete if user is no longer a participant at all
    RETURN QUERY
    WITH deleted AS (
      DELETE FROM memberships m
      WHERE
        m.org_id      = p_org_id
        AND m.role    IN ('admin', 'owner')
        AND m.role_source = 'telegram_admin'
        AND NOT EXISTS (
          SELECT 1 FROM participants p
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
      'Telegram-admin удалён (не участник + настройка отключена)'::TEXT
    FROM deleted;

    RETURN; -- Exit — do not create new admin memberships
  END IF;

  -- -------------------------------------------------------
  -- allow_telegram_admin_role = true: normal sync flow
  -- -------------------------------------------------------

  -- Process each Telegram admin in the org's groups
  FOR v_admin_record IN
    SELECT
      tga.tg_user_id,
      array_agg(DISTINCT tga.tg_chat_id)    AS tg_chat_ids,
      array_agg(DISTINCT tg.title)          AS group_titles,
      array_agg(DISTINCT tga.custom_title)  AS custom_titles,
      bool_or(tga.is_owner)                 AS is_owner_in_groups
    FROM telegram_group_admins tga
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
    INNER JOIN telegram_groups tg      ON tg.tg_chat_id  = tga.tg_chat_id
    WHERE
      otg.org_id      = p_org_id
      AND tga.is_admin = true
      AND tga.expires_at > NOW()
    GROUP BY tga.tg_user_id
  LOOP
    RAISE NOTICE 'Processing tg_user_id=% with % groups',
      v_admin_record.tg_user_id,
      array_length(v_admin_record.tg_chat_ids, 1);

    -- Find participant record
    SELECT * INTO v_participant
    FROM participants p
    WHERE p.org_id = p_org_id
      AND p.tg_user_id = v_admin_record.tg_user_id
      AND p.merged_into IS NULL
    LIMIT 1;

    IF v_participant IS NULL THEN
      RAISE NOTICE 'No participant for tg_user_id=%', v_admin_record.tg_user_id;
      CONTINUE;
    END IF;

    IF v_participant.user_id IS NULL THEN
      RAISE NOTICE 'Participant has no user_id (shadow), tg_user_id=%', v_admin_record.tg_user_id;
      CONTINUE;
    END IF;

    v_user_id := v_participant.user_id;

    -- Check if user has email via profiles table
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
            'telegram_groups',       ARRAY(SELECT unnest(v_admin_record.tg_chat_ids)::TEXT),
            'telegram_group_titles', v_admin_record.group_titles,
            'custom_titles',         v_admin_record.custom_titles,
            'is_owner_in_groups',    v_admin_record.is_owner_in_groups,
            'shadow_profile',        NOT v_has_email,
            'synced_at',             NOW()
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
      -- Update existing membership (protect manually-set owner role)
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
          'telegram_groups',       ARRAY(SELECT unnest(v_admin_record.tg_chat_ids)::TEXT),
          'telegram_group_titles', v_admin_record.group_titles,
          'custom_titles',         v_admin_record.custom_titles,
          'is_owner_in_groups',    v_admin_record.is_owner_in_groups,
          'shadow_profile',        NOT v_has_email,
          'synced_at',             NOW()
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

  -- Downgrade admins who lost Telegram admin rights (but still in a group)
  RETURN QUERY
  WITH downgraded_admins AS (
    UPDATE memberships m
    SET
      role        = 'member',
      role_source = 'telegram_group',
      metadata    = jsonb_build_object(
        'downgraded_from_admin',   true,
        'downgraded_at',           NOW(),
        'previous_telegram_groups', m.metadata->'telegram_groups'
      )
    WHERE
      m.org_id      = p_org_id
      AND m.role    IN ('admin', 'owner')
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1
        FROM telegram_group_admins tga
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id
          AND p.org_id = p_org_id
          AND p.merged_into IS NULL
        WHERE
          p.user_id  = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
      AND EXISTS (
        SELECT 1 FROM participants p
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
    'Разжалован из-за потери прав в Telegram'::TEXT
  FROM downgraded_admins;

  -- Delete memberships of former Telegram admins who are no longer participants
  RETURN QUERY
  WITH deleted_admins AS (
    DELETE FROM memberships m
    WHERE
      m.org_id      = p_org_id
      AND m.role    IN ('admin', 'owner')
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1
        FROM telegram_group_admins tga
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id
          AND p.org_id = p_org_id
          AND p.merged_into IS NULL
        WHERE
          p.user_id  = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
      AND NOT EXISTS (
        SELECT 1 FROM participants p
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
    'Удалён (больше не участник ни одной группы)'::TEXT
  FROM deleted_admins;
END;
$$;

COMMENT ON FUNCTION sync_telegram_admins IS
  'Синхронизирует членства администраторов Telegram-групп. '
  'Учитывает настройку organizations.allow_telegram_admin_role: '
  'если false — понижает/удаляет существующие telegram_admin-членства. '
  'Ручно добавленные (role_source != ''telegram_admin'') не затрагиваются.';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 238: allow_telegram_admin_role column added and sync_telegram_admins updated';
END $$;
