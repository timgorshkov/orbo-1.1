-- Migration 35: Синхронизация участников для существующих групп
-- Копирует участников из participant_groups в participants для организаций,
-- где группы уже добавлены, но участники не скопированы

DO $$
DECLARE
  v_org_group RECORD;
  v_participant RECORD;
  v_new_participant_id UUID;
  v_existing_participant_id UUID;
  v_total_processed INT := 0;
  v_total_created INT := 0;
  v_total_linked INT := 0;
BEGIN
  RAISE NOTICE 'Starting participant sync for existing org_telegram_groups...';

  -- Проходим по всем связям организация-группа
  FOR v_org_group IN 
    SELECT org_id, tg_chat_id
    FROM org_telegram_groups
    ORDER BY org_id, tg_chat_id
  LOOP
    RAISE NOTICE 'Processing org % group %', v_org_group.org_id, v_org_group.tg_chat_id;

    -- Получаем участников этой группы
    FOR v_participant IN
      SELECT DISTINCT
        p.tg_user_id,
        p.full_name,
        p.username,
        p.phone,
        p.email,
        p.photo_url,
        p.participant_status,
        p.custom_attributes,
        p.bio
      FROM participant_groups pg
      JOIN participants p ON p.id = pg.participant_id
      WHERE pg.tg_group_id = v_org_group.tg_chat_id
        AND p.tg_user_id IS NOT NULL
    LOOP
      v_total_processed := v_total_processed + 1;

      -- Проверяем, есть ли participant в целевой организации
      SELECT id INTO v_existing_participant_id
      FROM participants
      WHERE org_id = v_org_group.org_id
        AND tg_user_id = v_participant.tg_user_id
        AND merged_into IS NULL
      LIMIT 1;

      IF v_existing_participant_id IS NULL THEN
        -- Создаем нового participant
        INSERT INTO participants (
          org_id,
          tg_user_id,
          full_name,
          username,
          phone,
          email,
          photo_url,
          source,
          participant_status,
          custom_attributes,
          bio
        ) VALUES (
          v_org_group.org_id,
          v_participant.tg_user_id,
          v_participant.full_name,
          v_participant.username,
          v_participant.phone,
          v_participant.email,
          v_participant.photo_url,
          'telegram_group',
          COALESCE(v_participant.participant_status, 'participant'),
          COALESCE(v_participant.custom_attributes, '{}'::jsonb),
          v_participant.bio
        )
        RETURNING id INTO v_new_participant_id;

        v_total_created := v_total_created + 1;
        RAISE NOTICE '  Created participant % for org %', v_participant.tg_user_id, v_org_group.org_id;

        -- Создаем связь participant_groups
        INSERT INTO participant_groups (participant_id, tg_group_id)
        VALUES (v_new_participant_id, v_org_group.tg_chat_id)
        ON CONFLICT (participant_id, tg_group_id) DO NOTHING;

        v_total_linked := v_total_linked + 1;
      ELSE
        -- Participant уже существует, проверяем связь
        IF NOT EXISTS (
          SELECT 1 
          FROM participant_groups 
          WHERE participant_id = v_existing_participant_id 
            AND tg_group_id = v_org_group.tg_chat_id
        ) THEN
          -- Добавляем связь
          INSERT INTO participant_groups (participant_id, tg_group_id)
          VALUES (v_existing_participant_id, v_org_group.tg_chat_id)
          ON CONFLICT (participant_id, tg_group_id) DO NOTHING;

          v_total_linked := v_total_linked + 1;
          RAISE NOTICE '  Linked existing participant % to group', v_participant.tg_user_id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Sync completed!';
  RAISE NOTICE 'Total participants processed: %', v_total_processed;
  RAISE NOTICE 'New participants created: %', v_total_created;
  RAISE NOTICE 'Total links created: %', v_total_linked;
  RAISE NOTICE '========================================';
END $$;

-- Создаем индекс для быстрого поиска участников по org_id и tg_user_id
CREATE INDEX IF NOT EXISTS idx_participants_org_tg_user 
ON participants(org_id, tg_user_id) 
WHERE merged_into IS NULL;

COMMENT ON INDEX idx_participants_org_tg_user IS 'Быстрый поиск участников по организации и Telegram ID (только не объединенные)';



