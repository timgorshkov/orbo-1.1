-- Migration 34: Fix get_user_role_in_org для участников через события
-- Добавляем проверку участия через event_registrations

CREATE OR REPLACE FUNCTION get_user_role_in_org(p_user_id UUID, p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 1. Проверяем memberships (owner/admin/member)
  SELECT role INTO v_role
  FROM memberships
  WHERE user_id = p_user_id AND org_id = p_org_id
  LIMIT 1;
  
  IF v_role IN ('owner', 'admin', 'member') THEN
    RETURN v_role;
  END IF;
  
  -- 2. Проверяем участие через Telegram-группы
  PERFORM 1
  FROM participants p
  JOIN participant_groups pg ON pg.participant_id = p.id
  JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
  JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id AND uta.org_id = tg.org_id
  WHERE uta.user_id = p_user_id
    AND tg.org_id = p_org_id
    AND p.participant_status IN ('participant', 'event_attendee')
  LIMIT 1;
  
  IF FOUND THEN
    RETURN 'member';
  END IF;
  
  -- 3. Проверяем участие через события (регистрация на события организации)
  PERFORM 1
  FROM user_telegram_accounts uta
  JOIN participants p ON p.tg_user_id = uta.telegram_user_id AND p.org_id = uta.org_id
  JOIN event_registrations er ON er.participant_id = p.id
  JOIN events e ON e.id = er.event_id
  WHERE uta.user_id = p_user_id
    AND e.org_id = p_org_id
    AND p.participant_status IN ('participant', 'event_attendee')
    AND er.status = 'registered'
  LIMIT 1;
  
  IF FOUND THEN
    RETURN 'member';
  END IF;
  
  -- 4. Нет доступа
  RETURN 'guest';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_role_in_org IS 'Возвращает роль пользователя в организации: owner, admin, member или guest. Проверяет memberships, участие в Telegram-группах и регистрацию на события.';



