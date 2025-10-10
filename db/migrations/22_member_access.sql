-- Migration 22: Member Access & Participant Statuses
-- Добавляет статусы участников и RLS политики для доступа members

-- 1. Создать ENUM для статусов участников
DO $$ BEGIN
  CREATE TYPE participant_status_enum AS ENUM (
    'participant',      -- участник организации (есть в Telegram-группах)
    'event_attendee',   -- участник мероприятий (зарегистрировался на событие)
    'candidate',        -- кандидат (временный статус)
    'excluded'          -- исключённый (был удалён из всех групп)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Добавить колонку participant_status к таблице participants
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS participant_status participant_status_enum DEFAULT 'participant';

-- 3. Заполнить статус для существующих участников
UPDATE participants
SET participant_status = 'participant'
WHERE participant_status IS NULL;

-- 4. Добавить индексы для производительности
CREATE INDEX IF NOT EXISTS idx_participants_status 
ON participants(participant_status);

CREATE INDEX IF NOT EXISTS idx_participants_org_status 
ON participants(org_id, participant_status);

-- 5. Обновить RLS политики для participants

-- Удалить старые политики, если они мешают
DROP POLICY IF EXISTS "Members can view org participants" ON participants;

-- Members могут видеть всех участников своей организации (кроме excluded)
CREATE POLICY "Members can view org participants"
ON participants FOR SELECT
TO authenticated
USING (
  participant_status != 'excluded'
  AND org_id IN (
    -- Пользователь - owner/admin организации
    SELECT org_id FROM memberships WHERE user_id = auth.uid()
    UNION
    -- Пользователь - участник организации (через Telegram)
    SELECT tg.org_id
    FROM participant_groups pg
    JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
    JOIN participants p ON p.id = pg.participant_id
    JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id AND uta.org_id = tg.org_id
    WHERE uta.user_id = auth.uid()
      AND p.participant_status IN ('participant', 'event_attendee')
  )
);

-- 6. Создать функцию для определения роли пользователя в организации
CREATE OR REPLACE FUNCTION get_user_role_in_org(p_user_id UUID, p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Проверяем memberships (owner/admin)
  SELECT role INTO v_role
  FROM memberships
  WHERE user_id = p_user_id AND org_id = p_org_id
  LIMIT 1;
  
  IF v_role IN ('owner', 'admin') THEN
    RETURN v_role;
  END IF;
  
  -- Проверяем участие через Telegram-группы
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
  
  -- Нет доступа
  RETURN 'guest';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Создать функцию для проверки исключения участника из всех групп
CREATE OR REPLACE FUNCTION check_participant_exclusion()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_remaining_groups INTEGER;
BEGIN
  -- Если участника удалили из группы
  IF (TG_OP = 'DELETE') THEN
    -- Получаем org_id группы, из которой удалили
    SELECT org_id INTO v_org_id
    FROM telegram_groups
    WHERE tg_chat_id = OLD.tg_group_id;
    
    -- Проверяем, остался ли участник хотя бы в одной группе этой организации
    SELECT COUNT(*) INTO v_remaining_groups
    FROM participant_groups pg
    JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
    WHERE pg.participant_id = OLD.participant_id
      AND tg.org_id = v_org_id;
    
    -- Если не осталось ни одной группы → меняем статус на 'excluded'
    IF v_remaining_groups = 0 THEN
      UPDATE participants
      SET participant_status = 'excluded',
          updated_at = NOW()
      WHERE id = OLD.participant_id
        AND participant_status = 'participant';
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 8. Создать триггер для автоматического изменения статуса при исключении
DROP TRIGGER IF EXISTS trigger_check_participant_exclusion ON participant_groups;
CREATE TRIGGER trigger_check_participant_exclusion
AFTER DELETE ON participant_groups
FOR EACH ROW
EXECUTE FUNCTION check_participant_exclusion();

-- 9. Создать функцию для восстановления статуса участника
CREATE OR REPLACE FUNCTION restore_participant_status()
RETURNS TRIGGER AS $$
BEGIN
  -- При добавлении в группу обратно → меняем статус с 'excluded' на 'participant'
  UPDATE participants
  SET participant_status = 'participant',
      updated_at = NOW()
  WHERE id = NEW.participant_id
    AND participant_status = 'excluded';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Создать триггер для автоматического восстановления статуса
DROP TRIGGER IF EXISTS trigger_restore_participant_status ON participant_groups;
CREATE TRIGGER trigger_restore_participant_status
AFTER INSERT ON participant_groups
FOR EACH ROW
EXECUTE FUNCTION restore_participant_status();

-- 11. Обновить RLS политики для events (members могут видеть опубликованные события)
DROP POLICY IF EXISTS "Members can view published events" ON events;
CREATE POLICY "Members can view published events"
ON events FOR SELECT
TO authenticated
USING (
  status = 'published'
  OR org_id IN (
    -- Owner/Admin могут видеть все события
    SELECT org_id FROM memberships WHERE user_id = auth.uid()
  )
);

-- 12. Обновить RLS политики для material_pages (members могут читать все материалы)
DROP POLICY IF EXISTS "Members can view org materials" ON material_pages;
CREATE POLICY "Members can view org materials"
ON material_pages FOR SELECT
TO authenticated
USING (
  org_id IN (
    -- Owner/Admin организации
    SELECT org_id FROM memberships WHERE user_id = auth.uid()
    UNION
    -- Member организации (через Telegram)
    SELECT tg.org_id
    FROM participant_groups pg
    JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
    JOIN participants p ON p.id = pg.participant_id
    JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id AND uta.org_id = tg.org_id
    WHERE uta.user_id = auth.uid()
      AND p.participant_status IN ('participant', 'event_attendee')
  )
);

-- 13. Создать view для получения всех организаций пользователя с ролями
CREATE OR REPLACE VIEW user_organizations AS
SELECT DISTINCT
  o.id AS org_id,
  o.name AS org_name,
  o.logo_url,
  COALESCE(m.role, 'member') AS role,
  m.user_id,
  o.created_at,
  -- Приоритет для сортировки (owner > admin > member)
  CASE 
    WHEN m.role = 'owner' THEN 1
    WHEN m.role = 'admin' THEN 2
    ELSE 3
  END AS role_priority
FROM organizations o
LEFT JOIN memberships m ON m.org_id = o.id
LEFT JOIN telegram_groups tg ON tg.org_id = o.id
LEFT JOIN participant_groups pg ON pg.tg_group_id = tg.tg_chat_id
LEFT JOIN participants p ON p.id = pg.participant_id
LEFT JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id AND uta.org_id = tg.org_id
WHERE 
  m.user_id IS NOT NULL -- owner/admin
  OR (uta.user_id IS NOT NULL AND p.participant_status IN ('participant', 'event_attendee'));

-- 14. Комментарии к таблицам и колонкам
COMMENT ON COLUMN participants.participant_status IS 'Статус участника: participant (в группах), event_attendee (только события), candidate (кандидат), excluded (исключён)';
COMMENT ON FUNCTION get_user_role_in_org IS 'Возвращает роль пользователя в организации: owner, admin, member или guest';
COMMENT ON FUNCTION check_participant_exclusion IS 'Автоматически меняет статус на excluded при удалении из всех групп организации';
COMMENT ON FUNCTION restore_participant_status IS 'Автоматически восстанавливает статус participant при добавлении в группу';

-- Готово!

