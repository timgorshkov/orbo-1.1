-- ============================================================================
-- ДИАГНОСТИКА РЕАКЦИЙ
-- ============================================================================

-- 1. Есть ли вообще реакции в activity_events?
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE event_type = 'reaction') as reaction_events,
  COUNT(*) FILTER (WHERE event_type = 'message' AND reactions_count > 0) as messages_with_reactions,
  SUM(reactions_count) as total_reactions_count
FROM activity_events;

-- 2. Есть ли reactions_count > 0 в последних сообщениях?
SELECT 
  id,
  event_type,
  tg_chat_id,
  message_id,
  reactions_count,
  created_at,
  meta->'message'->>'reactions' as reactions_json
FROM activity_events
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;

-- 3. Есть ли записи с event_type = 'reaction'?
SELECT 
  id,
  tg_chat_id,
  tg_user_id,
  message_id,
  created_at,
  meta
FROM activity_events
WHERE event_type = 'reaction'
ORDER BY created_at DESC
LIMIT 20;

-- 4. Проверка: есть ли reply_to_message_id? (Используем колонку + fallback на meta)
SELECT 
  id,
  tg_chat_id,
  message_id,
  reply_to_message_id as reply_to_id_from_column,
  meta->'message'->>'reply_to_id' as reply_to_id_from_meta,
  created_at
FROM activity_events
WHERE event_type = 'message'
  AND created_at >= NOW() - INTERVAL '7 days'
  AND (
    reply_to_message_id IS NOT NULL 
    OR (meta->'message'->>'reply_to_id') IS NOT NULL
  )
ORDER BY created_at DESC
LIMIT 10;

-- 5. Статистика по вашей организации (FIXED: используем reply_to_message_id колонку)
SELECT 
  COUNT(*) FILTER (WHERE event_type = 'message') as messages,
  COUNT(*) FILTER (WHERE event_type = 'reaction') as reactions,
  COUNT(*) FILTER (
    WHERE reply_to_message_id IS NOT NULL 
    OR (meta->'message'->>'reply_to_id') IS NOT NULL
  ) as replies,
  SUM(reactions_count) as reactions_on_messages
FROM activity_events
WHERE tg_chat_id IN (
  SELECT tg_chat_id FROM org_telegram_groups 
  WHERE org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
)
AND created_at >= NOW() - INTERVAL '7 days';

