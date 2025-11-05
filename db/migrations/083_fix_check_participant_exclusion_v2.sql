-- Migration 083: Fix check_participant_exclusion trigger (v2)
-- Date: Nov 4, 2025
-- Purpose: Fix column name: tg_group_id → tg_chat_id in org_telegram_groups
-- Replaces migration 082 which had incorrect column name

CREATE OR REPLACE FUNCTION check_participant_exclusion()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_remaining_groups INTEGER;
BEGIN
  -- Если участника удалили из группы
  IF (TG_OP = 'DELETE') THEN
    -- Получаем org_id группы через org_telegram_groups
    -- ⚠️ ИСПРАВЛЕНО: otg.tg_chat_id (а не tg_group_id)
    SELECT otg.org_id INTO v_org_id
    FROM org_telegram_groups otg
    WHERE otg.tg_chat_id = OLD.tg_group_id
    LIMIT 1;
    
    -- Если группа не привязана ни к одной организации, выходим
    IF v_org_id IS NULL THEN
      RETURN OLD;
    END IF;
    
    -- Проверяем, остался ли участник хотя бы в одной группе этой организации
    -- ⚠️ ИСПРАВЛЕНО: otg.tg_chat_id (а не tg_group_id)
    SELECT COUNT(*) INTO v_remaining_groups
    FROM participant_groups pg
    JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
    WHERE pg.participant_id = OLD.participant_id
      AND otg.org_id = v_org_id
      AND pg.is_active = TRUE;
    
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

-- Trigger should already exist, this just updates the function

DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 083 Complete: Fixed check_participant_exclusion trigger (tg_chat_id column)'; 
END $$;

