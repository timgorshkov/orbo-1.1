-- Скрипт для исправления проблем с отображением участников

-- 1. Добавляем столбец member_count, если его нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'telegram_groups' AND column_name = 'member_count'
  ) THEN
    ALTER TABLE telegram_groups ADD COLUMN member_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added member_count column to telegram_groups';
  END IF;
END
$$;

-- 2. Исправляем проблему с типом данных tg_group_id в participant_groups
DO $$
BEGIN
  -- Проверяем тип данных
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'participant_groups' AND column_name = 'tg_group_id'
    AND data_type <> 'bigint'
  ) THEN
    -- Если тип не bigint, пробуем изменить
    ALTER TABLE participant_groups ALTER COLUMN tg_group_id TYPE bigint USING tg_group_id::bigint;
    RAISE NOTICE 'Changed tg_group_id type to bigint in participant_groups';
  END IF;
END
$$;

-- 3. Создаем функции для инкремента и декремента счетчиков, если их нет
CREATE OR REPLACE FUNCTION increment_counter(row_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Получаем текущее значение
  SELECT member_count INTO current_count
  FROM telegram_groups
  WHERE tg_chat_id = row_id;
  
  -- Если значение NULL, устанавливаем в 1
  IF current_count IS NULL THEN
    RETURN 1;
  ELSE
    RETURN current_count + 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_counter(row_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Получаем текущее значение
  SELECT member_count INTO current_count
  FROM telegram_groups
  WHERE tg_chat_id = row_id;
  
  -- Если значение NULL или 0, оставляем 0
  IF current_count IS NULL OR current_count <= 0 THEN
    RETURN 0;
  ELSE
    RETURN current_count - 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

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

-- 5. Создаем связи между участниками и группами на основе событий join
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

-- 6. Обновляем статус участников на основе событий leave
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

-- 7. Пересчитываем количество участников в группах
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id::bigint
  AND pg.is_active = TRUE
);

-- 8. Если количество участников всё еще 0, устанавливаем на основе событий join и leave
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(DISTINCT ae.tg_user_id)
  FROM activity_events ae
  WHERE ae.tg_chat_id = tg.tg_chat_id
  AND ae.event_type = 'join'
  AND ae.tg_user_id NOT IN (
    SELECT ae2.tg_user_id
    FROM activity_events ae2
    WHERE ae2.tg_chat_id = tg.tg_chat_id
    AND ae2.event_type = 'leave'
  )
)
WHERE tg.member_count = 0;
