-- Проверка RLS на activity_events

-- 1. Проверяем, включен ли RLS
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'activity_events';

-- 2. Проверяем все политики на activity_events
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'activity_events';

-- 3. Проверяем, сколько всего записей в activity_events
SELECT COUNT(*) as total_records FROM activity_events;

-- 4. Проверяем импортированные записи с ID 420-464
SELECT 
  id,
  org_id,
  tg_chat_id,
  tg_user_id,
  event_type,
  import_source,
  import_batch_id,
  created_at
FROM activity_events
WHERE id BETWEEN 420 AND 464
ORDER BY id;

-- 5. Если записей нет, проверяем последние ID
SELECT 
  id,
  org_id,
  tg_chat_id,
  tg_user_id,
  event_type,
  import_source,
  created_at
FROM activity_events
ORDER BY id DESC
LIMIT 20;

