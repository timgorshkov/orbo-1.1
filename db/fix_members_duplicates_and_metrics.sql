-- Скрипт для исправления дубликатов участников и обновления метрик

-- 1. Находим и обрабатываем дубликаты участников
DO $$
DECLARE
  duplicate_rec RECORD;
  main_id UUID;
BEGIN
  -- Находим дубликаты
  FOR duplicate_rec IN
    SELECT 
      tg_user_id, 
      org_id,
      array_agg(id ORDER BY last_activity_at DESC NULLS LAST, created_at DESC NULLS LAST) as ids
    FROM 
      participants
    WHERE 
      tg_user_id IS NOT NULL
    GROUP BY 
      tg_user_id, org_id
    HAVING 
      COUNT(*) > 1
  LOOP
    -- Первый ID в массиве - это тот, который мы хотим сохранить
    main_id := duplicate_rec.ids[1];
    
    -- Обрабатываем все остальные ID (дубликаты)
    FOR i IN 2..array_length(duplicate_rec.ids, 1) LOOP
      -- Обновляем ссылки в activity_events
      UPDATE activity_events
      SET participant_id = main_id
      WHERE participant_id = duplicate_rec.ids[i];
      
      -- Обновляем ссылки в participant_groups
      UPDATE participant_groups
      SET participant_id = main_id
      WHERE participant_id = duplicate_rec.ids[i]
      AND NOT EXISTS (
        SELECT 1 FROM participant_groups
        WHERE participant_id = main_id AND tg_group_id = participant_groups.tg_group_id
      );
      
      -- Удаляем дублирующиеся записи в participant_groups
      DELETE FROM participant_groups
      WHERE participant_id = duplicate_rec.ids[i];
      
      -- Удаляем дубликат
      DELETE FROM participants
      WHERE id = duplicate_rec.ids[i];
    END LOOP;
  END LOOP;
END
$$;

-- 2. Сначала проверяем, есть ли ссылки на тестовых участников в activity_events
DO $$
DECLARE
  has_references BOOLEAN;
BEGIN
  -- Проверяем, есть ли ссылки на тестовых участников в activity_events
  SELECT EXISTS (
    SELECT 1
    FROM activity_events ae
    JOIN participants p ON ae.participant_id = p.id
    WHERE p.full_name IN ('Иван Петров', 'Мария Сидорова', 'Алексей Кузнецов')
  ) INTO has_references;
  
  IF has_references THEN
    -- Если есть ссылки, сначала обнуляем participant_id в activity_events
    UPDATE activity_events
    SET participant_id = NULL
    WHERE participant_id IN (
      SELECT id
      FROM participants
      WHERE full_name IN ('Иван Петров', 'Мария Сидорова', 'Алексей Кузнецов')
    );
    
    RAISE NOTICE 'Removed references to test participants in activity_events';
  END IF;
END
$$;

-- Теперь удаляем связи в participant_groups
DELETE FROM participant_groups
WHERE participant_id IN (
  SELECT id
  FROM participants
  WHERE full_name IN ('Иван Петров', 'Мария Сидорова', 'Алексей Кузнецов')
);

-- Теперь удаляем тестовых участников
DELETE FROM participants
WHERE full_name IN ('Иван Петров', 'Мария Сидорова', 'Алексей Кузнецов');

-- 3. Обновляем связи participant_groups для оставшихся участников
-- Сначала удаляем связи для удаленных участников
DELETE FROM participant_groups
WHERE participant_id NOT IN (SELECT id FROM participants);

-- 4. Обновляем метрики для всех групп
-- Сначала пересчитываем количество участников в группах
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id::bigint
  AND pg.is_active = TRUE
);

-- 5. Обновляем счетчики новых участников в метриках
WITH join_counts AS (
  SELECT 
    org_id,
    tg_chat_id,
    date_trunc('day', created_at)::date as date,
    COUNT(DISTINCT tg_user_id) as join_count
  FROM 
    activity_events
  WHERE 
    event_type = 'join'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    org_id, tg_chat_id, date_trunc('day', created_at)::date
),
leave_counts AS (
  SELECT 
    org_id,
    tg_chat_id,
    date_trunc('day', created_at)::date as date,
    COUNT(DISTINCT tg_user_id) as leave_count
  FROM 
    activity_events
  WHERE 
    event_type = 'leave'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    org_id, tg_chat_id, date_trunc('day', created_at)::date
)
UPDATE group_metrics gm
SET 
  join_count = COALESCE(jc.join_count, 0),
  leave_count = COALESCE(lc.leave_count, 0),
  net_member_change = COALESCE(jc.join_count, 0) - COALESCE(lc.leave_count, 0)
FROM 
  join_counts jc
LEFT JOIN
  leave_counts lc ON jc.org_id = lc.org_id AND jc.tg_chat_id = lc.tg_chat_id AND jc.date = lc.date
WHERE 
  gm.org_id = jc.org_id
  AND gm.tg_chat_id = jc.tg_chat_id
  AND gm.date = jc.date;

-- 6. Добавляем отсутствующие метрики за последние 7 дней
WITH days AS (
  SELECT generate_series(
    date_trunc('day', NOW() - INTERVAL '7 days')::date,
    date_trunc('day', NOW())::date,
    '1 day'::interval
  )::date as date
),
groups AS (
  SELECT id, org_id, tg_chat_id, title
  FROM telegram_groups
),
days_groups AS (
  SELECT d.date, g.id as group_id, g.org_id, g.tg_chat_id
  FROM days d
  CROSS JOIN groups g
),
missing_metrics AS (
  SELECT dg.date, dg.group_id, dg.org_id, dg.tg_chat_id
  FROM days_groups dg
  LEFT JOIN group_metrics gm ON gm.date = dg.date AND gm.tg_chat_id = dg.tg_chat_id
  WHERE gm.id IS NULL
),
join_counts AS (
  SELECT 
    org_id,
    tg_chat_id,
    date_trunc('day', created_at)::date as date,
    COUNT(DISTINCT tg_user_id) as join_count
  FROM 
    activity_events
  WHERE 
    event_type = 'join'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    org_id, tg_chat_id, date_trunc('day', created_at)::date
),
leave_counts AS (
  SELECT 
    org_id,
    tg_chat_id,
    date_trunc('day', created_at)::date as date,
    COUNT(DISTINCT tg_user_id) as leave_count
  FROM 
    activity_events
  WHERE 
    event_type = 'leave'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    org_id, tg_chat_id, date_trunc('day', created_at)::date
),
message_counts AS (
  SELECT 
    org_id,
    tg_chat_id,
    date_trunc('day', created_at)::date as date,
    COUNT(*) as message_count,
    COUNT(DISTINCT tg_user_id) as dau,
    COUNT(CASE WHEN reply_to_message_id IS NOT NULL THEN 1 END) as reply_count
  FROM 
    activity_events
  WHERE 
    event_type = 'message'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    org_id, tg_chat_id, date_trunc('day', created_at)::date
)
INSERT INTO group_metrics (
  org_id, tg_chat_id, date, 
  message_count, dau, reply_count, reply_ratio,
  join_count, leave_count, net_member_change
)
SELECT 
  mm.org_id,
  mm.tg_chat_id,
  mm.date,
  COALESCE(mc.message_count, 0),
  COALESCE(mc.dau, 0),
  COALESCE(mc.reply_count, 0),
  CASE WHEN COALESCE(mc.message_count, 0) > 0 
       THEN ROUND((COALESCE(mc.reply_count, 0)::numeric / COALESCE(mc.message_count, 1)::numeric) * 100) 
       ELSE 0 
  END,
  COALESCE(jc.join_count, 0),
  COALESCE(lc.leave_count, 0),
  COALESCE(jc.join_count, 0) - COALESCE(lc.leave_count, 0)
FROM 
  missing_metrics mm
LEFT JOIN
  message_counts mc ON mm.org_id = mc.org_id AND mm.tg_chat_id = mc.tg_chat_id AND mm.date = mc.date
LEFT JOIN
  join_counts jc ON mm.org_id = jc.org_id AND mm.tg_chat_id = jc.tg_chat_id AND mm.date = jc.date
LEFT JOIN
  leave_counts lc ON mm.org_id = lc.org_id AND mm.tg_chat_id = lc.tg_chat_id AND mm.date = lc.date;

-- Добавляем колонку new_members_count, если ее нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'telegram_groups' AND column_name = 'new_members_count'
  ) THEN
    ALTER TABLE telegram_groups ADD COLUMN new_members_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added new_members_count column to telegram_groups';
  END IF;
END
$$;

-- 7. Обновляем общее количество новых участников за 7 дней для каждой группы
WITH join_totals AS (
  SELECT 
    tg_chat_id,
    COUNT(DISTINCT tg_user_id) as total_joins
  FROM 
    activity_events
  WHERE 
    event_type = 'join'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    tg_chat_id
)
UPDATE telegram_groups tg
SET 
  new_members_count = COALESCE(jt.total_joins, 0)
FROM 
  join_totals jt
WHERE 
  tg.tg_chat_id = jt.tg_chat_id;
