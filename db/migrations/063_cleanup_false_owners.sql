-- Migration 063: Clean up false owners created by Telegram sync
-- Created: 2025-10-28
-- Purpose: Downgrade users incorrectly promoted to owner via telegram_admin

DO $$
DECLARE
  affected_rows INTEGER;
  rec RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CLEANING UP FALSE OWNERS';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Понижаем всех "ложных owner'ов" до admin
  -- Критерии ложного owner:
  --   1. role = 'owner'
  --   2. role_source = 'telegram_admin' (получен через синхронизацию, а не при создании org)
  
  RAISE NOTICE 'Step 1: Downgrading false owners to admin...';
  
  UPDATE memberships
  SET role = 'admin'
  WHERE role = 'owner'
    AND role_source = 'telegram_admin';
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Downgraded % false owners to admin', affected_rows;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Verifying each org has exactly 1 owner...';
  
  -- Проверяем, что у каждой организации ровно 1 owner
  FOR rec IN 
    SELECT 
      org_id,
      COUNT(*) as owners_count,
      array_agg(user_id) as owner_user_ids
    FROM memberships
    WHERE role = 'owner'
    GROUP BY org_id
  LOOP
    IF rec.owners_count = 0 THEN
      RAISE WARNING '  ⚠️  Org % has NO owners!', rec.org_id;
    ELSIF rec.owners_count = 1 THEN
      RAISE NOTICE '  ✅ Org % has exactly 1 owner', rec.org_id;
    ELSE
      RAISE WARNING '  ⚠️  Org % has % owners: %', rec.org_id, rec.owners_count, rec.owner_user_ids;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ CLEANUP COMPLETED';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Downgraded % false owners', affected_rows;
  RAISE NOTICE '  - Each org should now have exactly 1 owner';
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Run migration 064 to fix has_verified_telegram';
  RAISE NOTICE '';
  
END $$;

-- Финальная проверка: показываем все организации с количеством owner'ов
SELECT 
  'FINAL CHECK: Owners per organization' as check_type,
  org_id,
  COUNT(*) as owners_count,
  array_agg(user_id::text) as owner_user_ids,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ OK'
    WHEN COUNT(*) = 0 THEN '❌ NO OWNER!'
    ELSE '⚠️ MULTIPLE OWNERS!'
  END as status
FROM memberships
WHERE role = 'owner'
GROUP BY org_id
ORDER BY COUNT(*) DESC, org_id;

