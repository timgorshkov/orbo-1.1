-- Проверка, обрабатываются ли новые события после деплоя

-- 1. Последние события в activity_events
SELECT 
  'activity_events (latest)' as check_name,
  ae.id,
  ae.tg_chat_id,
  ae.tg_user_id,
  ae.org_id,
  ae.event_type
FROM activity_events ae
ORDER BY ae.id DESC
LIMIT 10;

-- 2. Количество событий по группам за последний час
SELECT 
  'activity_events (last hour)' as check_name,
  ae.tg_chat_id,
  tg.title,
  COUNT(*) as events_count,
  COUNT(DISTINCT ae.tg_user_id) as unique_users
FROM activity_events ae
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = ae.tg_chat_id
WHERE ae.id > (SELECT COALESCE(MAX(id) - 100, 0) FROM activity_events)
GROUP BY ae.tg_chat_id, tg.title
ORDER BY events_count DESC;

-- 3. Участники (должно быть пусто, если проблема)
SELECT 
  'participants' as check_name,
  COUNT(*) as total_count
FROM participants;

-- 4. Participant groups (должно быть пусто, если проблема)
SELECT 
  'participant_groups' as check_name,
  COUNT(*) as total_count
FROM participant_groups;

-- 5. Проверяем org_telegram_groups (должны быть записи)
SELECT 
  'org_telegram_groups' as check_name,
  otg.org_id,
  otg.tg_chat_id,
  tg.title
FROM org_telegram_groups otg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id;

