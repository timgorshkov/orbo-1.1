-- =============================================
-- Migration 157: System Notification Rules
-- Добавление системных правил для молчунов и новичков
-- =============================================

-- Удаляем ВСЕ возможные constraint'ы на rule_type
ALTER TABLE notification_rules 
DROP CONSTRAINT IF EXISTS chk_rule_type;

ALTER TABLE notification_rules 
DROP CONSTRAINT IF EXISTS notification_rules_rule_type_check;

-- Добавляем новый constraint с расширенным списком типов
ALTER TABLE notification_rules 
ADD CONSTRAINT notification_rules_rule_type_check CHECK (rule_type IN (
  'negative_discussion', 
  'unanswered_question', 
  'group_inactive',
  'churning_participant',   -- Системное: участник на грани оттока
  'inactive_newcomer'       -- Системное: неактивный новичок
));

-- Добавляем флаг для системных правил
ALTER TABLE notification_rules 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS send_telegram BOOLEAN DEFAULT TRUE;

-- Комментарии
COMMENT ON COLUMN notification_rules.is_system IS 'Системное правило (автоматически создаётся для org)';
COMMENT ON COLUMN notification_rules.send_telegram IS 'Отправлять ли уведомления в Telegram (false для системных)';

-- Функция для создания системных правил при создании организации
-- (можно вызвать вручную для существующих организаций)
CREATE OR REPLACE FUNCTION create_system_notification_rules(p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Правило для молчунов
  INSERT INTO notification_rules (
    org_id,
    name,
    description,
    rule_type,
    config,
    use_ai,
    notify_owner,
    notify_admins,
    is_enabled,
    is_system,
    send_telegram
  ) VALUES (
    p_org_id,
    'Участники на грани оттока',
    'Уведомления об участниках, которые молчат более 14 дней',
    'churning_participant',
    '{"days_silent": 14}'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    FALSE  -- НЕ отправляем в Telegram
  )
  ON CONFLICT (org_id, name) DO NOTHING;
  
  IF FOUND THEN v_count := v_count + 1; END IF;
  
  -- Правило для неактивных новичков
  INSERT INTO notification_rules (
    org_id,
    name,
    description,
    rule_type,
    config,
    use_ai,
    notify_owner,
    notify_admins,
    is_enabled,
    is_system,
    send_telegram
  ) VALUES (
    p_org_id,
    'Новички без активности',
    'Уведомления о новых участниках, которые не проявляют активность',
    'inactive_newcomer',
    '{"days_since_first": 14}'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    FALSE  -- НЕ отправляем в Telegram
  )
  ON CONFLICT (org_id, name) DO NOTHING;
  
  IF FOUND THEN v_count := v_count + 1; END IF;
  
  RETURN v_count;
END;
$$;

-- Добавляем уникальный индекс для предотвращения дублей системных правил
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_rules_org_name 
ON notification_rules(org_id, name);

-- Создаём системные правила для всех существующих организаций с группами
DO $$
DECLARE
  r RECORD;
  v_total INTEGER := 0;
BEGIN
  FOR r IN 
    SELECT DISTINCT org_id 
    FROM org_telegram_groups 
    WHERE org_id IS NOT NULL
  LOOP
    PERFORM create_system_notification_rules(r.org_id);
    v_total := v_total + 1;
  END LOOP;
  
  RAISE NOTICE 'Created system rules for % organizations', v_total;
END;
$$;

-- Триггер для автоматического создания системных правил при добавлении группы
CREATE OR REPLACE FUNCTION trigger_create_system_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Создаём системные правила для организации, если их ещё нет
  PERFORM create_system_notification_rules(NEW.org_id);
  RETURN NEW;
END;
$$;

-- Триггер на добавление группы в организацию
DROP TRIGGER IF EXISTS trg_create_system_rules ON org_telegram_groups;
CREATE TRIGGER trg_create_system_rules
  AFTER INSERT ON org_telegram_groups
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_system_rules();

