-- Создаем таблицу group_metrics, если она не существует
CREATE TABLE IF NOT EXISTS group_metrics (
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

-- Добавляем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_group_metrics_org_date ON group_metrics(org_id, date);
CREATE INDEX IF NOT EXISTS idx_group_metrics_chat_date ON group_metrics(tg_chat_id, date);

-- Проверяем и добавляем недостающие колонки в activity_events
DO $$
BEGIN
  -- Проверяем наличие колонки chars_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'chars_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN chars_count INTEGER;
  END IF;
  
  -- Проверяем наличие колонки links_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'links_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN links_count INTEGER DEFAULT 0;
  END IF;
  
  -- Проверяем наличие колонки mentions_count
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'mentions_count'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN mentions_count INTEGER DEFAULT 0;
  END IF;
END
$$;
