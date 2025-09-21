-- Добавляем поддержку часовой зоны для организаций и пользователей

-- 1. Добавляем поле timezone в таблицу organizations (если она существует)
DO $$
BEGIN
  -- Сначала проверяем, существует ли таблица organizations
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    -- Если таблица существует, проверяем наличие колонки
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'organizations' AND column_name = 'timezone'
    ) THEN
      ALTER TABLE organizations ADD COLUMN timezone TEXT DEFAULT 'Europe/Moscow';
      RAISE NOTICE 'Added timezone column to organizations';
    END IF;
  ELSE
    RAISE NOTICE 'Table organizations does not exist, skipping';
  END IF;
END
$$;

-- 2. Добавляем поле timezone в таблицу profiles (если она существует)
DO $$
BEGIN
  -- Сначала проверяем, существует ли таблица profiles
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    -- Если таблица существует, проверяем наличие колонки
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'profiles' AND column_name = 'timezone'
    ) THEN
      ALTER TABLE profiles ADD COLUMN timezone TEXT DEFAULT 'Europe/Moscow';
      RAISE NOTICE 'Added timezone column to profiles';
    END IF;
  ELSE
    RAISE NOTICE 'Table profiles does not exist, skipping';
  END IF;
END
$$;

-- 3. Создаем функцию для получения даты в нужной временной зоне
DO $$
BEGIN
  -- Проверяем, существует ли уже функция
  IF NOT EXISTS (
    SELECT FROM pg_proc 
    WHERE proname = 'get_date_in_timezone'
  ) THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION get_date_in_timezone(timestamp_value TIMESTAMP WITH TIME ZONE, timezone_name TEXT DEFAULT ''Europe/Moscow'')
    RETURNS DATE AS $func$
    BEGIN
      RETURN (timestamp_value AT TIME ZONE timezone_name)::DATE;
    END;
    $func$ LANGUAGE plpgsql;
    ';
    RAISE NOTICE 'Created get_date_in_timezone function';
  ELSE
    RAISE NOTICE 'Function get_date_in_timezone already exists, skipping';
  END IF;
END
$$;

-- 4. Создаем функцию для получения метрик с учетом временной зоны
DO $$
BEGIN
  -- Проверяем, существует ли таблица activity_events
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'activity_events'
  ) THEN
    -- Проверяем, существует ли уже функция
    IF NOT EXISTS (
      SELECT FROM pg_proc 
      WHERE proname = 'get_metrics_in_timezone'
    ) THEN
      BEGIN
        EXECUTE '
          CREATE OR REPLACE FUNCTION get_metrics_in_timezone(org_id_param UUID, tg_chat_id_param BIGINT, days_ago INTEGER DEFAULT 7, timezone_name TEXT DEFAULT ''Europe/Moscow'')
          RETURNS TABLE (
            date DATE,
            message_count INTEGER,
            reply_count INTEGER,
            dau INTEGER,
            join_count INTEGER,
            leave_count INTEGER,
            reply_ratio INTEGER
          ) AS $func$
          DECLARE
            start_date DATE;
            end_date DATE;
            has_reply_column BOOLEAN;
          BEGIN
            -- Определяем начальную и конечную даты в указанной временной зоне
            end_date := (CURRENT_TIMESTAMP AT TIME ZONE timezone_name)::DATE;
            start_date := end_date - (days_ago || '' days'')::INTERVAL;
            
            -- Проверяем наличие колонки reply_to_message_id
            has_reply_column := EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_name = ''activity_events'' AND column_name = ''reply_to_message_id''
            );
            
            RETURN QUERY
            WITH daily_messages AS (
              SELECT 
                (created_at AT TIME ZONE timezone_name)::DATE AS event_date,
                COUNT(*) AS messages,
                COUNT(CASE WHEN ' || 
                CASE WHEN has_reply_column THEN 'reply_to_message_id IS NOT NULL' 
                     ELSE 'false' END || 
                ' THEN 1 END) AS replies,
                COUNT(DISTINCT tg_user_id) AS active_users
              FROM 
                activity_events
              WHERE 
                org_id = org_id_param
                AND tg_chat_id = tg_chat_id_param
                AND event_type = ''message''
                AND created_at >= (start_date || '' 00:00:00'')::TIMESTAMP AT TIME ZONE timezone_name
                AND created_at <= (end_date || '' 23:59:59'')::TIMESTAMP AT TIME ZONE timezone_name
              GROUP BY 
                event_date
            ),
            daily_joins AS (
              SELECT 
                (created_at AT TIME ZONE timezone_name)::DATE AS event_date,
                COUNT(*) AS joins
              FROM 
                activity_events
              WHERE 
                org_id = org_id_param
                AND tg_chat_id = tg_chat_id_param
                AND event_type = ''join''
                AND created_at >= (start_date || '' 00:00:00'')::TIMESTAMP AT TIME ZONE timezone_name
                AND created_at <= (end_date || '' 23:59:59'')::TIMESTAMP AT TIME ZONE timezone_name
              GROUP BY 
                event_date
            ),
            daily_leaves AS (
              SELECT 
                (created_at AT TIME ZONE timezone_name)::DATE AS event_date,
                COUNT(*) AS leaves
              FROM 
                activity_events
              WHERE 
                org_id = org_id_param
                AND tg_chat_id = tg_chat_id_param
                AND event_type = ''leave''
                AND created_at >= (start_date || '' 00:00:00'')::TIMESTAMP AT TIME ZONE timezone_name
                AND created_at <= (end_date || '' 23:59:59'')::TIMESTAMP AT TIME ZONE timezone_name
              GROUP BY 
                event_date
            ),
            dates AS (
              SELECT generate_series(start_date, end_date, ''1 day''::interval)::date AS event_date
            )
            SELECT 
              d.event_date,
              COALESCE(dm.messages, 0)::INTEGER AS message_count,
              COALESCE(dm.replies, 0)::INTEGER AS reply_count,
              COALESCE(dm.active_users, 0)::INTEGER AS dau,
              COALESCE(dj.joins, 0)::INTEGER AS join_count,
              COALESCE(dl.leaves, 0)::INTEGER AS leave_count,
              CASE 
                WHEN COALESCE(dm.messages, 0) > 0 
                THEN ROUND((COALESCE(dm.replies, 0)::NUMERIC / COALESCE(dm.messages, 1)::NUMERIC) * 100)::INTEGER
                ELSE 0 
              END AS reply_ratio
            FROM 
              dates d
            LEFT JOIN 
              daily_messages dm ON d.event_date = dm.event_date
            LEFT JOIN 
              daily_joins dj ON d.event_date = dj.event_date
            LEFT JOIN 
              daily_leaves dl ON d.event_date = dl.event_date
            ORDER BY 
              d.event_date DESC;
          END;
          $func$ LANGUAGE plpgsql;
        ';
        RAISE NOTICE 'Created get_metrics_in_timezone function';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error creating get_metrics_in_timezone function: %', SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Function get_metrics_in_timezone already exists, skipping';
    END IF;
  ELSE
    RAISE NOTICE 'Table activity_events does not exist, skipping creation of get_metrics_in_timezone function';
  END IF;
END
$$;
