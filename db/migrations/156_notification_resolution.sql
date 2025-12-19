-- =============================================
-- Migration 156: Notification Resolution
-- Добавление полей для отметки уведомлений как решённых
-- =============================================

-- Добавляем поля для резолюции уведомлений
ALTER TABLE notification_logs 
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS resolved_by_name TEXT;

-- Индекс для быстрого поиска нерешённых уведомлений
CREATE INDEX IF NOT EXISTS idx_notification_logs_unresolved 
ON notification_logs(org_id, notification_status, resolved_at)
WHERE resolved_at IS NULL AND notification_status = 'sent';

-- Индекс для поиска решённых уведомлений (для скрытия через 24ч)
CREATE INDEX IF NOT EXISTS idx_notification_logs_resolved_recent
ON notification_logs(org_id, resolved_at DESC)
WHERE resolved_at IS NOT NULL;

-- =============================================
-- Таблица для хранения уведомлений типа "attention zone"
-- (чтобы отслеживать решённые участники)
-- =============================================
CREATE TABLE IF NOT EXISTS attention_zone_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Тип элемента
  item_type TEXT NOT NULL CHECK (item_type IN (
    'churning_participant',    -- Участник на грани оттока
    'inactive_newcomer',       -- Неактивный новичок
    'critical_event'           -- Критичное событие
  )),
  
  -- Идентификатор элемента (participant_id, event_id и т.п.)
  item_id UUID NOT NULL,
  
  -- Кэш данных для отображения
  item_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Резолюция
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by_name TEXT,
  
  -- Для предотвращения дублей и ротации
  last_shown_at TIMESTAMPTZ DEFAULT NOW(),
  times_shown INTEGER DEFAULT 1,
  
  -- Уникальность: один элемент = одна запись за период
  CONSTRAINT unique_attention_item UNIQUE (org_id, item_type, item_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_attention_zone_items_org ON attention_zone_items(org_id);
CREATE INDEX IF NOT EXISTS idx_attention_zone_items_unresolved 
ON attention_zone_items(org_id, item_type, resolved_at)
WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attention_zone_items_rotation
ON attention_zone_items(org_id, last_shown_at ASC, times_shown ASC);

-- RLS
ALTER TABLE attention_zone_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attention_zone_items_select" ON attention_zone_items
  FOR SELECT USING (
    org_id IN (
      SELECT m.org_id FROM memberships m 
      WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "attention_zone_items_update" ON attention_zone_items
  FOR UPDATE USING (
    org_id IN (
      SELECT m.org_id FROM memberships m 
      WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
    )
  );

-- Функция для резолюции notification_log
CREATE OR REPLACE FUNCTION resolve_notification(
  p_notification_id UUID,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notification_logs
  SET 
    resolved_at = NOW(),
    resolved_by = p_user_id,
    resolved_by_name = p_user_name
  WHERE id = p_notification_id
    AND resolved_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Функция для резолюции attention zone item
CREATE OR REPLACE FUNCTION resolve_attention_item(
  p_item_id UUID,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE attention_zone_items
  SET 
    resolved_at = NOW(),
    resolved_by = p_user_id,
    resolved_by_name = p_user_name
  WHERE id = p_item_id
    AND resolved_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Функция для получения unified notifications
CREATE OR REPLACE FUNCTION get_org_notifications(
  p_org_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_include_resolved BOOLEAN DEFAULT TRUE,
  p_hours_back INTEGER DEFAULT 168 -- 7 days
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  notification_type TEXT,
  source_type TEXT,
  title TEXT,
  description TEXT,
  severity TEXT,
  link_url TEXT,
  link_text TEXT,
  metadata JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_by_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Notification logs (AI-based alerts)
  SELECT 
    nl.id,
    nl.created_at,
    nl.rule_type::TEXT as notification_type,
    'notification_rule'::TEXT as source_type,
    CASE nl.rule_type
      WHEN 'negative_discussion' THEN 'Негатив в группе'
      WHEN 'unanswered_question' THEN 'Неотвеченный вопрос'
      WHEN 'group_inactive' THEN 'Неактивность группы'
      ELSE nl.rule_type
    END as title,
    COALESCE(
      nl.trigger_context->>'summary',
      nl.trigger_context->>'question_text',
      CONCAT('Неактивность ', nl.trigger_context->>'inactive_hours', ' ч.')
    )::TEXT as description,
    COALESCE(nl.trigger_context->>'severity', 'medium')::TEXT as severity,
    CONCAT('/p/', p_org_id, '/telegram/groups/', nl.trigger_context->>'group_id')::TEXT as link_url,
    COALESCE(nl.trigger_context->>'group_title', 'Группа')::TEXT as link_text,
    nl.trigger_context as metadata,
    nl.resolved_at,
    nl.resolved_by,
    nl.resolved_by_name
  FROM notification_logs nl
  WHERE nl.org_id = p_org_id
    AND nl.notification_status = 'sent'
    AND nl.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND (p_include_resolved OR nl.resolved_at IS NULL)
  
  UNION ALL
  
  -- Attention zone items (churning participants, inactive newcomers)
  SELECT 
    azi.id,
    azi.created_at,
    azi.item_type::TEXT as notification_type,
    'attention_zone'::TEXT as source_type,
    CASE azi.item_type
      WHEN 'churning_participant' THEN 'Участник на грани оттока'
      WHEN 'inactive_newcomer' THEN 'Новичок без активности'
      WHEN 'critical_event' THEN 'Критичное событие'
      ELSE azi.item_type
    END as title,
    COALESCE(
      azi.item_data->>'full_name',
      azi.item_data->>'title',
      'Без имени'
    )::TEXT as description,
    CASE azi.item_type
      WHEN 'churning_participant' THEN 'warning'
      WHEN 'inactive_newcomer' THEN 'info'
      WHEN 'critical_event' THEN 'error'
      ELSE 'info'
    END as severity,
    CASE azi.item_type
      WHEN 'critical_event' THEN CONCAT('/p/', p_org_id, '/events/', azi.item_id)
      ELSE CONCAT('/p/', p_org_id, '/members/', azi.item_id)
    END as link_url,
    CASE azi.item_type
      WHEN 'critical_event' THEN COALESCE(azi.item_data->>'title', 'Событие')
      ELSE COALESCE(azi.item_data->>'full_name', 'Участник')
    END as link_text,
    azi.item_data as metadata,
    azi.resolved_at,
    azi.resolved_by,
    azi.resolved_by_name
  FROM attention_zone_items azi
  WHERE azi.org_id = p_org_id
    AND azi.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND (p_include_resolved OR azi.resolved_at IS NULL)
  
  ORDER BY resolved_at NULLS FIRST, created_at DESC
  LIMIT p_limit;
END;
$$;

-- Функция для инкремента times_shown
CREATE OR REPLACE FUNCTION increment_attention_item_shown(
  p_org_id UUID,
  p_item_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE attention_zone_items
  SET 
    times_shown = times_shown + 1,
    last_shown_at = NOW()
  WHERE org_id = p_org_id
    AND item_id = ANY(p_item_ids);
END;
$$;

-- Комментарии
COMMENT ON TABLE attention_zone_items IS 'Элементы зон внимания с отслеживанием резолюции';
COMMENT ON COLUMN notification_logs.resolved_at IS 'Время отметки как решённого';
COMMENT ON COLUMN notification_logs.resolved_by IS 'ID пользователя, отметившего как решённое';
COMMENT ON COLUMN notification_logs.resolved_by_name IS 'Имя пользователя для отображения';

