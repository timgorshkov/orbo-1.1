-- Migration: Add critical_event system notification rules for all organizations
-- This creates auto-system rules for low event registration alerts

-- First, drop and recreate the check constraint to allow 'critical_event' type
ALTER TABLE notification_rules DROP CONSTRAINT IF EXISTS notification_rules_rule_type_check;
ALTER TABLE notification_rules ADD CONSTRAINT notification_rules_rule_type_check 
  CHECK (rule_type IN ('negative_discussion', 'unanswered_question', 'group_inactive', 'churning_participant', 'inactive_newcomer', 'critical_event'));

-- For each organization that has events, create a critical_event rule if not exists
INSERT INTO notification_rules (org_id, name, description, rule_type, config, is_enabled, is_system, use_ai, notify_owner, notify_admins, send_telegram)
SELECT DISTINCT 
  o.id as org_id,
  'Мало регистраций на событие' as name,
  'Уведомление если на ближайшее событие зарегистрировалось менее 30% от вместимости' as description,
  'critical_event' as rule_type,
  '{"registration_threshold_percent": 30}'::jsonb as config,
  true as is_enabled,
  true as is_system,
  false as use_ai,
  true as notify_owner,
  false as notify_admins,
  false as send_telegram
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM notification_rules nr 
  WHERE nr.org_id = o.id 
  AND nr.rule_type = 'critical_event'
  AND nr.is_system = true
);
