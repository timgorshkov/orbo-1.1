-- Скрипт для обновления счетчиков участников

-- 1. Обновляем счетчики участников в группах
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id::bigint
  AND pg.is_active = TRUE
);

-- 2. Синхронизируем participant_groups с activity_events

-- Сначала создаем связи для событий join, которых еще нет
WITH join_events AS (
  SELECT DISTINCT
    p.id as participant_id,
    ae.tg_chat_id as tg_group_id,
    MIN(ae.created_at) as joined_at
  FROM 
    activity_events ae
    JOIN participants p ON p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  WHERE 
    ae.event_type = 'join'
  GROUP BY 
    p.id, ae.tg_chat_id
)
INSERT INTO participant_groups (participant_id, tg_group_id, joined_at, is_active)
SELECT 
  je.participant_id,
  je.tg_group_id,
  je.joined_at,
  TRUE
FROM 
  join_events je
WHERE 
  NOT EXISTS (
    SELECT 1 FROM participant_groups pg 
    WHERE pg.participant_id = je.participant_id AND pg.tg_group_id = je.tg_group_id
  );

-- Обновляем статус участников на основе событий leave
WITH leave_events AS (
  SELECT DISTINCT
    p.id as participant_id,
    ae.tg_chat_id as tg_group_id,
    MAX(ae.created_at) as left_at
  FROM 
    activity_events ae
    JOIN participants p ON p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  WHERE 
    ae.event_type = 'leave'
  GROUP BY 
    p.id, ae.tg_chat_id
)
UPDATE participant_groups pg
SET 
  left_at = le.left_at,
  is_active = FALSE
FROM 
  leave_events le
WHERE 
  pg.participant_id = le.participant_id 
  AND pg.tg_group_id = le.tg_group_id
  AND (pg.left_at IS NULL OR pg.left_at < le.left_at);

-- 3. Снова обновляем счетчики после синхронизации
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id::bigint
  AND pg.is_active = TRUE
);

-- 4. Создаем участников для всех пользователей в activity_events, которых еще нет в participants
INSERT INTO participants (org_id, tg_user_id, username, full_name, created_at, last_activity_at)
SELECT DISTINCT 
  ae.org_id,
  ae.tg_user_id,
  (ae.meta->'user'->>'username')::text as username,
  (ae.meta->'user'->>'name')::text as full_name,
  MIN(ae.created_at) as created_at,
  MAX(ae.created_at) as last_activity_at
FROM 
  activity_events ae
WHERE 
  ae.tg_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  )
GROUP BY 
  ae.org_id, ae.tg_user_id, (ae.meta->'user'->>'username'), (ae.meta->'user'->>'name');
