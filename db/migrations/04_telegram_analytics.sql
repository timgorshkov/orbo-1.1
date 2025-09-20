-- Таблица для хранения обработанных Telegram-обновлений (идемпотентность)
CREATE TABLE IF NOT EXISTS telegram_updates (
  id SERIAL PRIMARY KEY,
  update_id BIGINT UNIQUE NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица для хранения событий активности
CREATE TABLE IF NOT EXISTS activity_events (
  id SERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'leave', 'message', 'reaction', 'callback', 'service')),
  participant_id UUID REFERENCES participants(id),
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
CREATE INDEX IF NOT EXISTS idx_activity_org_type_date ON activity_events(org_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_participant ON activity_events(participant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_chat_date ON activity_events(tg_chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_tg_user_id ON activity_events(tg_user_id);

-- Расширение таблицы telegram_groups для хранения настроек уведомлений
ALTER TABLE telegram_groups 
ADD COLUMN IF NOT EXISTS welcome_message TEXT,
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS analytics_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;

-- Таблица для настроек дополнительных ботов (уведомления, личные сообщения)
CREATE TABLE IF NOT EXISTS telegram_bots (
  id SERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  bot_type TEXT NOT NULL CHECK (bot_type IN ('main', 'notifications')),
  token TEXT NOT NULL,
  username TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, bot_type)
);

-- Расширение таблицы profiles для хранения настроек уведомлений
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS activity_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;

-- Таблица для хранения агрегированных метрик по группам
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

-- Функция для расчета DAU
CREATE OR REPLACE FUNCTION get_dau(org_id UUID, target_date TIMESTAMP WITH TIME ZONE)
RETURNS INTEGER AS $$
DECLARE
  result INTEGER;
BEGIN
  SELECT COUNT(DISTINCT tg_user_id) INTO result
  FROM activity_events
  WHERE org_id = $1
    AND event_type IN ('message', 'reaction', 'callback')
    AND created_at::DATE = target_date::DATE;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Функция для расчета Reply Ratio
CREATE OR REPLACE FUNCTION calculate_reply_ratio(org_id UUID, days INTEGER DEFAULT 30)
RETURNS NUMERIC AS $$
DECLARE
  total_messages INTEGER;
  reply_messages INTEGER;
  ratio NUMERIC;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE event_type = 'message'),
    COUNT(*) FILTER (WHERE event_type = 'message' AND reply_to_message_id IS NOT NULL)
  INTO total_messages, reply_messages
  FROM activity_events
  WHERE org_id = $1
    AND created_at > NOW() - ($2 || ' days')::INTERVAL;
    
  IF total_messages = 0 THEN
    RETURN 0;
  END IF;
  
  ratio := (reply_messages::NUMERIC / total_messages) * 100;
  RETURN ROUND(ratio, 2);
END;
$$ LANGUAGE plpgsql;
