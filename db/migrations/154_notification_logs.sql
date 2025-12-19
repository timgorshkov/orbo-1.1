-- =============================================
-- Migration 154: Notification Logs
-- Логи и дедупликация уведомлений
-- =============================================

-- Таблица логов уведомлений
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Привязка к правилу и организации
  rule_id UUID NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Тип и контекст срабатывания
  rule_type TEXT NOT NULL,
  trigger_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Структура trigger_context по типам:
    
    negative_discussion:
    {
      "group_id": "tg_chat_id",
      "group_title": "Group Name",
      "severity": "medium",
      "summary": "AI summary of negativity",
      "message_count": 15,
      "sample_messages": ["msg1", "msg2"]
    }
    
    unanswered_question:
    {
      "group_id": "tg_chat_id",
      "group_title": "Group Name",
      "question_text": "What is ...?",
      "question_author": "John",
      "question_author_id": "tg_user_id",
      "question_time": "2025-12-19T10:00:00Z",
      "hours_without_answer": 3
    }
    
    group_inactive:
    {
      "group_id": "tg_chat_id",
      "group_title": "Group Name",
      "last_message_at": "2025-12-18T10:00:00Z",
      "inactive_hours": 26
    }
  */
  
  -- Статус отправки
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (notification_status IN (
    'pending',    -- Ожидает отправки
    'sent',       -- Отправлено
    'failed',     -- Ошибка отправки
    'skipped'     -- Пропущено (дубликат)
  )),
  
  -- Получатели
  sent_to_user_ids UUID[] DEFAULT '{}',
  sent_via TEXT[] DEFAULT '{}', -- ['telegram', 'email']
  
  -- Ошибка (если была)
  error_message TEXT,
  
  -- AI расходы (если использовался AI)
  ai_tokens_used INTEGER,
  ai_cost_usd DECIMAL(10, 6),
  
  -- Дедупликация - хеш для предотвращения дублей
  dedup_hash TEXT,
  
  -- Время обработки
  processed_at TIMESTAMPTZ
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_notification_logs_rule ON notification_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_org ON notification_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_dedup ON notification_logs(rule_id, dedup_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(notification_status) WHERE notification_status = 'pending';

-- Примечание: Дедупликация реализована через функцию check_notification_duplicate()
-- Уникальный индекс с NOW() невозможен (NOW не IMMUTABLE)
-- Вместо этого используем обычный индекс для быстрого поиска дублей
CREATE INDEX IF NOT EXISTS idx_notification_logs_recent_dedup 
  ON notification_logs(rule_id, dedup_hash, created_at DESC, notification_status);

-- RLS политики
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Владельцы и админы могут видеть логи
CREATE POLICY "notification_logs_select" ON notification_logs
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Вставка только через service role (cron job)
-- Обычные пользователи не могут создавать логи
CREATE POLICY "notification_logs_insert_service" ON notification_logs
  FOR INSERT WITH CHECK (false); -- Только service role

-- Обновление только через service role
CREATE POLICY "notification_logs_update_service" ON notification_logs
  FOR UPDATE USING (false); -- Только service role

-- Функция проверки дубликатов
CREATE OR REPLACE FUNCTION check_notification_duplicate(
  p_rule_id UUID,
  p_dedup_hash TEXT,
  p_hours INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM notification_logs
    WHERE rule_id = p_rule_id
      AND dedup_hash = p_dedup_hash
      AND created_at > NOW() - (p_hours || ' hours')::INTERVAL
      AND notification_status IN ('sent', 'pending')
  );
END;
$$;

-- Функция для очистки старых логов (старше 30 дней)
CREATE OR REPLACE FUNCTION cleanup_old_notification_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM notification_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Комментарии
COMMENT ON TABLE notification_logs IS 'Логи отправленных уведомлений с дедупликацией';
COMMENT ON COLUMN notification_logs.dedup_hash IS 'Хеш для дедупликации (MD5 от ключевых полей trigger_context)';
COMMENT ON COLUMN notification_logs.ai_cost_usd IS 'Стоимость AI анализа в USD';
COMMENT ON FUNCTION check_notification_duplicate IS 'Проверяет, было ли уже такое уведомление за последние N часов';

