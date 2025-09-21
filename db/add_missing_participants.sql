-- Скрипт для добавления отсутствующих участников из сообщений

-- 1. Создаем участников для всех пользователей, отправивших сообщения, но отсутствующих в таблице participants
INSERT INTO participants (org_id, tg_user_id, username, full_name, created_at, last_activity_at)
WITH message_users AS (
  SELECT DISTINCT
    ae.org_id,
    ae.tg_user_id,
    (ae.meta->'user'->>'username')::text as username,
    (ae.meta->'user'->>'name')::text as full_name,
    MIN(ae.created_at) as first_activity,
    MAX(ae.created_at) as last_activity
  FROM 
    activity_events ae
  WHERE 
    ae.event_type = 'message'
    AND ae.tg_user_id IS NOT NULL
  GROUP BY 
    ae.org_id, ae.tg_user_id, (ae.meta->'user'->>'username'), (ae.meta->'user'->>'name')
)
SELECT 
  mu.org_id,
  mu.tg_user_id,
  mu.username,
  mu.full_name,
  mu.first_activity,
  mu.last_activity
FROM 
  message_users mu
LEFT JOIN 
  participants p ON p.org_id = mu.org_id AND p.tg_user_id = mu.tg_user_id
WHERE 
  p.id IS NULL;

-- 2. Создаем связи между участниками и группами на основе сообщений
WITH message_groups AS (
  SELECT DISTINCT
    p.id as participant_id,
    ae.tg_chat_id,
    MIN(ae.created_at) as first_message,
    MAX(ae.created_at) as last_message
  FROM 
    activity_events ae
    JOIN participants p ON p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  WHERE 
    ae.event_type = 'message'
  GROUP BY 
    p.id, ae.tg_chat_id
)
INSERT INTO participant_groups (participant_id, tg_group_id, joined_at, is_active)
SELECT 
  mg.participant_id,
  mg.tg_chat_id,
  mg.first_message,
  TRUE
FROM 
  message_groups mg
WHERE 
  NOT EXISTS (
    SELECT 1
    FROM participant_groups pg
    WHERE pg.participant_id = mg.participant_id AND pg.tg_group_id = mg.tg_chat_id
  );

-- 3. Обновляем количество участников в группах
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id::bigint
  AND pg.is_active = TRUE
);
