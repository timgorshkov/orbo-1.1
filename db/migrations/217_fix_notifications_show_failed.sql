-- =============================================
-- Migration 217: Fix get_org_notifications to include failed notifications
-- 
-- The issue: AI alerts were logged with status='failed' (because Telegram 
-- delivery failed due to a BigInt parsing bug) but get_org_notifications 
-- only returned status='sent'. This meant AI alerts never appeared in the
-- Notifications section, only on the dashboard.
--
-- Fix: Include both 'sent' and 'failed' notifications in the unified list.
-- The alert is valid regardless of delivery channel status.
-- =============================================

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
  -- Notification logs (AI-based alerts) - include both sent and failed
  SELECT 
    nl.id,
    nl.created_at,
    nl.rule_type::TEXT as notification_type,
    'notification_rule'::TEXT as source_type,
    -- Title includes group name for group-related notifications
    CASE nl.rule_type
      WHEN 'negative_discussion' THEN 
        'Негатив: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      WHEN 'unanswered_question' THEN 
        'Вопрос: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      WHEN 'group_inactive' THEN 
        'Неактивность: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      ELSE nl.rule_type
    END as title,
    -- Description with more context
    CASE nl.rule_type
      WHEN 'negative_discussion' THEN
        COALESCE(nl.trigger_context->>'summary', 'Обнаружен негатив')
      WHEN 'unanswered_question' THEN
        COALESCE(nl.trigger_context->>'question_text', 'Вопрос без ответа')
      WHEN 'group_inactive' THEN
        'Группа «' || COALESCE(nl.trigger_context->>'group_title', '?') || 
        '» неактивна ' || COALESCE(nl.trigger_context->>'inactive_hours', '?') || ' ч.'
      ELSE
        COALESCE(nl.trigger_context->>'summary', 'Уведомление')
    END::TEXT as description,
    COALESCE(nl.trigger_context->>'severity', 'medium')::TEXT as severity,
    -- Generate proper Telegram link
    CASE 
      WHEN nl.trigger_context->>'last_message_id' IS NOT NULL THEN
        get_telegram_message_link(
          nl.trigger_context->>'group_id',
          (nl.trigger_context->>'last_message_id')::BIGINT
        )
      WHEN nl.trigger_context->>'group_id' IS NOT NULL THEN
        get_telegram_message_link(nl.trigger_context->>'group_id', NULL)
      ELSE
        CONCAT('/p/', p_org_id, '/telegram')
    END as link_url,
    COALESCE(nl.trigger_context->>'group_title', 'Группа')::TEXT as link_text,
    nl.trigger_context as metadata,
    nl.resolved_at,
    nl.resolved_by,
    nl.resolved_by_name
  FROM notification_logs nl
  WHERE nl.org_id = p_org_id
    AND nl.notification_status IN ('sent', 'failed')  -- Include failed (alert is valid regardless of delivery)
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
