-- Скрипт для очистки дублей ПЕРЕД применением миграции 39
-- Запустите этот скрипт ВМЕСТО migration 39, он включает все исправления

-- ==============================================================================
-- ШАГ 1: ДИАГНОСТИКА - Найти все дубли
-- ==============================================================================

-- 1.1. Дубли с пустым email (основная проблема)
SELECT 
  'Empty email duplicates' as issue_type,
  org_id, 
  email,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as participant_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM participants
WHERE email = '' AND merged_into IS NULL
GROUP BY org_id, email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 1.2. Дубли с реальным email
SELECT 
  'Real email duplicates' as issue_type,
  org_id, 
  email,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as participant_ids,
  array_agg(tg_user_id ORDER BY created_at) as telegram_ids
FROM participants
WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
GROUP BY org_id, email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 1.3. Дубли по tg_user_id (если есть)
SELECT 
  'Telegram ID duplicates' as issue_type,
  org_id, 
  tg_user_id,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as participant_ids,
  array_agg(email ORDER BY created_at) as emails
FROM participants
WHERE tg_user_id IS NOT NULL AND merged_into IS NULL
GROUP BY org_id, tg_user_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- ==============================================================================
-- ШАГ 2: АВТОМАТИЧЕСКАЯ ОЧИСТКА - Исправление пустых email
-- ==============================================================================

-- Конвертируем пустые строки в NULL
UPDATE participants
SET email = NULL
WHERE email = '' AND merged_into IS NULL;

-- Показываем результат
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Converted % empty emails to NULL', updated_count;
END $$;

-- ==============================================================================
-- ШАГ 3: ПОЛУАВТОМАТИЧЕСКОЕ ОБЪЕДИНЕНИЕ - Дубли по email
-- ==============================================================================

-- Эта функция найдет и объединит дубли по email
-- Canonical = participant с более ранним created_at
DO $$
DECLARE
  r RECORD;
  canonical_id UUID;
  duplicate_id UUID;
  merge_result JSONB;
  total_merged INTEGER := 0;
BEGIN
  RAISE NOTICE '=== Starting automatic merge of email duplicates ===';
  
  FOR r IN 
    SELECT 
      org_id, 
      email,
      array_agg(id ORDER BY created_at) as ids,
      array_agg(created_at ORDER BY created_at) as dates
    FROM participants
    WHERE email IS NOT NULL 
      AND email != '' 
      AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  LOOP
    -- Самый старый = canonical
    canonical_id := r.ids[1];
    
    -- Объединяем все остальные в canonical
    FOR i IN 2..array_length(r.ids, 1) LOOP
      duplicate_id := r.ids[i];
      
      BEGIN
        -- Сначала создаем временную функцию, если её еще нет
        -- (это для случая, если миграция 39 еще не применена)
        IF NOT EXISTS (
          SELECT 1 FROM pg_proc WHERE proname = 'merge_duplicate_participants_temp'
        ) THEN
          -- Создаем упрощенную версию функции объединения
          EXECUTE '
            CREATE OR REPLACE FUNCTION merge_duplicate_participants_temp(
              p_canonical_id UUID,
              p_duplicate_id UUID
            ) RETURNS void AS $func$
            BEGIN
              -- Обновляем canonical недостающими данными
              UPDATE participants p1
              SET 
                email = COALESCE(NULLIF(p1.email, ''''), (SELECT NULLIF(p2.email, '''') FROM participants p2 WHERE p2.id = p_duplicate_id)),
                tg_user_id = COALESCE(p1.tg_user_id, (SELECT p2.tg_user_id FROM participants p2 WHERE p2.id = p_duplicate_id)),
                username = COALESCE(p1.username, (SELECT p2.username FROM participants p2 WHERE p2.id = p_duplicate_id)),
                updated_at = NOW()
              WHERE p1.id = p_canonical_id;
              
              -- Переносим регистрации
              UPDATE event_registrations
              SET participant_id = p_canonical_id
              WHERE participant_id = p_duplicate_id;
              
              -- Помечаем как merged
              UPDATE participants
              SET merged_into = p_canonical_id, updated_at = NOW()
              WHERE id = p_duplicate_id;
            END;
            $func$ LANGUAGE plpgsql;
          ';
        END IF;
        
        -- Объединяем
        EXECUTE format('SELECT merge_duplicate_participants_temp(%L, %L)', canonical_id, duplicate_id);
        
        total_merged := total_merged + 1;
        RAISE NOTICE 'Merged % -> % (email: %)', duplicate_id, canonical_id, r.email;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to merge % -> %: %', duplicate_id, canonical_id, SQLERRM;
      END;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '=== Merge complete. Total merged: % ===', total_merged;
  
  -- Удаляем временную функцию
  DROP FUNCTION IF EXISTS merge_duplicate_participants_temp(UUID, UUID);
END $$;

-- ==============================================================================
-- ШАГ 4: ПРОВЕРКА - Убедиться что дублей не осталось
-- ==============================================================================

DO $$
DECLARE
  email_duplicates INTEGER;
  tg_duplicates INTEGER;
  empty_emails INTEGER;
BEGIN
  -- Проверка 1: Дубли по email
  SELECT COUNT(*) INTO email_duplicates
  FROM (
    SELECT org_id, email
    FROM participants
    WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  ) sub;
  
  -- Проверка 2: Дубли по tg_user_id
  SELECT COUNT(*) INTO tg_duplicates
  FROM (
    SELECT org_id, tg_user_id
    FROM participants
    WHERE tg_user_id IS NOT NULL AND merged_into IS NULL
    GROUP BY org_id, tg_user_id
    HAVING COUNT(*) > 1
  ) sub;
  
  -- Проверка 3: Пустые email
  SELECT COUNT(*) INTO empty_emails
  FROM participants
  WHERE email = '' AND merged_into IS NULL;
  
  RAISE NOTICE '=== Final Check ===';
  RAISE NOTICE 'Email duplicates remaining: %', email_duplicates;
  RAISE NOTICE 'Telegram ID duplicates remaining: %', tg_duplicates;
  RAISE NOTICE 'Empty email strings remaining: %', empty_emails;
  
  IF email_duplicates = 0 AND tg_duplicates = 0 AND empty_emails = 0 THEN
    RAISE NOTICE '✅ All duplicates cleaned! Ready to apply migration 39.';
  ELSE
    IF email_duplicates > 0 THEN
      RAISE WARNING '⚠️  Still have % email duplicates. Review manually.', email_duplicates;
    END IF;
    IF tg_duplicates > 0 THEN
      RAISE WARNING '⚠️  Still have % telegram ID duplicates. Review manually.', tg_duplicates;
    END IF;
    IF empty_emails > 0 THEN
      RAISE WARNING '⚠️  Still have % empty email strings.', empty_emails;
    END IF;
  END IF;
END $$;

-- ==============================================================================
-- ИНФОРМАЦИЯ
-- ==============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== NEXT STEPS ===';
  RAISE NOTICE '1. Review the output above';
  RAISE NOTICE '2. If all checks passed, proceed to apply migration 39_prevent_duplicate_participants_fixed.sql';
  RAISE NOTICE '3. If there are warnings, investigate remaining duplicates manually';
  RAISE NOTICE '';
END $$;

