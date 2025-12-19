-- =============================================
-- Migration 153: Notification Rules
-- Настраиваемые правила уведомлений для организаций
-- =============================================

-- Таблица правил уведомлений
CREATE TABLE IF NOT EXISTS public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Привязка к организации
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  
  -- Название и описание правила
  name TEXT NOT NULL,
  description TEXT,
  
  -- Тип правила
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'negative_discussion',    -- Негатив/ругань в чате (AI)
    'unanswered_question',    -- Неотвеченный вопрос X часов (AI)
    'group_inactive'          -- Нет сообщений в группе X часов
  )),
  
  -- Настройки правила (JSON)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Структура config по типам:
    
    negative_discussion:
    {
      "groups": ["tg_chat_id1", "tg_chat_id2"] или null (все группы),
      "severity_threshold": "medium", // low, medium, high
      "check_interval_minutes": 60,
      "use_ai": true
    }
    
    unanswered_question:
    {
      "groups": ["tg_chat_id1"] или null,
      "timeout_hours": 2,
      "work_hours_start": "09:00",
      "work_hours_end": "18:00",
      "work_days": [1,2,3,4,5], // 0=Sunday, 1=Monday, ...
      "timezone": "Europe/Moscow",
      "use_ai": true
    }
    
    group_inactive:
    {
      "groups": ["tg_chat_id1"] или null,
      "timeout_hours": 24,
      "work_hours_start": null, // null = круглосуточно
      "work_hours_end": null,
      "work_days": null, // null = все дни
      "timezone": "Europe/Moscow"
    }
  */
  
  -- AI настройки
  use_ai BOOLEAN NOT NULL DEFAULT false,
  
  -- Получатели уведомлений
  notify_owner BOOLEAN NOT NULL DEFAULT true,
  notify_admins BOOLEAN NOT NULL DEFAULT false,
  notify_user_ids UUID[] DEFAULT '{}', -- Конкретные пользователи
  
  -- Статус правила
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Отслеживание работы
  last_check_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_notification_rules_org ON notification_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_notification_rules_enabled ON notification_rules(org_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_notification_rules_type ON notification_rules(rule_type);

-- RLS политики
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

-- Владельцы и админы организации могут видеть правила
CREATE POLICY "notification_rules_select" ON notification_rules
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Владельцы и админы могут создавать правила
CREATE POLICY "notification_rules_insert" ON notification_rules
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Владельцы и админы могут обновлять правила
CREATE POLICY "notification_rules_update" ON notification_rules
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Владельцы и админы могут удалять правила
CREATE POLICY "notification_rules_delete" ON notification_rules
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Триггер обновления updated_at
CREATE OR REPLACE FUNCTION update_notification_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_rules_updated_at
  BEFORE UPDATE ON notification_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_rules_updated_at();

-- Комментарии
COMMENT ON TABLE notification_rules IS 'Правила автоматических уведомлений для организаций';
COMMENT ON COLUMN notification_rules.rule_type IS 'Тип правила: negative_discussion, unanswered_question, group_inactive';
COMMENT ON COLUMN notification_rules.use_ai IS 'Использовать AI для анализа (платная фича)';
COMMENT ON COLUMN notification_rules.config IS 'JSON конфигурация правила (группы, таймауты, рабочие часы и т.д.)';

