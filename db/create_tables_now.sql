-- ПРИМЕЧАНИЕ: telegram_updates была удалена в миграции 42
-- Telegram API гарантирует уникальность update_id в рамках одного webhook,
-- поэтому дополнительная проверка не требуется

-- Проверяем существование таблицы activity_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'activity_events'
  ) THEN
    -- Таблица для хранения событий активности
    -- ПРИМЕЧАНИЕ: Колонки type, participant_id, tg_group_id удалены в миграции 71
    -- Используем event_type, tg_user_id, tg_chat_id вместо них
    CREATE TABLE activity_events (
      id SERIAL PRIMARY KEY,
      org_id UUID NOT NULL REFERENCES organizations(id),
      event_type TEXT NOT NULL,
      tg_user_id BIGINT,
      tg_chat_id BIGINT NOT NULL,
      message_id BIGINT,
      message_thread_id BIGINT,
      reply_to_message_id BIGINT,
      has_media BOOLEAN DEFAULT FALSE,
      chars_count INTEGER,
      links_count INTEGER DEFAULT 0,
      mentions_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      meta JSONB
    );

    -- Индексы для быстрых агрегаций
    CREATE INDEX idx_activity_org_type_date ON activity_events(org_id, event_type, created_at);
    CREATE INDEX idx_activity_chat_date ON activity_events(tg_chat_id, created_at);
    CREATE INDEX idx_activity_tg_user_id ON activity_events(tg_user_id);
    CREATE INDEX idx_activity_org_tg_user ON activity_events(org_id, tg_user_id);
    
    RAISE NOTICE 'Created activity_events table with indexes';
  ELSE
    RAISE NOTICE 'activity_events table already exists';
    
    -- Проверяем наличие колонки event_type
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'activity_events' AND column_name = 'event_type'
    ) THEN
      ALTER TABLE activity_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'message';
      RAISE NOTICE 'Added event_type column to activity_events';
    END IF;
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
    -- Таблица для хранения агрегированных метрик по группам
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
    
    RAISE NOTICE 'Created group_metrics table';
  ELSE
    RAISE NOTICE 'group_metrics table already exists';
  END IF;
END
$$;

-- Проверяем и обновляем типы данных для tg_chat_id в telegram_groups
DO $$
DECLARE
  column_exists BOOLEAN;
  column_type TEXT;
BEGIN
  -- Проверяем существование таблицы telegram_groups
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'telegram_groups'
  ) THEN
    -- Проверяем существование колонки tg_chat_id
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'telegram_groups' AND column_name = 'tg_chat_id'
    ) INTO column_exists;
    
    IF column_exists THEN
      -- Получаем тип колонки
      SELECT data_type INTO column_type
      FROM information_schema.columns
      WHERE table_name = 'telegram_groups' AND column_name = 'tg_chat_id';
      
      IF column_type = 'text' THEN
        RAISE NOTICE 'tg_chat_id in telegram_groups is text, converting to bigint';
        
        -- Проверяем, что все значения можно преобразовать в bigint
        IF EXISTS (
          SELECT FROM telegram_groups 
          WHERE tg_chat_id !~ '^-?[0-9]+$'
        ) THEN
          RAISE NOTICE 'Some tg_chat_id values are not valid integers, skipping conversion';
        ELSE
          -- Создаем временную колонку
          ALTER TABLE telegram_groups ADD COLUMN tg_chat_id_new BIGINT;
          
          -- Копируем данные с преобразованием
          UPDATE telegram_groups SET tg_chat_id_new = tg_chat_id::bigint;
          
          -- Удаляем старую колонку и переименовываем новую
          ALTER TABLE telegram_groups DROP COLUMN tg_chat_id;
          ALTER TABLE telegram_groups RENAME COLUMN tg_chat_id_new TO tg_chat_id;
          
          RAISE NOTICE 'Converted tg_chat_id to bigint';
        END IF;
      ELSE
        RAISE NOTICE 'tg_chat_id in telegram_groups is already %', column_type;
      END IF;
    ELSE
      RAISE NOTICE 'Column tg_chat_id does not exist in telegram_groups';
    END IF;
  ELSE
    RAISE NOTICE 'Table telegram_groups does not exist';
  END IF;
END
$$;
