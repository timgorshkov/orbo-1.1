-- Migration 36: Миграция регистраций событий с merged участников на canonical
-- Переносит event_registrations с объединенных участников на основные записи

DO $$
DECLARE
  v_registration RECORD;
  v_canonical_id UUID;
  v_existing_registration_id UUID;
  v_total_processed INT := 0;
  v_total_migrated INT := 0;
  v_total_deleted INT := 0;
BEGIN
  RAISE NOTICE 'Starting event_registrations migration from merged participants...';

  -- Находим все регистрации на merged участников
  FOR v_registration IN
    SELECT 
      er.id AS registration_id,
      er.event_id,
      er.participant_id AS old_participant_id,
      er.registered_at,
      er.status,
      er.registration_source,
      p.merged_into AS canonical_id
    FROM event_registrations er
    JOIN participants p ON p.id = er.participant_id
    WHERE p.merged_into IS NOT NULL
    ORDER BY er.event_id, er.registered_at
  LOOP
    v_total_processed := v_total_processed + 1;
    v_canonical_id := v_registration.canonical_id;

    RAISE NOTICE 'Processing registration % (event: %, old participant: % -> canonical: %)',
      v_registration.registration_id,
      v_registration.event_id,
      v_registration.old_participant_id,
      v_canonical_id;

    -- Проверяем, есть ли уже регистрация canonical участника на это событие
    SELECT id INTO v_existing_registration_id
    FROM event_registrations
    WHERE event_id = v_registration.event_id
      AND participant_id = v_canonical_id
      AND status = 'registered'
    LIMIT 1;

    IF v_existing_registration_id IS NOT NULL THEN
      -- Canonical участник уже зарегистрирован - удаляем дубликат
      DELETE FROM event_registrations
      WHERE id = v_registration.registration_id;

      v_total_deleted := v_total_deleted + 1;
      RAISE NOTICE '  Deleted duplicate registration (canonical already registered)';
    ELSE
      -- Переносим регистрацию на canonical участника
      UPDATE event_registrations
      SET participant_id = v_canonical_id
      WHERE id = v_registration.registration_id;

      v_total_migrated := v_total_migrated + 1;
      RAISE NOTICE '  Migrated registration to canonical participant';
    END IF;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration completed!';
  RAISE NOTICE 'Total registrations processed: %', v_total_processed;
  RAISE NOTICE 'Registrations migrated: %', v_total_migrated;
  RAISE NOTICE 'Duplicate registrations deleted: %', v_total_deleted;
  RAISE NOTICE '========================================';
END $$;

-- Добавляем CHECK constraint для предотвращения будущих регистраций merged участников
-- (опционально, можно раскомментировать если нужно жесткое ограничение)
-- ALTER TABLE event_registrations
-- ADD CONSTRAINT check_participant_not_merged
-- CHECK (
--   NOT EXISTS (
--     SELECT 1 FROM participants 
--     WHERE id = participant_id AND merged_into IS NOT NULL
--   )
-- );

COMMENT ON TABLE event_registrations IS 'Регистрации участников на события. Participant_id должен указывать на canonical (не merged) запись.';



