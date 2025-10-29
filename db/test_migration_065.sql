-- Тест миграции 065: Проверка автоматического создания админов

-- Тест на вашей новой организации
DO $$
DECLARE
  test_org_id UUID := '960e2dab-8503-485b-b86c-181d9209f283';
  result RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ТЕСТ МИГРАЦИИ 065';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Запускаем синхронизацию
  RAISE NOTICE '1. Запуск sync_telegram_admins...';
  FOR result IN SELECT * FROM sync_telegram_admins(test_org_id) LOOP
    RAISE NOTICE '  tg_user_id: %, action: %, groups: %', 
      result.tg_user_id, result.action, result.groups_count;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '2. Проверка результата...';
END $$;

-- Проверка: сколько админов в organization_admins
SELECT 
  '✅ РЕЗУЛЬТАТ' as status,
  COUNT(*) as total_admins,
  COUNT(*) FILTER (WHERE role = 'owner') as owners,
  COUNT(*) FILTER (WHERE role = 'admin') as admins
FROM organization_admins
WHERE org_id = '960e2dab-8503-485b-b86c-181d9209f283';

-- Детальный список команды
SELECT 
  '✅ КОМАНДА ОРГАНИЗАЦИИ' as status,
  role,
  full_name,
  email,
  telegram_username,
  role_source,
  (metadata->>'is_owner_in_groups')::boolean as is_group_creator
FROM organization_admins
WHERE org_id = '960e2dab-8503-485b-b86c-181d9209f283'
ORDER BY 
  CASE role WHEN 'owner' THEN 1 ELSE 2 END,
  full_name;

-- Проверка: все ли participants имеют user_id
SELECT 
  '✅ PARTICIPANTS С USER_ID' as status,
  COUNT(*) as total_participants,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) as with_user_id,
  COUNT(*) FILTER (WHERE user_id IS NULL) as without_user_id
FROM participants
WHERE org_id = '960e2dab-8503-485b-b86c-181d9209f283'
  AND merged_into IS NULL;

