-- ПОЛНОЕ ИСПРАВЛЕНИЕ ВСЕХ ДУБЛЕЙ перед созданием unique indexes
-- Этот скрипт найдет и объединит ВСЕ дубли (по email И по tg_user_id)

-- ==============================================================================
-- ШАГ 1: ДИАГНОСТИКА - Показать все проблемы
-- ==============================================================================

DO $$
DECLARE
  email_dupe_orgs INTEGER;
  tg_dupe_orgs INTEGER;
BEGIN
  -- Подсчет организаций с дублями по email
  SELECT COUNT(DISTINCT org_id) INTO email_dupe_orgs
  FROM (
    SELECT org_id, email
    FROM participants
    WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  ) sub;
  
  -- Подсчет организаций с дублями по tg_user_id
  SELECT COUNT(DISTINCT org_id) INTO tg_dupe_orgs
  FROM (
    SELECT org_id, tg_user_id
    FROM participants
    WHERE tg_user_id IS NOT NULL AND merged_into IS NULL
    GROUP BY org_id, tg_user_id
    HAVING COUNT(*) > 1
  ) sub;
  
  RAISE NOTICE '=== DUPLICATE PARTICIPANTS FOUND ===';
  RAISE NOTICE 'Organizations with email duplicates: %', email_dupe_orgs;
  RAISE NOTICE 'Organizations with telegram_id duplicates: %', tg_dupe_orgs;
  RAISE NOTICE '';
END $$;

-- Детали дублей по email
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== EMAIL DUPLICATES (Top 10) ===';
END $$;

SELECT 
  org_id,
  email,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as participant_ids
FROM participants
WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
GROUP BY org_id, email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;

-- Детали дублей по tg_user_id
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TELEGRAM ID DUPLICATES (Top 10) ===';
END $$;

SELECT 
  org_id,
  tg_user_id,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as participant_ids,
  array_agg(email ORDER BY created_at) as emails
FROM participants
WHERE tg_user_id IS NOT NULL AND merged_into IS NULL
GROUP BY org_id, tg_user_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;

-- ==============================================================================
-- ШАГ 2: АВТОМАТИЧЕСКОЕ ОБЪЕДИНЕНИЕ ВСЕХ ДУБЛЕЙ
-- ==============================================================================

DO $$
DECLARE
  r RECORD;
  canonical_id UUID;
  duplicate_id UUID;
  total_merged INTEGER := 0;
  registrations_moved INTEGER;
  groups_moved INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== STARTING AUTOMATIC MERGE ===';
  RAISE NOTICE '';
  
  -- ========================================
  -- 2.1. Объединяем дубли по EMAIL
  -- ========================================
  RAISE NOTICE '--- Merging EMAIL duplicates ---';
  
  FOR r IN 
    SELECT 
      org_id, 
      email,
      array_agg(id ORDER BY created_at) as ids
    FROM participants
    WHERE email IS NOT NULL 
      AND email != '' 
      AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  LOOP
    canonical_id := r.ids[1]; -- Самый старый
    
    RAISE NOTICE 'Email: %, Canonical: %', r.email, canonical_id;
    
    FOR i IN 2..array_length(r.ids, 1) LOOP
      duplicate_id := r.ids[i];
      
      -- Обновляем canonical недостающими данными
      UPDATE participants p1
      SET 
        tg_user_id = COALESCE(p1.tg_user_id, (SELECT p2.tg_user_id FROM participants p2 WHERE p2.id = duplicate_id)),
        username = COALESCE(p1.username, (SELECT p2.username FROM participants p2 WHERE p2.id = duplicate_id)),
        full_name = COALESCE(NULLIF(p1.full_name, ''), (SELECT NULLIF(p2.full_name, '') FROM participants p2 WHERE p2.id = duplicate_id)),
        first_name = COALESCE(p1.first_name, (SELECT p2.first_name FROM participants p2 WHERE p2.id = duplicate_id)),
        last_name = COALESCE(p1.last_name, (SELECT p2.last_name FROM participants p2 WHERE p2.id = duplicate_id)),
        phone = COALESCE(p1.phone, (SELECT p2.phone FROM participants p2 WHERE p2.id = duplicate_id)),
        updated_at = NOW()
      WHERE p1.id = canonical_id;
      
      -- Переносим регистрации
      UPDATE event_registrations
      SET participant_id = canonical_id
      WHERE participant_id = duplicate_id
        AND NOT EXISTS (
          SELECT 1 FROM event_registrations er2
          WHERE er2.participant_id = canonical_id
            AND er2.event_id = event_registrations.event_id
        );
      
      GET DIAGNOSTICS registrations_moved = ROW_COUNT;
      
      -- Переносим связи с группами
      INSERT INTO participant_groups (participant_id, tg_group_id, joined_at, left_at, is_active)
      SELECT 
        canonical_id,
        pg.tg_group_id,
        pg.joined_at,
        pg.left_at,
        pg.is_active
      FROM participant_groups pg
      WHERE pg.participant_id = duplicate_id
        AND NOT EXISTS (
          SELECT 1 FROM participant_groups pg2
          WHERE pg2.participant_id = canonical_id
            AND pg2.tg_group_id = pg.tg_group_id
        )
      ON CONFLICT DO NOTHING;
      
      GET DIAGNOSTICS groups_moved = ROW_COUNT;
      
      -- Помечаем как merged
      UPDATE participants
      SET merged_into = canonical_id, updated_at = NOW()
      WHERE id = duplicate_id;
      
      total_merged := total_merged + 1;
      RAISE NOTICE '  Merged % -> % (% registrations, % groups)', duplicate_id, canonical_id, registrations_moved, groups_moved;
    END LOOP;
  END LOOP;
  
  -- ========================================
  -- 2.2. Объединяем дубли по TG_USER_ID
  -- ========================================
  RAISE NOTICE '';
  RAISE NOTICE '--- Merging TELEGRAM ID duplicates ---';
  
  FOR r IN 
    SELECT 
      org_id, 
      tg_user_id,
      array_agg(id ORDER BY created_at) as ids
    FROM participants
    WHERE tg_user_id IS NOT NULL 
      AND merged_into IS NULL
    GROUP BY org_id, tg_user_id
    HAVING COUNT(*) > 1
  LOOP
    canonical_id := r.ids[1]; -- Самый старый
    
    RAISE NOTICE 'Telegram ID: %, Canonical: %', r.tg_user_id, canonical_id;
    
    FOR i IN 2..array_length(r.ids, 1) LOOP
      duplicate_id := r.ids[i];
      
      -- Обновляем canonical недостающими данными
      UPDATE participants p1
      SET 
        email = COALESCE(NULLIF(p1.email, ''), (SELECT NULLIF(p2.email, '') FROM participants p2 WHERE p2.id = duplicate_id)),
        username = COALESCE(p1.username, (SELECT p2.username FROM participants p2 WHERE p2.id = duplicate_id)),
        full_name = COALESCE(NULLIF(p1.full_name, ''), (SELECT NULLIF(p2.full_name, '') FROM participants p2 WHERE p2.id = duplicate_id)),
        first_name = COALESCE(p1.first_name, (SELECT p2.first_name FROM participants p2 WHERE p2.id = duplicate_id)),
        last_name = COALESCE(p1.last_name, (SELECT p2.last_name FROM participants p2 WHERE p2.id = duplicate_id)),
        phone = COALESCE(p1.phone, (SELECT p2.phone FROM participants p2 WHERE p2.id = duplicate_id)),
        updated_at = NOW()
      WHERE p1.id = canonical_id;
      
      -- Переносим регистрации
      UPDATE event_registrations
      SET participant_id = canonical_id
      WHERE participant_id = duplicate_id
        AND NOT EXISTS (
          SELECT 1 FROM event_registrations er2
          WHERE er2.participant_id = canonical_id
            AND er2.event_id = event_registrations.event_id
        );
      
      GET DIAGNOSTICS registrations_moved = ROW_COUNT;
      
      -- Переносим связи с группами
      INSERT INTO participant_groups (participant_id, tg_group_id, joined_at, left_at, is_active)
      SELECT 
        canonical_id,
        pg.tg_group_id,
        pg.joined_at,
        pg.left_at,
        pg.is_active
      FROM participant_groups pg
      WHERE pg.participant_id = duplicate_id
        AND NOT EXISTS (
          SELECT 1 FROM participant_groups pg2
          WHERE pg2.participant_id = canonical_id
            AND pg2.tg_group_id = pg.tg_group_id
        )
      ON CONFLICT DO NOTHING;
      
      GET DIAGNOSTICS groups_moved = ROW_COUNT;
      
      -- Помечаем как merged
      UPDATE participants
      SET merged_into = canonical_id, updated_at = NOW()
      WHERE id = duplicate_id;
      
      total_merged := total_merged + 1;
      RAISE NOTICE '  Merged % -> % (% registrations, % groups)', duplicate_id, canonical_id, registrations_moved, groups_moved;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Total participants merged: %', total_merged;
  RAISE NOTICE '';
END $$;

-- ==============================================================================
-- ШАГ 3: ОЧИСТКА - Конвертируем пустые email в NULL
-- ==============================================================================

UPDATE participants
SET email = NULL
WHERE email = '' AND merged_into IS NULL;

-- ==============================================================================
-- ШАГ 4: СОЗДАНИЕ UNIQUE INDEXES
-- ==============================================================================

DO $$
BEGIN
  RAISE NOTICE '--- Creating unique indexes ---';
  
  -- Index для email
  CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_email_per_org
  ON participants (org_id, email)
  WHERE email IS NOT NULL 
    AND email != '' 
    AND merged_into IS NULL;
  
  RAISE NOTICE '✅ Created: idx_participants_unique_email_per_org';
  
  -- Index для tg_user_id
  CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_tg_user_per_org
  ON participants (org_id, tg_user_id)
  WHERE tg_user_id IS NOT NULL AND merged_into IS NULL;
  
  RAISE NOTICE '✅ Created: idx_participants_unique_tg_user_per_org';
  
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Still have duplicates! Run the diagnostic queries above to find them.';
END $$;

-- ==============================================================================
-- ШАГ 5: СОЗДАНИЕ ФУНКЦИЙ
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
      'p1_tg_user_id', p1.tg_user_id,
      'p2_tg_user_id', p2.tg_user_id,
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
      'p1_email', p1.email,
      'p2_email', p2.email,
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

-- Функция объединения
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
  
  -- Обновляем canonical
  UPDATE participants
  SET 
    email = COALESCE(NULLIF(email, ''), NULLIF(v_duplicate.email, '')),
    tg_user_id = COALESCE(tg_user_id, v_duplicate.tg_user_id),
    username = COALESCE(username, v_duplicate.username),
    first_name = COALESCE(first_name, v_duplicate.first_name),
    last_name = COALESCE(last_name, v_duplicate.last_name),
    full_name = COALESCE(NULLIF(full_name, ''), NULLIF(v_duplicate.full_name, '')),
    phone = COALESCE(phone, v_duplicate.phone),
    updated_at = NOW()
  WHERE id = p_canonical_id;
  
  -- Переносим регистрации
  UPDATE event_registrations
  SET participant_id = p_canonical_id
  WHERE participant_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM event_registrations er2
      WHERE er2.participant_id = p_canonical_id
        AND er2.event_id = event_registrations.event_id
    );
  
  GET DIAGNOSTICS v_updated_registrations = ROW_COUNT;
  
  -- Переносим группы
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
    )
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_transferred_groups = ROW_COUNT;
  
  -- Помечаем как merged
  UPDATE participants
  SET merged_into = p_canonical_id, updated_at = NOW()
  WHERE id = p_duplicate_id;
  
  v_result = jsonb_build_object(
    'success', true,
    'canonical_id', p_canonical_id,
    'duplicate_id', p_duplicate_id,
    'updated_registrations', v_updated_registrations,
    'transferred_groups', v_transferred_groups,
    'merged_at', NOW()
  );
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION find_duplicate_participants TO authenticated;
GRANT EXECUTE ON FUNCTION merge_duplicate_participants TO authenticated;

-- ==============================================================================
-- ШАГ 6: ФИНАЛЬНАЯ ПРОВЕРКА
-- ==============================================================================

DO $$
DECLARE
  email_dupes INTEGER;
  tg_dupes INTEGER;
  empty_emails INTEGER;
  total_participants INTEGER;
  total_merged INTEGER;
BEGIN
  SELECT COUNT(*) INTO email_dupes
  FROM (
    SELECT org_id, email
    FROM participants
    WHERE email IS NOT NULL AND email != '' AND merged_into IS NULL
    GROUP BY org_id, email
    HAVING COUNT(*) > 1
  ) sub;
  
  SELECT COUNT(*) INTO tg_dupes
  FROM (
    SELECT org_id, tg_user_id
    FROM participants
    WHERE tg_user_id IS NOT NULL AND merged_into IS NULL
    GROUP BY org_id, tg_user_id
    HAVING COUNT(*) > 1
  ) sub;
  
  SELECT COUNT(*) INTO empty_emails
  FROM participants
  WHERE email = '' AND merged_into IS NULL;
  
  SELECT COUNT(*) INTO total_participants
  FROM participants
  WHERE merged_into IS NULL;
  
  SELECT COUNT(*) INTO total_merged
  FROM participants
  WHERE merged_into IS NOT NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '╔═══════════════════════════════════════╗';
  RAISE NOTICE '║   MIGRATION COMPLETED SUCCESSFULLY    ║';
  RAISE NOTICE '╚═══════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Final Statistics:';
  RAISE NOTICE '  Active participants: %', total_participants;
  RAISE NOTICE '  Merged participants: %', total_merged;
  RAISE NOTICE '  Email duplicates: %', email_dupes;
  RAISE NOTICE '  Telegram ID duplicates: %', tg_dupes;
  RAISE NOTICE '  Empty email strings: %', empty_emails;
  RAISE NOTICE '';
  
  IF email_dupes = 0 AND tg_dupes = 0 AND empty_emails = 0 THEN
    RAISE NOTICE '✅✅✅ SUCCESS! All duplicates resolved.';
    RAISE NOTICE '';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '  - idx_participants_unique_email_per_org';
    RAISE NOTICE '  - idx_participants_unique_tg_user_per_org';
    RAISE NOTICE '  - find_duplicate_participants(org_id)';
    RAISE NOTICE '  - merge_duplicate_participants(canonical_id, duplicate_id)';
  ELSE
    RAISE WARNING '⚠️  Still have duplicates or empty emails!';
    RAISE WARNING 'Please investigate and fix manually.';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Deploy updated code (fixes in event registration)';
  RAISE NOTICE '  2. Monitor for new duplicates';
  RAISE NOTICE '';
END $$;

