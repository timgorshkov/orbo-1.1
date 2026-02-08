-- =============================================
-- Migration 219: Fix get_org_notifications time filtering
-- 
-- Issues fixed:
-- 1. attention_zone_items use created_at which never updates on upsert,
--    so long-standing items (churning > 7 days) disappeared from notifications
-- 2. Attention zone items should show as long as they're unresolved,
--    regardless of how long ago they were first detected
-- =============================================

CREATE OR REPLACE FUNCTION get_org_notifications(
  p_org_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_include_resolved BOOLEAN DEFAULT TRUE,
  p_hours_back INTEGER DEFAULT 168 -- 7 days (only for notification_logs)
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
  -- Notification logs (AI-based alerts) - time window applies
  SELECT 
    nl.id,
    nl.created_at,
    nl.rule_type::TEXT as notification_type,
    'notification_rule'::TEXT as source_type,
    CASE nl.rule_type
      WHEN 'negative_discussion' THEN 
        'Негатив: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      WHEN 'unanswered_question' THEN 
        'Вопрос: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      WHEN 'group_inactive' THEN 
        'Неактивность: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      ELSE nl.rule_type
    END as title,
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
    AND nl.notification_status IN ('sent', 'failed')
    AND nl.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND (p_include_resolved OR nl.resolved_at IS NULL)
  
  UNION ALL
  
  -- Attention zone items - NO time window (show as long as unresolved)
  -- These are synced hourly by cron, but created_at stays from first detection
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
    AND (p_include_resolved OR azi.resolved_at IS NULL)
  
  ORDER BY resolved_at NULLS FIRST, created_at DESC
  LIMIT p_limit;
END;
$$;
