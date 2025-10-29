-- Migration 066: Исправление утечки bio и custom_attributes между организациями
-- 
-- Проблема: При добавлении группы в новую организацию система копировала
-- bio и custom_attributes из участников другой организации.
-- 
-- Решение: 
-- 1. Очищаем bio и custom_attributes для участников, которые были добавлены 
--    в новую организацию позже (по created_at)
-- 2. Оставляем данные только в самой старой записи participant для каждого tg_user_id
-- 3. НЕ трогаем записи, где пользователь уже мог отредактировать данные
--    (проверяем, что bio/custom_attributes идентичны в разных org)

DO $$
DECLARE
  v_cleaned_count INT := 0;
  v_participant RECORD;
  v_oldest_record RECORD;
BEGIN
  RAISE NOTICE '🔍 Starting bio/custom_attributes leakage cleanup...';

  -- Находим все tg_user_id, которые существуют в нескольких организациях
  FOR v_participant IN
    SELECT 
      tg_user_id,
      COUNT(DISTINCT org_id) as org_count
    FROM participants
    WHERE tg_user_id IS NOT NULL
      AND (
        (bio IS NOT NULL AND bio != '')
        OR (custom_attributes IS NOT NULL AND custom_attributes != '{}'::jsonb)
      )
    GROUP BY tg_user_id
    HAVING COUNT(DISTINCT org_id) > 1
  LOOP
    RAISE NOTICE '  Processing tg_user_id % (in % orgs)', v_participant.tg_user_id, v_participant.org_count;

    -- Находим самую старую запись для этого tg_user_id
    SELECT id, org_id, bio, custom_attributes, created_at
    INTO v_oldest_record
    FROM participants
    WHERE tg_user_id = v_participant.tg_user_id
    ORDER BY created_at ASC
    LIMIT 1;

    RAISE NOTICE '    Oldest record: org_id=%, created_at=%', v_oldest_record.org_id, v_oldest_record.created_at;

    -- Очищаем bio и custom_attributes в более поздних записях,
    -- только если они ИДЕНТИЧНЫ (т.е. были скопированы)
    UPDATE participants
    SET 
      bio = NULL,
      custom_attributes = '{}'::jsonb
    WHERE tg_user_id = v_participant.tg_user_id
      AND id != v_oldest_record.id
      AND (
        -- Очищаем только если данные идентичны (были скопированы)
        (bio IS NOT DISTINCT FROM v_oldest_record.bio)
        AND (custom_attributes IS NOT DISTINCT FROM v_oldest_record.custom_attributes)
      );

    GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;
    
    IF v_cleaned_count > 0 THEN
      RAISE NOTICE '    ✅ Cleaned % duplicate records for tg_user_id %', v_cleaned_count, v_participant.tg_user_id;
    ELSE
      RAISE NOTICE '    ⏭️  No identical duplicates found (data was edited or empty)';
    END IF;

  END LOOP;

  RAISE NOTICE '✅ Cleanup completed!';
  
  -- Финальная статистика
  RAISE NOTICE '';
  RAISE NOTICE '📊 Final statistics:';
  RAISE NOTICE '  Participants with bio: %', 
    (SELECT COUNT(*) FROM participants WHERE bio IS NOT NULL AND bio != '');
  RAISE NOTICE '  Participants with custom_attributes: %', 
    (SELECT COUNT(*) FROM participants WHERE custom_attributes IS NOT NULL AND custom_attributes != '{}'::jsonb);
  RAISE NOTICE '  Participants in multiple orgs: %',
    (SELECT COUNT(*) FROM (
      SELECT tg_user_id 
      FROM participants 
      WHERE tg_user_id IS NOT NULL 
      GROUP BY tg_user_id 
      HAVING COUNT(DISTINCT org_id) > 1
    ) AS multi_org_users);

END $$;

-- Добавляем комментарий к миграции
COMMENT ON TABLE participants IS 'Participants table - bio and custom_attributes are org-specific (fixed in migration 066)';

