-- Функция для расчета Silent Rate (доля "молчунов" за 7 дней)
CREATE OR REPLACE FUNCTION get_silent_rate(
  org_id_param uuid,
  tg_chat_id_param bigint,
  days_ago integer DEFAULT 7,
  timezone_name text DEFAULT 'Europe/Moscow'
) RETURNS float
LANGUAGE plpgsql
AS $$
DECLARE
  total_members bigint;
  active_members bigint;
BEGIN
  -- Получаем общее количество участников
  SELECT member_count INTO total_members
  FROM telegram_groups
  WHERE tg_chat_id = tg_chat_id_param AND org_id = org_id_param;

  -- Получаем количество активных участников (отправивших хотя бы одно сообщение)
  SELECT COUNT(DISTINCT tg_user_id) INTO active_members
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Возвращаем процент "молчунов"
  RETURN CASE 
    WHEN total_members > 0 THEN 
      ROUND(((total_members - COALESCE(active_members, 0))::float / total_members::float) * 100, 2)
    ELSE 0
  END;
END;
$$;

-- Функция для расчета Newcomer Activation (% новых с активностью за 72 часа)
CREATE OR REPLACE FUNCTION get_newcomer_activation(
  org_id_param uuid,
  tg_chat_id_param bigint,
  hours_ago integer DEFAULT 72,
  timezone_name text DEFAULT 'Europe/Moscow'
) RETURNS float
LANGUAGE plpgsql
AS $$
DECLARE
  total_newcomers bigint;
  active_newcomers bigint;
BEGIN
  -- Получаем общее количество новых участников за последние 72 часа
  SELECT COUNT(DISTINCT tg_user_id) INTO total_newcomers
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'join'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (hours_ago || ' hours')::interval);

  -- Получаем количество новых участников, которые отправили хотя бы одно сообщение
  SELECT COUNT(DISTINCT ae.tg_user_id) INTO active_newcomers
  FROM activity_events ae
  WHERE ae.tg_chat_id = tg_chat_id_param
    AND ae.org_id = org_id_param
    AND ae.event_type = 'message'
    AND ae.created_at >= (NOW() AT TIME ZONE timezone_name - (hours_ago || ' hours')::interval)
    AND EXISTS (
      SELECT 1 FROM activity_events join_events
      WHERE join_events.tg_chat_id = tg_chat_id_param
        AND join_events.org_id = org_id_param
        AND join_events.tg_user_id = ae.tg_user_id
        AND join_events.event_type = 'join'
        AND join_events.created_at >= (NOW() AT TIME ZONE timezone_name - (hours_ago || ' hours')::interval)
    );

  -- Возвращаем процент активации
  RETURN CASE 
    WHEN total_newcomers > 0 THEN 
      ROUND((active_newcomers::float / total_newcomers::float) * 100, 2)
    ELSE 0
  END;
END;
$$;

-- Функция для расчета Prime Time (часы наибольшей активности)
CREATE OR REPLACE FUNCTION get_prime_time(
  org_id_param uuid,
  tg_chat_id_param bigint,
  days_ago integer DEFAULT 7,
  timezone_name text DEFAULT 'Europe/Moscow'
) RETURNS TABLE (
  hour integer,
  message_count bigint,
  is_prime_time boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH hourly_stats AS (
    SELECT 
      EXTRACT(HOUR FROM created_at AT TIME ZONE timezone_name)::integer as hour,
      COUNT(*) as message_count
    FROM activity_events
    WHERE tg_chat_id = tg_chat_id_param
      AND org_id = org_id_param
      AND event_type = 'message'
      AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval)
    GROUP BY hour
  ),
  avg_count AS (
    SELECT AVG(message_count) as avg_messages
    FROM hourly_stats
  )
  SELECT 
    h.hour,
    COALESCE(hs.message_count, 0) as message_count,
    COALESCE(hs.message_count > avg_count.avg_messages, false) as is_prime_time
  FROM generate_series(0, 23) h(hour)
  LEFT JOIN hourly_stats hs ON h.hour = hs.hour
  CROSS JOIN avg_count
  ORDER BY h.hour;
END;
$$;

-- Функция для расчета Gini коэффициента активности
CREATE OR REPLACE FUNCTION get_activity_gini(
  org_id_param uuid,
  tg_chat_id_param bigint,
  days_ago integer DEFAULT 7,
  timezone_name text DEFAULT 'Europe/Moscow'
) RETURNS float
LANGUAGE plpgsql
AS $$
DECLARE
  total_messages bigint;
  user_messages record;
  previous_sum bigint := 0;
  gini float := 0;
  user_count integer := 0;
BEGIN
  -- Получаем общее количество сообщений
  SELECT COUNT(*) INTO total_messages
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Если сообщений нет, возвращаем 0
  IF total_messages = 0 THEN
    RETURN 0;
  END IF;

  -- Получаем количество сообщений по пользователям, отсортированное по возрастанию
  FOR user_messages IN (
    SELECT tg_user_id, COUNT(*) as message_count
    FROM activity_events
    WHERE tg_chat_id = tg_chat_id_param
      AND org_id = org_id_param
      AND event_type = 'message'
      AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval)
    GROUP BY tg_user_id
    ORDER BY message_count
  ) LOOP
    user_count := user_count + 1;
    gini := gini + (user_count * user_messages.message_count::float - previous_sum);
    previous_sum := previous_sum + user_messages.message_count;
  END LOOP;

  -- Вычисляем коэффициент Джини
  RETURN ROUND((gini / (user_count * previous_sum::float))::numeric, 4);
END;
$$;

-- Функция для расчета Risk Score (риск оттока)
CREATE OR REPLACE FUNCTION get_risk_score(
  org_id_param uuid,
  tg_chat_id_param bigint,
  user_id_param bigint,
  days_ago integer DEFAULT 30,
  timezone_name text DEFAULT 'Europe/Moscow'
) RETURNS float
LANGUAGE plpgsql
AS $$
DECLARE
  last_activity timestamp;
  message_count integer;
  reply_count integer;
  mention_count integer;
  risk_score float;
BEGIN
  -- Получаем дату последней активности
  SELECT MAX(created_at) INTO last_activity
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND tg_user_id = user_id_param
    AND event_type = 'message';

  -- Получаем количество сообщений за период
  SELECT COUNT(*) INTO message_count
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND tg_user_id = user_id_param
    AND event_type = 'message'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Получаем количество ответов на сообщения пользователя
  SELECT COUNT(*) INTO reply_count
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND reply_to_message_id IN (
      SELECT message_id
      FROM activity_events
      WHERE tg_chat_id = tg_chat_id_param
        AND org_id = org_id_param
        AND tg_user_id = user_id_param
        AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval)
    );

  -- Получаем количество упоминаний пользователя
  SELECT COUNT(*) INTO mention_count
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND meta->>'mentions' ? user_id_param::text
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Вычисляем риск оттока (0-100)
  risk_score := CASE
    WHEN last_activity IS NULL THEN 100  -- Пользователь никогда не писал
    WHEN last_activity < (NOW() AT TIME ZONE timezone_name - '14 days'::interval) THEN 80  -- Не писал более 14 дней
    WHEN message_count = 0 THEN 70  -- Нет сообщений за период
    ELSE
      50 * (1 - LEAST(message_count::float / 10, 1)) +  -- До 50 баллов за количество сообщений
      25 * (1 - LEAST((reply_count + mention_count)::float / 5, 1)) +  -- До 25 баллов за взаимодействия
      25 * (EXTRACT(EPOCH FROM (NOW() AT TIME ZONE timezone_name - last_activity)) / (86400 * 14))  -- До 25 баллов за давность последнего сообщения
  END;

  RETURN ROUND(GREATEST(LEAST(risk_score, 100), 0)::numeric, 2);
END;
$$;

-- Функция для получения участников с высоким риском оттока
CREATE OR REPLACE FUNCTION get_risk_radar(
  org_id_param uuid,
  tg_chat_id_param bigint,
  min_risk_score float DEFAULT 70,
  limit_param integer DEFAULT 10,
  timezone_name text DEFAULT 'Europe/Moscow'
) RETURNS TABLE (
  tg_user_id bigint,
  username text,
  risk_score float,
  last_activity timestamp,
  message_count integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT 
      ae.tg_user_id,
      MAX(ae.meta->>'user'->>'username') as username,
      MAX(ae.created_at) as last_activity,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as message_count
    FROM activity_events ae
    WHERE ae.tg_chat_id = tg_chat_id_param
      AND ae.org_id = org_id_param
      AND ae.created_at >= (NOW() AT TIME ZONE timezone_name - '30 days'::interval)
    GROUP BY ae.tg_user_id
  )
  SELECT 
    us.tg_user_id,
    us.username,
    get_risk_score(org_id_param, tg_chat_id_param, us.tg_user_id) as risk_score,
    us.last_activity,
    us.message_count
  FROM user_stats us
  WHERE get_risk_score(org_id_param, tg_chat_id_param, us.tg_user_id) >= min_risk_score
  ORDER BY risk_score DESC
  LIMIT limit_param;
END;
$$;
