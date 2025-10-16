-- Миграция для предотвращения дублирования участников (ИСПРАВЛЕННАЯ ВЕРСИЯ)
-- Добавляет unique index для защиты от создания дублей по email в рамках одной организации

-- ШАГИ ПРИМЕНЕНИЯ:
-- 1. Сначала выполните диагностические запросы ниже
-- 2. Очистите дубли с пустым email
-- 3. Примените основную миграцию

-- ==============================================================================
-- ДИАГНОСТИКА: Проверка дублей перед применением миграции
-- ==============================================================================

-- 1. Найти дубли с пустым email (основная проблема)
DO $$
DECLARE
  empty_email_duplicates INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO empty_email_duplicates
  FROM (
    SELECT org_id, email, COUNT(*) as cnt
    FROM participants
    WHERE email = '' AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  ) sub;
  
  RAISE NOTICE 'Found % organizations with duplicate empty email participants', empty_email_duplicates;
  
  IF empty_email_duplicates > 0 THEN
    RAISE NOTICE 'Showing duplicate empty emails:';
    FOR r IN 
      SELECT org_id, COUNT(*) as duplicate_count
      FROM participants
      WHERE email = '' AND merged_into IS NULL
      GROUP BY org_id
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
      LIMIT 10
    LOOP
      RAISE NOTICE '  org_id: %, duplicates: %', r.org_id, r.duplicate_count;
    END LOOP;
  END IF;
END $$;

-- 2. Найти дубли с реальным email
DO $$
DECLARE
  real_email_duplicates INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO real_email_duplicates
  FROM (
    SELECT org_id, email, COUNT(*) as cnt
    FROM participants
    WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  ) sub;
  
  RAISE NOTICE 'Found % real email duplicates', real_email_duplicates;
  
  IF real_email_duplicates > 0 THEN
    RAISE NOTICE 'Showing real email duplicates:';
    FOR r IN 
      SELECT org_id, email, COUNT(*) as duplicate_count
      FROM participants
      WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
      GROUP BY org_id, email
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
      LIMIT 10
    LOOP
      RAISE NOTICE '  org_id: %, email: %, duplicates: %', r.org_id, r.email, r.duplicate_count;
    END LOOP;
  END IF;
END $$;

-- ==============================================================================
-- ОЧИСТКА: Исправление дублей с пустым email
-- ==============================================================================

-- Конвертируем пустые строки в NULL
UPDATE participants
SET email = NULL
WHERE email = '' AND merged_into IS NULL;

-- Проверяем результат
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Converted % empty emails to NULL', updated_count;
END $$;

-- ==============================================================================
-- ОСНОВНАЯ МИГРАЦИЯ: Создание unique index и функций
-- ==============================================================================

-- 1. Создаем частичный unique index для email (ИСПРАВЛЕННАЯ ВЕРСИЯ)
-- Применяется только к email, которые:
--   - NOT NULL
--   - Не пустые строки
--   - Не merged участники
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_email_per_org
ON participants (org_id, email)
WHERE email IS NOT NULL 
  AND email != '' 
  AND merged_into IS NULL;

COMMENT ON INDEX idx_participants_unique_email_per_org IS 'Предотвращает создание duplicate participants с одним email в рамках организации (исключая пустые строки и NULL)';

-- 2. Также создаем unique index для tg_user_id (дополнительная защита)
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_tg_user_per_org
ON participants (org_id, tg_user_id)
WHERE tg_user_id IS NOT NULL AND merged_into IS NULL;

COMMENT ON INDEX idx_participants_unique_tg_user_per_org IS 'Предотвращает создание duplicate participants с одним tg_user_id в рамках организации';

-- 3. Создаем функцию для поиска потенциальных дублей
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
  -- Дубли по email (100% совпадение, только реальные email)
  RETURN QUERY
  SELECT 
    p1.id as participant_id_1,
    p2.id as participant_id_2,
    'email_match'::TEXT as match_reason,
    1.0::NUMERIC as confidence,
    jsonb_build_object(
      'email', p1.email,
      'p1_tg_user_id', p1.tg_user_id,
      'p2_tg_user_id', p2.tg_user_id,
      'p1_created_at', p1.created_at,
      'p2_created_at', p2.created_at,
      'p1_source', p1.source,
      'p2_source', p2.source
    ) as details
  FROM participants p1
  JOIN participants p2 ON p1.email = p2.email 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.email IS NOT NULL
    AND p1.email != ''
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL;
  
  -- Дубли по tg_user_id (100% совпадение)
  RETURN QUERY
  SELECT 
    p1.id as participant_id_1,
    p2.id as participant_id_2,
    'telegram_id_match'::TEXT as match_reason,
    1.0::NUMERIC as confidence,
    jsonb_build_object(
      'tg_user_id', p1.tg_user_id,
      'p1_email', p1.email,
      'p2_email', p2.email,
      'p1_created_at', p1.created_at,
      'p2_created_at', p2.created_at,
      'p1_source', p1.source,
      'p2_source', p2.source
    ) as details
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

COMMENT ON FUNCTION find_duplicate_participants IS 'Находит потенциальные дубли участников в организации';

-- 4. Создаем функцию для автоматического объединения дублей
CREATE OR REPLACE FUNCTION merge_duplicate_participants(
  p_canonical_id UUID,
  p_duplicate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_canonical participants%ROWTYPE;
  v_duplicate participants%ROWTYPE;
  v_updated_registrations INTEGER;
  v_transferred_groups INTEGER;
BEGIN
  -- Проверяем, что оба participant существуют и не merged
  SELECT * INTO v_canonical FROM participants WHERE id = p_canonical_id AND merged_into IS NULL;
  SELECT * INTO v_duplicate FROM participants WHERE id = p_duplicate_id AND merged_into IS NULL;
  
  IF v_canonical.id IS NULL THEN
    RAISE EXCEPTION 'Canonical participant % not found or already merged', p_canonical_id;
  END IF;
  
  IF v_duplicate.id IS NULL THEN
    RAISE EXCEPTION 'Duplicate participant % not found or already merged', p_duplicate_id;
  END IF;
  
  IF v_canonical.org_id != v_duplicate.org_id THEN
    RAISE EXCEPTION 'Participants must be in the same organization';
  END IF;
  
  -- Обновляем canonical participant недостающими данными из duplicate
  UPDATE participants
  SET 
    email = COALESCE(NULLIF(email, ''), NULLIF(v_duplicate.email, '')),
    tg_user_id = COALESCE(tg_user_id, v_duplicate.tg_user_id),
    username = COALESCE(username, v_duplicate.username),
    first_name = COALESCE(first_name, v_duplicate.first_name),
    last_name = COALESCE(last_name, v_duplicate.last_name),
    full_name = CASE 
      WHEN full_name IS NULL OR full_name = '' OR full_name = username 
      THEN COALESCE(NULLIF(v_duplicate.full_name, ''), full_name)
      ELSE full_name
    END,
    phone = COALESCE(phone, v_duplicate.phone),
    updated_at = NOW()
  WHERE id = p_canonical_id;
  
  -- Переносим все регистрации на события
  UPDATE event_registrations
  SET participant_id = p_canonical_id
  WHERE participant_id = p_duplicate_id
    AND NOT EXISTS (
      -- Избегаем дублей регистраций на одно событие
      SELECT 1 FROM event_registrations er2
      WHERE er2.participant_id = p_canonical_id
        AND er2.event_id = event_registrations.event_id
    );
  
  GET DIAGNOSTICS v_updated_registrations = ROW_COUNT;
  
  -- Переносим связи с группами (если их еще нет у canonical)
  INSERT INTO participant_groups (participant_id, tg_group_id, joined_at, left_at, is_active)
  SELECT 
    p_canonical_id,
    pg.tg_group_id,
    pg.joined_at,
    pg.left_at,
    pg.is_active
  FROM participant_groups pg
  WHERE pg.participant_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM participant_groups pg2
      WHERE pg2.participant_id = p_canonical_id
        AND pg2.tg_group_id = pg.tg_group_id
    );
  
  GET DIAGNOSTICS v_transferred_groups = ROW_COUNT;
  
  -- Помечаем дубль как merged
  UPDATE participants
  SET 
    merged_into = p_canonical_id,
    updated_at = NOW()
  WHERE id = p_duplicate_id;
  
  v_result = jsonb_build_object(
    'success', true,
    'canonical_id', p_canonical_id,
    'duplicate_id', p_duplicate_id,
    'updated_registrations', v_updated_registrations,
    'transferred_groups', v_transferred_groups,
    'merged_at', NOW()
  );
  
  RAISE NOTICE 'Merged participant % into % (% registrations, % groups transferred)', 
    p_duplicate_id, p_canonical_id, v_updated_registrations, v_transferred_groups;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION merge_duplicate_participants IS 'Объединяет двух участников-дублей, перенося все данные и связи на canonical';

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION find_duplicate_participants TO authenticated;
GRANT EXECUTE ON FUNCTION merge_duplicate_participants TO authenticated;

-- 6. Финальная проверка
DO $$
DECLARE
  remaining_duplicates INTEGER;
BEGIN
  -- Проверяем, остались ли дубли после очистки
  SELECT COUNT(*) INTO remaining_duplicates
  FROM (
    SELECT org_id, email, COUNT(*) as cnt
    FROM participants
    WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  ) sub;
  
  RAISE NOTICE '=== Migration 39: Prevent Duplicate Participants (FIXED) ===';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - Unique index: idx_participants_unique_email_per_org (with empty string check)';
  RAISE NOTICE '  - Unique index: idx_participants_unique_tg_user_per_org (new)';
  RAISE NOTICE '  - Function: find_duplicate_participants(org_id)';
  RAISE NOTICE '  - Function: merge_duplicate_participants(canonical_id, duplicate_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining duplicates: %', remaining_duplicates;
  RAISE NOTICE '';
  
  IF remaining_duplicates > 0 THEN
    RAISE WARNING 'There are still % duplicate participants with real emails!', remaining_duplicates;
    RAISE NOTICE 'Please run find_duplicate_participants() to identify and merge them.';
  ELSE
    RAISE NOTICE '✅ No duplicates found. Migration successful!';
  END IF;
END $$;

