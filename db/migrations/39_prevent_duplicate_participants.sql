-- Миграция для предотвращения дублирования участников
-- Добавляет unique index для защиты от создания дублей по email в рамках одной организации

-- 1. Создаем частичный unique index для email
-- Применяется только к не-NULL email и не-merged участникам
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_email_per_org
ON participants (org_id, email)
WHERE email IS NOT NULL AND merged_into IS NULL;

COMMENT ON INDEX idx_participants_unique_email_per_org IS 'Предотвращает создание duplicate participants с одним email в рамках организации';

-- 2. Создаем функцию для поиска потенциальных дублей
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
  -- Дубли по email (100% совпадение)
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
      'p2_created_at', p2.created_at
    ) as details
  FROM participants p1
  JOIN participants p2 ON p1.email = p2.email 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.email IS NOT NULL
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
      'p2_created_at', p2.created_at
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

-- 3. Создаем функцию для автоматического объединения дублей
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
    email = COALESCE(email, v_duplicate.email),
    tg_user_id = COALESCE(tg_user_id, v_duplicate.tg_user_id),
    username = COALESCE(username, v_duplicate.username),
    first_name = COALESCE(first_name, v_duplicate.first_name),
    last_name = COALESCE(last_name, v_duplicate.last_name),
    full_name = CASE 
      WHEN full_name IS NULL OR full_name = username 
      THEN COALESCE(v_duplicate.full_name, full_name)
      ELSE full_name
    END,
    phone = COALESCE(phone, v_duplicate.phone),
    updated_at = NOW()
  WHERE id = p_canonical_id;
  
  -- Переносим все регистрации на события
  UPDATE event_registrations
  SET participant_id = p_canonical_id
  WHERE participant_id = p_duplicate_id;
  
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
    'merged_at', NOW()
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION merge_duplicate_participants IS 'Объединяет двух участников-дублей, перенося все данные и связи на canonical';

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION find_duplicate_participants TO authenticated;
GRANT EXECUTE ON FUNCTION merge_duplicate_participants TO authenticated;

-- 5. Информация о миграции
DO $$
BEGIN
  RAISE NOTICE '=== Migration 39: Prevent Duplicate Participants ===';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - Unique index: idx_participants_unique_email_per_org';
  RAISE NOTICE '  - Function: find_duplicate_participants(org_id)';
  RAISE NOTICE '  - Function: merge_duplicate_participants(canonical_id, duplicate_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  -- Find duplicates in organization:';
  RAISE NOTICE '  SELECT * FROM find_duplicate_participants(''org-uuid'');';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Merge duplicates:';
  RAISE NOTICE '  SELECT merge_duplicate_participants(''canonical-uuid'', ''duplicate-uuid'');';
END $$;

