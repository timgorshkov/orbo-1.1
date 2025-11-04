-- Проверка импортированных записей
-- Выполни этот запрос СРАЗУ после импорта

-- 1. Последние батчи импорта
SELECT 
  id,
  org_id,
  tg_chat_id,
  filename,
  total_messages,
  imported_messages,
  status,
  created_at
FROM telegram_import_batches
ORDER BY created_at DESC
LIMIT 5;

-- 2. Записи из последнего батча (замени UUID на тот что получил выше)
-- SELECT 
--   id,
--   org_id,
--   tg_chat_id,
--   tg_user_id,
--   event_type,
--   import_source,
--   import_batch_id,
--   created_at,
--   meta->>'import_format' as import_format
-- FROM activity_events
-- WHERE import_batch_id = 'ТВОЙ_BATCH_ID'
-- ORDER BY created_at
-- LIMIT 10;

-- 3. Все импортированные сообщения за последний час
SELECT 
  id,
  org_id,
  tg_chat_id,
  tg_user_id,
  event_type,
  import_source,
  import_batch_id,
  created_at,
  meta->>'import_format' as import_format,
  meta->>'author_name' as author_name
FROM activity_events
WHERE import_source = 'html_import'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;

-- 4. Подсчёт по группам и источникам
SELECT 
  tg_chat_id,
  org_id,
  import_source,
  COUNT(*) as count
FROM activity_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tg_chat_id, org_id, import_source
ORDER BY created_at DESC;

-- 5. Проверка: может быть записи с NULL org_id?
SELECT 
  COUNT(*) as count_with_null_org,
  tg_chat_id
FROM activity_events
WHERE org_id IS NULL
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY tg_chat_id;

