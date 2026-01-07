-- Migration: Announcements (Mass Publications to Groups)
-- Created: 2026-01-07

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Контент
  title VARCHAR(255) NOT NULL,           -- Заголовок (для UI, не отправляется в группы)
  content TEXT NOT NULL,                  -- Текст с Telegram Markdown
  
  -- Связь с событием (опционально)
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  reminder_type VARCHAR(50),              -- '24h', '1h', NULL для ручных
  
  -- Целевые группы (tg_chat_id)
  target_groups BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],  -- Массив tg_chat_id групп
  
  -- Расписание
  scheduled_at TIMESTAMPTZ NOT NULL,      -- Когда отправить
  sent_at TIMESTAMPTZ,                    -- Когда отправлено
  
  -- Статус
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  
  -- Авторство (имена, не ссылки на auth.users)
  created_by_id UUID,                     -- ID пользователя-создателя
  created_by_name VARCHAR(255) NOT NULL,  -- Имя автора или "автоматически"
  updated_by_id UUID,                     -- ID последнего редактора
  updated_by_name VARCHAR(255),           -- Имя последнего редактора
  
  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Результаты отправки
  send_results JSONB DEFAULT '{}'::jsonb  -- {group_id: {success: bool, message_id, error}}
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_announcements_org ON announcements(org_id);
CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_announcements_event ON announcements(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);

-- Триггер для updated_at
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS announcements_updated_at ON announcements;
CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_announcements_updated_at();

-- RLS Policies
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Политика: члены организации могут просматривать анонсы
DROP POLICY IF EXISTS announcements_select_policy ON announcements;
CREATE POLICY announcements_select_policy ON announcements
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Политика: администраторы организации могут создавать/редактировать анонсы
DROP POLICY IF EXISTS announcements_insert_policy ON announcements;
CREATE POLICY announcements_insert_policy ON announcements
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS announcements_update_policy ON announcements;
CREATE POLICY announcements_update_policy ON announcements
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM org_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS announcements_delete_policy ON announcements;
CREATE POLICY announcements_delete_policy ON announcements
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM org_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Функция для получения предстоящих анонсов для cron job
CREATE OR REPLACE FUNCTION get_pending_announcements()
RETURNS TABLE (
  id UUID,
  org_id UUID,
  title VARCHAR(255),
  content TEXT,
  target_groups UUID[],
  scheduled_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.org_id,
    a.title,
    a.content,
    a.target_groups,
    a.scheduled_at
  FROM announcements a
  WHERE a.status = 'scheduled'
    AND a.scheduled_at <= NOW()
  ORDER BY a.scheduled_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для создания напоминаний о событии
CREATE OR REPLACE FUNCTION create_event_reminders(
  p_event_id UUID,
  p_org_id UUID,
  p_event_title TEXT,
  p_event_description TEXT,
  p_event_start_time TIMESTAMPTZ,
  p_event_location TEXT,
  p_target_groups UUID[]
) RETURNS void AS $$
DECLARE
  reminder_24h TIMESTAMPTZ;
  reminder_1h TIMESTAMPTZ;
  reminder_content TEXT;
BEGIN
  -- Формируем текст напоминания
  reminder_content := '🗓 Напоминание: ' || p_event_title || E'\n\n';
  reminder_content := reminder_content || '📅 ' || to_char(p_event_start_time AT TIME ZONE 'Europe/Moscow', 'DD.MM.YYYY HH24:MI') || E'\n';
  
  IF p_event_location IS NOT NULL AND p_event_location != '' THEN
    reminder_content := reminder_content || '📍 ' || p_event_location || E'\n';
  END IF;
  
  IF p_event_description IS NOT NULL AND p_event_description != '' THEN
    reminder_content := reminder_content || E'\n' || p_event_description;
  END IF;

  -- Анонс за 24 часа
  reminder_24h := p_event_start_time - INTERVAL '24 hours';
  IF reminder_24h > NOW() THEN
    INSERT INTO announcements (
      org_id, title, content, event_id, reminder_type,
      target_groups, scheduled_at, created_by_name
    ) VALUES (
      p_org_id,
      'Напоминание за 24ч: ' || p_event_title,
      reminder_content,
      p_event_id,
      '24h',
      p_target_groups,
      reminder_24h,
      'автоматически'
    );
  END IF;

  -- Анонс за 1 час
  reminder_1h := p_event_start_time - INTERVAL '1 hour';
  IF reminder_1h > NOW() THEN
    INSERT INTO announcements (
      org_id, title, content, event_id, reminder_type,
      target_groups, scheduled_at, created_by_name
    ) VALUES (
      p_org_id,
      'Напоминание за 1ч: ' || p_event_title,
      reminder_content,
      p_event_id,
      '1h',
      p_target_groups,
      reminder_1h,
      'автоматически'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарии
COMMENT ON TABLE announcements IS 'Анонсы для массовой публикации в Telegram-группы организации';
COMMENT ON COLUMN announcements.title IS 'Заголовок анонса (только для UI, не отправляется)';
COMMENT ON COLUMN announcements.content IS 'Текст анонса с Telegram Markdown форматированием';
COMMENT ON COLUMN announcements.event_id IS 'Связанное событие (для автоматических напоминаний)';
COMMENT ON COLUMN announcements.reminder_type IS 'Тип напоминания: 24h, 1h, или NULL для ручных';
COMMENT ON COLUMN announcements.target_groups IS 'Массив ID групп из org_telegram_groups';
COMMENT ON COLUMN announcements.created_by_name IS 'Имя автора или "автоматически" для авто-созданных';
COMMENT ON COLUMN announcements.updated_by_name IS 'Имя последнего редактора';
COMMENT ON COLUMN announcements.send_results IS 'Результаты отправки по группам: {group_id: {success, message_id, error}}';

