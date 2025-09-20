-- Проверяем и добавляем недостающие колонки в activity_events
DO $$
BEGIN
  -- Проверяем наличие колонки chars_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'chars_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN chars_count INTEGER;
    RAISE NOTICE 'Added chars_count column to activity_events';
  ELSE
    RAISE NOTICE 'chars_count column already exists in activity_events';
  END IF;
  
  -- Проверяем наличие колонки links_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'links_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN links_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added links_count column to activity_events';
  ELSE
    RAISE NOTICE 'links_count column already exists in activity_events';
  END IF;
  
  -- Проверяем наличие колонки mentions_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'mentions_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN mentions_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added mentions_count column to activity_events';
  ELSE
    RAISE NOTICE 'mentions_count column already exists in activity_events';
  END IF;
END
$$;

-- Проверяем существование таблицы group_metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'group_metrics'
  ) THEN
    CREATE TABLE group_metrics (
      id SERIAL PRIMARY KEY,
      org_id UUID NOT NULL REFERENCES organizations(id),
      tg_chat_id BIGINT NOT NULL,
      date DATE NOT NULL,
      dau INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      reply_ratio NUMERIC(5,2) DEFAULT 0,
      join_count INTEGER DEFAULT 0,
      leave_count INTEGER DEFAULT 0,
      net_member_change INTEGER DEFAULT 0,
      silent_rate NUMERIC(5,2) DEFAULT 0,
      UNIQUE(org_id, tg_chat_id, date)
    );
    
    CREATE INDEX idx_group_metrics_org_date ON group_metrics(org_id, date);
    CREATE INDEX idx_group_metrics_chat_date ON group_metrics(tg_chat_id, date);
    
    RAISE NOTICE 'Created group_metrics table and indexes';
  ELSE
    RAISE NOTICE 'group_metrics table already exists';
  END IF;
END
$$;

-- Проверяем и обновляем типы данных для tg_chat_id в telegram_groups
DO $$
DECLARE
  column_type TEXT;
BEGIN
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_name = 'telegram_groups' AND column_name = 'tg_chat_id';
  
  IF column_type <> 'bigint' THEN
    RAISE NOTICE 'tg_chat_id in telegram_groups is %, converting to bigint', column_type;
    
    -- Создаем временную колонку
    ALTER TABLE telegram_groups ADD COLUMN tg_chat_id_new BIGINT;
    
    -- Копируем данные с преобразованием
    UPDATE telegram_groups SET tg_chat_id_new = tg_chat_id::bigint;
    
    -- Удаляем старую колонку и переименовываем новую
    ALTER TABLE telegram_groups DROP COLUMN tg_chat_id;
    ALTER TABLE telegram_groups RENAME COLUMN tg_chat_id_new TO tg_chat_id;
    
    RAISE NOTICE 'Converted tg_chat_id to bigint';
  ELSE
    RAISE NOTICE 'tg_chat_id in telegram_groups is already bigint';
  END IF;
END
$$;

-- Обновляем существующие метрики на основе данных в activity_events
DO $$
DECLARE
  org_record RECORD;
  chat_record RECORD;
  date_record RECORD;
  message_count INTEGER;
  reply_count INTEGER;
  join_count INTEGER;
  leave_count INTEGER;
  dau INTEGER;
  unique_users TEXT[];
BEGIN
  -- Получаем все уникальные комбинации org_id и tg_chat_id из activity_events
  FOR org_record IN 
    SELECT DISTINCT org_id FROM activity_events
  LOOP
    FOR chat_record IN 
      SELECT DISTINCT tg_chat_id FROM activity_events WHERE org_id = org_record.org_id
    LOOP
      -- Получаем все уникальные даты для этой комбинации org_id и tg_chat_id
      FOR date_record IN 
        SELECT DISTINCT DATE(created_at) as event_date 
        FROM activity_events 
        WHERE org_id = org_record.org_id AND tg_chat_id = chat_record.tg_chat_id
        ORDER BY event_date DESC
        LIMIT 7 -- Обновляем только последние 7 дней для экономии времени
      LOOP
        -- Получаем количество сообщений за день
        SELECT COUNT(*) INTO message_count
        FROM activity_events
        WHERE org_id = org_record.org_id 
          AND tg_chat_id = chat_record.tg_chat_id
          AND event_type = 'message'
          AND DATE(created_at) = date_record.event_date;
          
        -- Получаем количество ответов за день
        SELECT COUNT(*) INTO reply_count
        FROM activity_events
        WHERE org_id = org_record.org_id 
          AND tg_chat_id = chat_record.tg_chat_id
          AND event_type = 'message'
          AND reply_to_message_id IS NOT NULL
          AND DATE(created_at) = date_record.event_date;
          
        -- Получаем количество присоединений за день
        SELECT COUNT(*) INTO join_count
        FROM activity_events
        WHERE org_id = org_record.org_id 
          AND tg_chat_id = chat_record.tg_chat_id
          AND event_type = 'join'
          AND DATE(created_at) = date_record.event_date;
          
        -- Получаем количество выходов за день
        SELECT COUNT(*) INTO leave_count
        FROM activity_events
        WHERE org_id = org_record.org_id 
          AND tg_chat_id = chat_record.tg_chat_id
          AND event_type = 'leave'
          AND DATE(created_at) = date_record.event_date;
          
        -- Получаем уникальных пользователей за день (DAU)
        SELECT ARRAY_AGG(DISTINCT tg_user_id::TEXT) INTO unique_users
        FROM activity_events
        WHERE org_id = org_record.org_id 
          AND tg_chat_id = chat_record.tg_chat_id
          AND event_type IN ('message', 'reaction', 'callback')
          AND DATE(created_at) = date_record.event_date;
          
        dau := COALESCE(ARRAY_LENGTH(unique_users, 1), 0);
        
        -- Вычисляем reply ratio
        IF message_count > 0 THEN
          reply_count := COALESCE(reply_count, 0);
          reply_ratio := ROUND((reply_count::NUMERIC / message_count) * 100, 2);
        ELSE
          reply_ratio := 0;
        END IF;
        
        -- Вычисляем net member change
        net_member_change := COALESCE(join_count, 0) - COALESCE(leave_count, 0);
        
        -- Вставляем или обновляем запись в group_metrics
        INSERT INTO group_metrics (
          org_id, tg_chat_id, date, dau, message_count, 
          reply_count, reply_ratio, join_count, leave_count, net_member_change
        ) VALUES (
          org_record.org_id, chat_record.tg_chat_id, date_record.event_date, 
          dau, message_count, reply_count, reply_ratio, 
          join_count, leave_count, net_member_change
        )
        ON CONFLICT (org_id, tg_chat_id, date) 
        DO UPDATE SET
          dau = EXCLUDED.dau,
          message_count = EXCLUDED.message_count,
          reply_count = EXCLUDED.reply_count,
          reply_ratio = EXCLUDED.reply_ratio,
          join_count = EXCLUDED.join_count,
          leave_count = EXCLUDED.leave_count,
          net_member_change = EXCLUDED.net_member_change;
          
        RAISE NOTICE 'Updated metrics for org % chat % date %: messages=%, replies=%, dau=%', 
          org_record.org_id, chat_record.tg_chat_id, date_record.event_date, 
          message_count, reply_count, dau;
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;
