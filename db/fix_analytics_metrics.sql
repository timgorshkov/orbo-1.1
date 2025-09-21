-- Скрипт для исправления метрик аналитики

-- 1. Обновляем количество участников в группах на основе participant_groups
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id::bigint
  AND pg.is_active = TRUE
);

-- 2. Если количество участников всё еще 0, устанавливаем на основе событий join и leave
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
WHERE tg.member_count = 0 OR tg.member_count IS NULL;

-- 3. Если количество участников всё еще 0, устанавливаем минимум 1
UPDATE telegram_groups
SET member_count = 1
WHERE (member_count = 0 OR member_count IS NULL)
AND bot_status = 'connected';

-- 4. Исправляем коэффициент ответов в метриках
WITH message_reply_stats AS (
  SELECT 
    org_id,
    tg_chat_id,
    date_trunc('day', created_at)::date as date,
    COUNT(*) as message_count,
    COUNT(CASE WHEN reply_to_message_id IS NOT NULL THEN 1 END) as reply_count
  FROM 
    activity_events
  WHERE 
    event_type = 'message'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    org_id, tg_chat_id, date_trunc('day', created_at)::date
)
UPDATE group_metrics gm
SET 
  message_count = COALESCE(mrs.message_count, gm.message_count),
  reply_count = COALESCE(mrs.reply_count, gm.reply_count),
  reply_ratio = CASE 
    WHEN COALESCE(mrs.message_count, 0) > 0 
    THEN ROUND((COALESCE(mrs.reply_count, 0)::numeric / COALESCE(mrs.message_count, 1)::numeric) * 100) 
    ELSE 0 
  END
FROM 
  message_reply_stats mrs
WHERE 
  gm.org_id = mrs.org_id
  AND gm.tg_chat_id = mrs.tg_chat_id
  AND gm.date = mrs.date;

-- 5. Добавляем отсутствующие метрики за последние 7 дней
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
message_stats AS (
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
  COALESCE(ms.message_count, 0),
  COALESCE(ms.dau, 0),
  COALESCE(ms.reply_count, 0),
  CASE WHEN COALESCE(ms.message_count, 0) > 0 
       THEN ROUND((COALESCE(ms.reply_count, 0)::numeric / COALESCE(ms.message_count, 1)::numeric) * 100) 
       ELSE 0 
  END,
  COALESCE(jc.join_count, 0),
  COALESCE(lc.leave_count, 0),
  COALESCE(jc.join_count, 0) - COALESCE(lc.leave_count, 0)
FROM 
  missing_metrics mm
LEFT JOIN
  message_stats ms ON mm.org_id = ms.org_id AND mm.tg_chat_id = ms.tg_chat_id AND mm.date = ms.date
LEFT JOIN
  join_counts jc ON mm.org_id = jc.org_id AND mm.tg_chat_id = jc.tg_chat_id AND mm.date = jc.date
LEFT JOIN
  leave_counts lc ON mm.org_id = lc.org_id AND mm.tg_chat_id = lc.tg_chat_id AND mm.date = lc.date;
