-- Migration 073: Fix member_count calculation functions and triggers
-- ============================================================================
-- This migration fixes critical bugs in member_count calculation:
-- 1. recalculate_member_count() was overwriting member_count with itself
-- 2. update_group_member_count() trigger crashed on DELETE operations
--
-- Background:
-- - Migration 071 removed unused columns
-- - Migration 072 removed audit log
-- - This migration fixes counter calculation logic
--
-- Related Issue: External code audit (2025-11-01)
-- ============================================================================

-- 1. Fix recalculate_member_count() function
-- Problem: Variable name conflicted with column name, causing SET member_count = member_count
-- Solution: Rename variable to v_member_count
CREATE OR REPLACE FUNCTION recalculate_member_count(group_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  v_member_count INTEGER;
BEGIN
  -- Считаем активных участников
  SELECT COUNT(*) INTO v_member_count
  FROM participant_groups
  WHERE tg_group_id = group_id
  AND is_active = TRUE;
  
  -- Обновляем счетчик в группе
  UPDATE telegram_groups
  SET member_count = v_member_count
  WHERE tg_chat_id = group_id;
  
  RETURN v_member_count;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix update_group_member_count() trigger function
-- Problem: Used NEW.tg_group_id on DELETE where NEW is NULL, causing trigger to crash
-- Solution: Use COALESCE(NEW.tg_group_id, OLD.tg_group_id) and return appropriate value
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
DECLARE
  v_tg_group_id BIGINT;
BEGIN
  -- Получаем tg_group_id в зависимости от операции (NEW для INSERT/UPDATE, OLD для DELETE)
  v_tg_group_id := COALESCE(NEW.tg_group_id, OLD.tg_group_id);
  
  -- Обновляем счетчик участников в группе
  UPDATE telegram_groups
  SET member_count = (
    SELECT COUNT(*)
    FROM participant_groups pg
    WHERE pg.tg_group_id = v_tg_group_id
    AND pg.is_active = TRUE
  )
  WHERE tg_chat_id = v_tg_group_id;
  
  -- Возвращаем NEW для INSERT/UPDATE, OLD для DELETE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Verify trigger exists (should have been created in create_participants_functions.sql)
-- If not, recreate it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_member_count_trigger'
  ) THEN
    CREATE TRIGGER update_member_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON participant_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_group_member_count();
    
    RAISE NOTICE 'Created update_member_count_trigger';
  ELSE
    RAISE NOTICE 'Trigger update_member_count_trigger already exists';
  END IF;
END
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION recalculate_member_count(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_member_count(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION update_group_member_count() TO authenticated;
GRANT EXECUTE ON FUNCTION update_group_member_count() TO service_role;

-- 5. Recalculate all member_count values to fix any inconsistencies
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id
  AND pg.is_active = TRUE
);

COMMENT ON FUNCTION recalculate_member_count(BIGINT) IS 
  'Recalculates member_count for a specific Telegram group. Fixed in migration 073 to use v_member_count variable.';

COMMENT ON FUNCTION update_group_member_count() IS 
  'Trigger function that automatically updates member_count when participant_groups changes. Fixed in migration 073 to support DELETE operations.';

