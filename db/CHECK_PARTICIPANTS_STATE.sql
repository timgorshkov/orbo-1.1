-- Проверка состояния участников после добавления групп

-- 1. Проверяем telegram_groups
SELECT 
  'telegram_groups' as check_name,
  tg.id,
  tg.tg_chat_id,
  tg.title,
  tg.org_id as legacy_org_id,
  tg.analytics_enabled,
  tg.bot_status
FROM telegram_groups tg
ORDER BY tg.id DESC;

-- 2. Проверяем org_telegram_groups (должны быть записи после добавления)
SELECT 
  'org_telegram_groups' as check_name,
  otg.org_id,
  otg.tg_chat_id,
  tg.title,
  otg.created_at,
  otg.created_by
FROM org_telegram_groups otg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
ORDER BY otg.created_at DESC;

-- 3. Проверяем participant_groups (промежуточная таблица)
SELECT 
  'participant_groups' as check_name,
  pg.tg_group_id,
  tg.title as group_title,
  COUNT(DISTINCT pg.participant_id) as unique_participants
FROM participant_groups pg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
GROUP BY pg.tg_group_id, tg.title
ORDER BY unique_participants DESC;

-- 4. Проверяем participants (конечная таблица)
SELECT 
  'participants' as check_name,
  p.org_id,
  o.name as org_name,
  COUNT(*) as total_participants,
  COUNT(CASE WHEN p.merged_into IS NULL THEN 1 END) as active_participants,
  COUNT(CASE WHEN p.source = 'telegram_group' THEN 1 END) as from_telegram
FROM participants p
LEFT JOIN organizations o ON o.id = p.org_id
GROUP BY p.org_id, o.name
ORDER BY total_participants DESC;

-- 5. Проверяем activity_events (должны быть события после добавления)
SELECT 
  'activity_events' as check_name,
  ae.tg_chat_id,
  tg.title,
  COUNT(*) as events_count,
  COUNT(DISTINCT ae.tg_user_id) as unique_users
FROM activity_events ae
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = ae.tg_chat_id
GROUP BY ae.tg_chat_id, tg.title
ORDER BY events_count DESC;

-- 6. Детальная информация по участникам (если они есть)
SELECT 
  'participants_detail' as check_name,
  p.id,
  p.org_id,
  p.tg_user_id,
  p.full_name,
  p.username,
  p.source,
  p.participant_status,
  p.merged_into
FROM participants p
ORDER BY p.id DESC
LIMIT 20;

-- 7. Проверяем, есть ли участники в participant_groups без соответствующих в participants
SELECT 
  'orphaned_participant_groups' as check_name,
  pg.tg_group_id,
  tg.title as group_title,
  otg.org_id,
  COUNT(*) as orphaned_count
FROM participant_groups pg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
LEFT JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
LEFT JOIN participants p ON p.id = pg.participant_id
WHERE p.id IS NULL -- participant_id не существует в participants
GROUP BY pg.tg_group_id, tg.title, otg.org_id;

