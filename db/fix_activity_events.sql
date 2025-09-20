-- Проверяем и добавляем недостающие колонки в activity_events
DO $$
BEGIN
  -- Проверяем существование таблицы activity_events
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'activity_events'
  ) THEN
    -- Создаем таблицу activity_events, если она не существует
    CREATE TABLE activity_events (
      id SERIAL PRIMARY KEY,
      org_id UUID NOT NULL,
      event_type TEXT NOT NULL,
      tg_user_id BIGINT,
      tg_chat_id BIGINT,
      message_id BIGINT,
      message_thread_id BIGINT,
      reply_to_message_id BIGINT,
      has_media BOOLEAN DEFAULT FALSE,
      chars_count INTEGER,
      links_count INTEGER DEFAULT 0,
      mentions_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      meta JSONB,
      participant_id UUID
    );
    
    RAISE NOTICE 'Created activity_events table';
    
    -- Создаем индексы для новой таблицы
    CREATE INDEX idx_activity_org_type_date ON activity_events(org_id, event_type, created_at);
    CREATE INDEX idx_activity_chat_date ON activity_events(tg_chat_id, created_at);
    CREATE INDEX idx_activity_tg_user_id ON activity_events(tg_user_id);
    CREATE INDEX idx_activity_participant ON activity_events(participant_id, created_at);
    
    RAISE NOTICE 'Created indexes for activity_events';
    
    RETURN; -- Выходим из функции, так как таблица была создана с нуля
  END IF;
  
  -- Если таблица существует, проверяем и добавляем недостающие колонки
  
  -- Проверяем наличие колонки tg_chat_id (основная колонка, которая вызвала ошибку)
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'tg_chat_id'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN tg_chat_id BIGINT;
    RAISE NOTICE 'Added tg_chat_id column to activity_events';
  END IF;
  
  -- Проверяем наличие колонки has_media
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'has_media'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN has_media BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added has_media column to activity_events';
  END IF;

  -- Проверяем наличие колонки message_id
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'message_id'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN message_id BIGINT;
    RAISE NOTICE 'Added message_id column to activity_events';
  END IF;

  -- Проверяем наличие колонки message_thread_id
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'message_thread_id'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN message_thread_id BIGINT;
    RAISE NOTICE 'Added message_thread_id column to activity_events';
  END IF;

  -- Проверяем наличие колонки reply_to_message_id
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'reply_to_message_id'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN reply_to_message_id BIGINT;
    RAISE NOTICE 'Added reply_to_message_id column to activity_events';
  END IF;

  -- Проверяем наличие колонки chars_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'chars_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN chars_count INTEGER;
    RAISE NOTICE 'Added chars_count column to activity_events';
  END IF;

  -- Проверяем наличие колонки links_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'links_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN links_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added links_count column to activity_events';
  END IF;

  -- Проверяем наличие колонки mentions_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'mentions_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN mentions_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added mentions_count column to activity_events';
  END IF;

  -- Проверяем наличие колонки meta
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'meta'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN meta JSONB;
    RAISE NOTICE 'Added meta column to activity_events';
  END IF;

  -- Проверяем наличие колонки created_at
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    RAISE NOTICE 'Added created_at column to activity_events';
  END IF;

  -- Проверяем наличие колонки participant_id
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'participant_id'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN participant_id UUID;
    RAISE NOTICE 'Added participant_id column to activity_events';
  END IF;
  
  -- Проверяем наличие колонки event_type
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'message';
    RAISE NOTICE 'Added event_type column to activity_events';
  END IF;
  
  -- Проверяем наличие колонки org_id
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN org_id UUID;
    RAISE NOTICE 'Added org_id column to activity_events';
  END IF;
  
  -- Проверяем наличие колонки tg_user_id
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'tg_user_id'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN tg_user_id BIGINT;
    RAISE NOTICE 'Added tg_user_id column to activity_events';
  END IF;

  -- Теперь создаем индексы, только если все необходимые колонки существуют
  -- Проверяем наличие индекса idx_activity_org_type_date
  IF NOT EXISTS (
    SELECT FROM pg_indexes
    WHERE tablename = 'activity_events' AND indexname = 'idx_activity_org_type_date'
  ) THEN
    CREATE INDEX idx_activity_org_type_date ON activity_events(org_id, event_type, created_at);
    RAISE NOTICE 'Added idx_activity_org_type_date index to activity_events';
  END IF;

  -- Проверяем наличие индекса idx_activity_chat_date
  IF NOT EXISTS (
    SELECT FROM pg_indexes
    WHERE tablename = 'activity_events' AND indexname = 'idx_activity_chat_date'
  ) THEN
    CREATE INDEX idx_activity_chat_date ON activity_events(tg_chat_id, created_at);
    RAISE NOTICE 'Added idx_activity_chat_date index to activity_events';
  END IF;

  -- Проверяем наличие индекса idx_activity_tg_user_id
  IF NOT EXISTS (
    SELECT FROM pg_indexes
    WHERE tablename = 'activity_events' AND indexname = 'idx_activity_tg_user_id'
  ) THEN
    CREATE INDEX idx_activity_tg_user_id ON activity_events(tg_user_id);
    RAISE NOTICE 'Added idx_activity_tg_user_id index to activity_events';
  END IF;

  -- Проверяем наличие индекса idx_activity_participant
  IF NOT EXISTS (
    SELECT FROM pg_indexes
    WHERE tablename = 'activity_events' AND indexname = 'idx_activity_participant'
  ) THEN
    CREATE INDEX idx_activity_participant ON activity_events(participant_id, created_at);
    RAISE NOTICE 'Added idx_activity_participant index to activity_events';
  END IF;

END
$$;
