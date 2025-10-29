-- Очистка ботов из админов организаций

DO $$
DECLARE
  bot_tg_user_ids BIGINT[] := ARRAY[8355772450, 777000]; -- orbo_community_bot, Telegram Service
  affected_rows INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ОЧИСТКА БОТОВ ИЗ АДМИНОВ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Шаг 1: Удалить memberships для ботов
  RAISE NOTICE 'Шаг 1: Удаление memberships для ботов...';
  DELETE FROM memberships m
  WHERE m.user_id IN (
    SELECT p.user_id 
    FROM participants p 
    WHERE p.tg_user_id = ANY(bot_tg_user_ids)
      AND p.user_id IS NOT NULL
  );
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено memberships: %', affected_rows;
  
  -- Шаг 2: Удалить participants для ботов
  RAISE NOTICE '';
  RAISE NOTICE 'Шаг 2: Удаление participants для ботов...';
  DELETE FROM participants p
  WHERE p.tg_user_id = ANY(bot_tg_user_ids);
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено participants: %', affected_rows;
  
  -- Шаг 3: Удалить из telegram_group_admins
  RAISE NOTICE '';
  RAISE NOTICE 'Шаг 3: Удаление из telegram_group_admins...';
  DELETE FROM telegram_group_admins tga
  WHERE tga.tg_user_id = ANY(bot_tg_user_ids);
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено из telegram_group_admins: %', affected_rows;
  
  -- Шаг 4: Удалить shadow users для ботов (если были созданы)
  RAISE NOTICE '';
  RAISE NOTICE 'Шаг 4: Удаление shadow users для ботов...';
  DELETE FROM auth.users u
  WHERE (u.raw_user_meta_data->>'telegram_user_id')::BIGINT = ANY(bot_tg_user_ids)
    AND (u.raw_user_meta_data->>'shadow_profile')::boolean = true;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено shadow users: %', affected_rows;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ОЧИСТКА ЗАВЕРШЕНА';
  RAISE NOTICE '========================================';
  
END $$;

-- Проверка результата: боты не должны быть в organization_admins
SELECT 
  '✅ ПРОВЕРКА: Ботов в админах' as check_type,
  COUNT(*) as bot_admins_count
FROM organization_admins oa
WHERE oa.full_name LIKE 'User 835577%' -- orbo_community_bot
   OR oa.full_name LIKE 'User 777000%'; -- Telegram Service

-- Должно быть 0

