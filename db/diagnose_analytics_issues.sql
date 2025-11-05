-- ============================================================================
-- ДИАГНОСТИКА ПРОБЛЕМ АНАЛИТИКИ
-- ============================================================================

-- ============================================================================
-- 1. АКТИВНОСТЬ: Проверка распределения сообщений по датам
-- ============================================================================

-- 1.1. Сколько сообщений в каждой дате за последние 30 дней?
SELECT 
  DATE(created_at) as date,
  COUNT(*) as message_count,
  import_source,
  COUNT(DISTINCT tg_user_id) as unique_users
FROM activity_events
WHERE event_type = 'message'
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), import_source
ORDER BY date DESC;

-- 1.2. Проверка: правильно ли записывается created_at при импорте?
-- (должна быть дата ИЗ сообщения, а не дата импорта)
SELECT 
  id,
  created_at,
  import_source,
  import_batch_id,
  meta->'source'->>'format' as import_format,
  meta->'message'->>'date' as original_message_date,
  tg_user_id
FROM activity_events
WHERE import_source = 'html_import'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY id DESC
LIMIT 20;

-- 1.3. Проверка: есть ли сообщения старше 2 дней?
SELECT 
  DATE(created_at) as date,
  COUNT(*) as count
FROM activity_events
WHERE event_type = 'message'
  AND created_at < CURRENT_DATE - INTERVAL '2 days'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 10;

-- ============================================================================
-- 2. ВОВЛЕЧЁННОСТЬ: Откуда 13 участников вместо 3?
-- ============================================================================

-- 2.1. Сколько АКТИВНЫХ участников в каждой организации?
SELECT 
  otg.org_id,
  o.name as org_name,
  COUNT(DISTINCT pg.participant_id) as participant_count
FROM participant_groups pg
JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
JOIN organizations o ON o.id = otg.org_id
WHERE pg.is_active = TRUE
GROUP BY otg.org_id, o.name
ORDER BY org_id;

-- 2.2. Детали по конкретной организации (замени на свой org_id)
-- Вставь сюда свой org_id из первого запроса
-- REPLACE_WITH_YOUR_ORG_ID

DO $$
DECLARE
  v_org_id UUID := 'REPLACE_WITH_YOUR_ORG_ID'; -- ⚠️ ЗАМЕНИ НА СВОЙ!
BEGIN
  RAISE NOTICE '=== Participants in organization % ===', v_org_id;
END $$;

-- Покажи всех участников этой организации
SELECT 
  p.id as participant_id,
  p.full_name,
  p.username,
  p.tg_user_id,
  pg.tg_group_id,
  tg.title as group_title,
  pg.is_active,
  pg.source,
  pg.joined_at
FROM participants p
JOIN participant_groups pg ON pg.participant_id = p.id
JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
WHERE otg.org_id = 'REPLACE_WITH_YOUR_ORG_ID' -- ⚠️ ЗАМЕНИ НА СВОЙ!
  AND pg.is_active = TRUE
ORDER BY p.id, pg.tg_group_id;

-- 2.3. Проверка: есть ли дубли участников?
SELECT 
  p.tg_user_id,
  p.username,
  COUNT(*) as count
FROM participants p
JOIN participant_groups pg ON pg.participant_id = p.id
JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
WHERE otg.org_id = 'REPLACE_WITH_YOUR_ORG_ID' -- ⚠️ ЗАМЕНИ НА СВОЙ!
  AND pg.is_active = TRUE
GROUP BY p.tg_user_id, p.username
HAVING COUNT(*) > 1;

-- ============================================================================
-- 3. АНАЛИТИКА ГРУППЫ: Проверка данных для конкретной группы
-- ============================================================================

-- 3.1. Список групп в организации
SELECT 
  tg.tg_chat_id,
  tg.title,
  tg.member_count,
  otg.org_id,
  COUNT(DISTINCT pg.participant_id) as active_participants
FROM telegram_groups tg
JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id
LEFT JOIN participant_groups pg ON pg.tg_group_id = tg.tg_chat_id AND pg.is_active = TRUE
WHERE otg.org_id = 'REPLACE_WITH_YOUR_ORG_ID' -- ⚠️ ЗАМЕНИ НА СВОЙ!
GROUP BY tg.tg_chat_id, tg.title, tg.member_count, otg.org_id;

-- 3.2. Проверка активности для конкретной группы
-- Вставь tg_chat_id из предыдущего запроса
SELECT 
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE event_type = 'message') as messages,
  SUM(reactions_count) as reactions,
  COUNT(DISTINCT tg_user_id) as active_users
FROM activity_events
WHERE tg_chat_id = -1234567890 -- ⚠️ ЗАМЕНИ НА СВОЙ tg_chat_id!
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================================
-- 4. БЫСТРАЯ ПРОВЕРКА: Вызов RPC функций
-- ============================================================================

-- 4.1. Timeline для организации
SELECT * FROM get_activity_timeline(
  'REPLACE_WITH_YOUR_ORG_ID'::UUID, -- ⚠️ ЗАМЕНИ НА СВОЙ!
  30,
  NULL
) LIMIT 10;

-- 4.2. Timeline для конкретной группы
SELECT * FROM get_activity_timeline(
  'REPLACE_WITH_YOUR_ORG_ID'::UUID, -- ⚠️ ЗАМЕНИ НА СВОЙ!
  30,
  -1234567890 -- ⚠️ ЗАМЕНИ НА СВОЙ tg_chat_id!
) LIMIT 10;

-- 4.3. Engagement breakdown
SELECT * FROM get_engagement_breakdown(
  'REPLACE_WITH_YOUR_ORG_ID'::UUID -- ⚠️ ЗАМЕНИ НА СВОЙ!
);

-- ============================================================================
-- ИНСТРУКЦИЯ:
-- 1. Найди свой org_id в запросе 2.1
-- 2. Замени все "REPLACE_WITH_YOUR_ORG_ID" на свой org_id
-- 3. Найди свой tg_chat_id в запросе 3.1
-- 4. Замени "-1234567890" на свой tg_chat_id
-- 5. Запусти скрипт построчно и изучи результаты
-- ============================================================================

