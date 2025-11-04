-- Migration 082: Fix check_participant_exclusion trigger
-- Date: Nov 4, 2025
-- Purpose: Remove reference to deleted org_id column in telegram_groups
--          Use org_telegram_groups mapping instead

CREATE OR REPLACE FUNCTION check_participant_exclusion()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_remaining_groups INTEGER;
BEGIN
  -- Если участника удалили из группы
  IF (TG_OP = 'DELETE') THEN
    -- Получаем org_id группы через org_telegram_groups
    SELECT otg.org_id INTO v_org_id
    FROM org_telegram_groups otg
    WHERE otg.tg_group_id = OLD.tg_group_id
    LIMIT 1;
    
    -- Если группа не привязана ни к одной организации, выходим
    IF v_org_id IS NULL THEN
      RETURN OLD;
    END IF;
    
    -- Проверяем, остался ли участник хотя бы в одной группе этой организации
    SELECT COUNT(*) INTO v_remaining_groups
    FROM participant_groups pg
    JOIN org_telegram_groups otg ON otg.tg_group_id = pg.tg_group_id
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
  RAISE NOTICE 'Migration 082 Complete: Fixed check_participant_exclusion trigger to use org_telegram_groups'; 
END $$;

