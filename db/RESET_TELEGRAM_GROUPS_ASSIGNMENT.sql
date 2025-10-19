-- Сброс автоматически добавленных Telegram групп
-- Этот скрипт удаляет привязку групп к организациям, чтобы они снова появились в "Доступных группах"

DO $$ 
BEGIN
  RAISE NOTICE '=== СБРОС ПРИВЯЗКИ TELEGRAM ГРУПП ===';
  
  -- 1. Удаляем все записи из org_telegram_groups
  RAISE NOTICE 'Шаг 1: Удаление всех записей из org_telegram_groups...';
  DELETE FROM org_telegram_groups;
  RAISE NOTICE 'Удалено записей из org_telegram_groups';
  
  -- 2. Обнуляем org_id в telegram_groups
  RAISE NOTICE 'Шаг 2: Обнуление org_id в telegram_groups...';
  UPDATE telegram_groups SET org_id = NULL WHERE org_id IS NOT NULL;
  RAISE NOTICE 'Обновлено записей в telegram_groups';
  
  -- 3. Отключаем аналитику для групп (она будет включена при добавлении в организацию)
  RAISE NOTICE 'Шаг 3: Отключение аналитики для групп...';
  UPDATE telegram_groups SET analytics_enabled = false WHERE analytics_enabled = true;
  RAISE NOTICE 'Аналитика отключена для всех групп';
  
  -- 4. Удаляем участников и события (так как они были созданы для неправильно привязанных групп)
  RAISE NOTICE 'Шаг 4: Очистка участников и событий...';
  DELETE FROM participant_groups;
  RAISE NOTICE 'Удалены связи participant_groups';
  
  DELETE FROM activity_events;
  RAISE NOTICE 'Удалены activity_events';
  
  DELETE FROM participants;
  RAISE NOTICE 'Удалены participants';
  
  RAISE NOTICE '=== СБРОС ЗАВЕРШЁН ===';
  RAISE NOTICE 'Теперь все Telegram группы будут отображаться в разделе "Доступные группы"';
  RAISE NOTICE 'Вы можете вручную добавить их в нужные организации';
END $$;

-- Проверка результатов
SELECT 
  'telegram_groups' as table_name,
  COUNT(*) as total_groups,
  COUNT(CASE WHEN org_id IS NOT NULL THEN 1 END) as groups_with_org,
  COUNT(CASE WHEN org_id IS NULL THEN 1 END) as groups_without_org
FROM telegram_groups
UNION ALL
SELECT 
  'org_telegram_groups' as table_name,
  COUNT(*) as total,
  0 as with_org,
  0 as without_org
FROM org_telegram_groups
UNION ALL
SELECT 
  'telegram_group_admins' as table_name,
  COUNT(*) as total,
  0,
  0
FROM telegram_group_admins;

