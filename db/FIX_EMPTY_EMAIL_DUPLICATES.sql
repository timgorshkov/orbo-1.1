-- СРОЧНОЕ ИСПРАВЛЕНИЕ: Очистка дублей с пустым email перед миграцией
-- Выполните этот скрипт ВМЕСТО миграции 39

-- ==============================================================================
-- ДИАГНОСТИКА: Что именно за дубли?
-- ==============================================================================

-- Посмотрим детали проблемных участников
SELECT 
  id,
  org_id,
  email,
  tg_user_id,
  full_name,
  source,
  created_at,
  LENGTH(email) as email_length,
  email IS NULL as is_null,
  email = '' as is_empty_string,
  CASE 
    WHEN email IS NULL THEN 'NULL'
    WHEN email = '' THEN 'EMPTY STRING'
    ELSE 'HAS VALUE'
  END as email_status
FROM participants
WHERE org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee'
  AND merged_into IS NULL
  AND (email IS NULL OR email = '')
ORDER BY created_at;

-- ==============================================================================
-- РЕШЕНИЕ 1: Объединяем дубли вручную (БЕЗОПАСНЫЙ СПОСОБ)
-- ==============================================================================

-- Находим дубли с пустым/NULL email в проблемной организации
WITH duplicates AS (
  SELECT 
    id,
    created_at,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn,
    tg_user_id,
    email
  FROM participants
  WHERE org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee'
    AND merged_into IS NULL
    AND (email IS NULL OR email = '')
)
SELECT 
  id,
  created_at,
  tg_user_id,
  email,
  CASE 
    WHEN rn = 1 THEN '✅ CANONICAL (keep this one)'
    ELSE '❌ DUPLICATE (will be merged)'
  END as status
FROM duplicates
ORDER BY rn;

-- ==============================================================================
-- РЕШЕНИЕ 2: Автоматическое объединение
-- ==============================================================================

DO $$
DECLARE
  canonical_id UUID;
  duplicate_ids UUID[];
  dup_id UUID;
  total_merged INTEGER := 0;
BEGIN
  -- Находим всех дублей с пустым/NULL email в проблемной организации
  SELECT 
    array_agg(id ORDER BY created_at) 
  INTO duplicate_ids
  FROM participants
  WHERE org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee'
    AND merged_into IS NULL
    AND (email IS NULL OR email = '');
  
  -- Если нашли дубли
  IF array_length(duplicate_ids, 1) > 1 THEN
    -- Первый (самый старый) = canonical
    canonical_id := duplicate_ids[1];
    
    RAISE NOTICE '=== Merging duplicates in org d7e2e580-6b3d-42e2-bee0-4846794f07ee ===';
    RAISE NOTICE 'Canonical participant: %', canonical_id;
    
    -- Объединяем остальные в canonical
    FOR i IN 2..array_length(duplicate_ids, 1) LOOP
      dup_id := duplicate_ids[i];
      
      RAISE NOTICE 'Merging % -> %', dup_id, canonical_id;
      
      -- Обновляем canonical недостающими данными (если есть)
      UPDATE participants p1
      SET 
        tg_user_id = COALESCE(p1.tg_user_id, (SELECT p2.tg_user_id FROM participants p2 WHERE p2.id = dup_id)),
        username = COALESCE(p1.username, (SELECT p2.username FROM participants p2 WHERE p2.id = dup_id)),
        full_name = COALESCE(NULLIF(p1.full_name, ''), (SELECT NULLIF(p2.full_name, '') FROM participants p2 WHERE p2.id = dup_id)),
        first_name = COALESCE(p1.first_name, (SELECT p2.first_name FROM participants p2 WHERE p2.id = dup_id)),
        last_name = COALESCE(p1.last_name, (SELECT p2.last_name FROM participants p2 WHERE p2.id = dup_id)),
        updated_at = NOW()
      WHERE p1.id = canonical_id;
      
      -- Переносим регистрации на события
      UPDATE event_registrations
      SET participant_id = canonical_id
      WHERE participant_id = dup_id
        AND NOT EXISTS (
          SELECT 1 FROM event_registrations er2
          WHERE er2.participant_id = canonical_id
            AND er2.event_id = event_registrations.event_id
        );
      
      -- Переносим связи с группами
      INSERT INTO participant_groups (participant_id, tg_group_id, joined_at, left_at, is_active)
      SELECT 
        canonical_id,
        pg.tg_group_id,
        pg.joined_at,
        pg.left_at,
        pg.is_active
      FROM participant_groups pg
      WHERE pg.participant_id = dup_id
        AND NOT EXISTS (
          SELECT 1 FROM participant_groups pg2
          WHERE pg2.participant_id = canonical_id
            AND pg2.tg_group_id = pg.tg_group_id
        )
      ON CONFLICT DO NOTHING;
      
      -- Помечаем как merged
      UPDATE participants
      SET merged_into = canonical_id, updated_at = NOW()
      WHERE id = dup_id;
      
      total_merged := total_merged + 1;
    END LOOP;
    
    RAISE NOTICE '✅ Successfully merged % duplicates into %', total_merged, canonical_id;
  ELSE
    RAISE NOTICE '✅ No duplicates found (or only one participant)';
  END IF;
END $$;

-- ==============================================================================
-- ПРОВЕРКА: Убедиться что дублей больше нет
-- ==============================================================================

SELECT 
  COUNT(*) as remaining_duplicates_count
FROM participants
WHERE org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee'
  AND merged_into IS NULL
  AND (email IS NULL OR email = '');

-- Должно вернуть: 1 (только canonical остался)

-- ==============================================================================
-- РЕШЕНИЕ 3: Теперь можно создать unique index
-- ==============================================================================

-- Конвертируем оставшиеся пустые строки в NULL (если есть)
UPDATE participants
SET email = NULL
WHERE email = '' AND merged_into IS NULL;

-- Создаем unique index (теперь должно работать)
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_email_per_org
ON participants (org_id, email)
WHERE email IS NOT NULL 
  AND email != '' 
  AND merged_into IS NULL;

-- Также для tg_user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_tg_user_per_org
ON participants (org_id, tg_user_id)
WHERE tg_user_id IS NOT NULL AND merged_into IS NULL;

-- ==============================================================================
-- ФИНАЛЬНАЯ ПРОВЕРКА
-- ==============================================================================

DO $$
DECLARE
  email_dupes INTEGER;
  tg_dupes INTEGER;
BEGIN
  -- Проверяем дубли по email
  SELECT COUNT(*) INTO email_dupes
  FROM (
    SELECT org_id, email
    FROM participants
    WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  ) sub;
  
  -- Проверяем дубли по tg_user_id
  SELECT COUNT(*) INTO tg_dupes
  FROM (
    SELECT org_id, tg_user_id
    FROM participants
    WHERE tg_user_id IS NOT NULL AND merged_into IS NULL
    GROUP BY org_id, tg_user_id
    HAVING COUNT(*) > 1
  ) sub;
  
  RAISE NOTICE '=== FINAL CHECK ===';
  RAISE NOTICE 'Email duplicates: %', email_dupes;
  RAISE NOTICE 'Telegram ID duplicates: %', tg_dupes;
  
  IF email_dupes = 0 AND tg_dupes = 0 THEN
    RAISE NOTICE '✅✅✅ SUCCESS! All duplicates resolved. Indexes created.';
  ELSE
    RAISE WARNING '⚠️  Still have duplicates. Run the diagnostic queries.';
  END IF;
END $$;

-- ==============================================================================
-- ДОПОЛНИТЕЛЬНО: Создаем функции для будущего использования
-- ==============================================================================

-- Функция поиска дублей
CREATE OR REPLACE FUNCTION find_duplicate_participants(p_org_id UUID)
RETURNS TABLE (
  participant_id_1 UUID,
  participant_id_2 UUID,
  match_reason TEXT,
  confidence NUMERIC,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Дубли по email
  RETURN QUERY
  SELECT 
    p1.id,
    p2.id,
    'email_match'::TEXT,
    1.0::NUMERIC,
    jsonb_build_object(
      'email', p1.email,
      'p1_created', p1.created_at,
      'p2_created', p2.created_at
    )
  FROM participants p1
  JOIN participants p2 ON p1.email = p2.email 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.email IS NOT NULL
    AND p1.email != ''
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL;
  
  -- Дубли по tg_user_id
  RETURN QUERY
  SELECT 
    p1.id,
    p2.id,
    'telegram_id_match'::TEXT,
    1.0::NUMERIC,
    jsonb_build_object(
      'tg_user_id', p1.tg_user_id,
      'p1_created', p1.created_at,
      'p2_created', p2.created_at
    )
  FROM participants p1
  JOIN participants p2 ON p1.tg_user_id = p2.tg_user_id 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.tg_user_id IS NOT NULL
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION find_duplicate_participants TO authenticated;

-- Итоговое сообщение
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===========================================';
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - Unique index: idx_participants_unique_email_per_org';
  RAISE NOTICE '  - Unique index: idx_participants_unique_tg_user_per_org';
  RAISE NOTICE '  - Function: find_duplicate_participants(org_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Deploy updated code (event registration fix)';
  RAISE NOTICE '  2. Monitor for new duplicates using find_duplicate_participants()';
  RAISE NOTICE '';
END $$;

