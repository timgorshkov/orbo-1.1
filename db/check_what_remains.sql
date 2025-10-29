-- Проверка что осталось после слияния

-- 1. Проверяем memberships для дублирующего аккаунта
SELECT 
  'MEMBERSHIPS для дубля' as check_name,
  COUNT(*) as count,
  COALESCE(string_agg(org_id::text || ' (' || role || ')', ', '), 'EMPTY') as details
FROM memberships
WHERE user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';

-- 2. Проверяем что осталось для организации
SELECT 
  'ORGANIZATION_ADMINS после слияния' as check_name,
  user_id,
  role,
  email,
  has_verified_telegram,
  telegram_username,
  is_shadow_profile
FROM organization_admins
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END;

-- 3. Проверяем participants для дублирующего аккаунта
SELECT 
  'PARTICIPANTS для дубля' as check_name,
  id,
  org_id,
  full_name,
  tg_user_id,
  merged_into,
  user_id
FROM participants
WHERE user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';

-- 4. Проверяем что может мешать удалению пользователя
-- Ищем все таблицы с foreign key на auth.users
SELECT 
  'FOREIGN KEYS на auth.users' as info,
  tc.table_schema,
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'user_id'
  AND tc.table_schema NOT IN ('information_schema', 'pg_catalog')
ORDER BY tc.table_name;

-- 5. Конкретно проверяем какие данные есть для дублирующего user_id
DO $$
DECLARE
  dup_user_id UUID := 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
  cnt INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ДАННЫЕ ДЛЯ ДУБЛИРУЮЩЕГО USER_ID';
  RAISE NOTICE '========================================';
  
  -- Memberships
  SELECT COUNT(*) INTO cnt FROM memberships WHERE user_id = dup_user_id;
  RAISE NOTICE 'memberships: %', cnt;
  
  -- Participants
  SELECT COUNT(*) INTO cnt FROM participants WHERE user_id = dup_user_id;
  RAISE NOTICE 'participants: %', cnt;
  
  -- User telegram accounts
  SELECT COUNT(*) INTO cnt FROM user_telegram_accounts WHERE user_id = dup_user_id;
  RAISE NOTICE 'user_telegram_accounts: %', cnt;
  
  -- Event registrations (через participant_id)
  SELECT COUNT(*) INTO cnt 
  FROM event_registrations 
  WHERE participant_id IN (
    SELECT id FROM participants WHERE user_id = dup_user_id
  );
  IF cnt > 0 THEN
    RAISE NOTICE 'event_registrations: %', cnt;
  END IF;
  
  -- Materials (если есть)
  BEGIN
    SELECT COUNT(*) INTO cnt FROM materials WHERE created_by = dup_user_id;
    IF cnt > 0 THEN
      RAISE NOTICE 'materials (created_by): %', cnt;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- Таблица не существует
    NULL;
  END;
  
  -- Events (если есть)
  BEGIN
    SELECT COUNT(*) INTO cnt FROM events WHERE created_by = dup_user_id;
    IF cnt > 0 THEN
      RAISE NOTICE 'events (created_by): %', cnt;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  
  RAISE NOTICE '========================================';
END $$;

