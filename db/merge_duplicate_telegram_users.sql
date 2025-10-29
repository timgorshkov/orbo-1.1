-- Объединение дублирующихся аккаунтов для одного Telegram пользователя
-- Случай: Один физический пользователь Telegram имеет два аккаунта в auth.users

-- ПАРАМЕТРЫ (настройте под ваш случай):
DO $$
DECLARE
  -- Telegram ID дублирующегося пользователя
  target_tg_user_id BIGINT := 154588486;
  
  -- ID основного аккаунта (с email, owner) - СОХРАНЯЕМ
  primary_user_id UUID := '9bb4b601-fa85-44d4-a811-58bf0c889e93';
  
  -- ID дублирующего аккаунта (shadow profile, admin) - УДАЛЯЕМ
  duplicate_user_id UUID := 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
  
  -- Организация
  target_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
  
  affected_rows INTEGER;
  r RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ОБЪЕДИНЕНИЕ ДУБЛИРУЮЩИХСЯ АККАУНТОВ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Telegram ID: %', target_tg_user_id;
  RAISE NOTICE 'Основной аккаунт (сохраняем): %', primary_user_id;
  RAISE NOTICE 'Дубль (удаляем): %', duplicate_user_id;
  RAISE NOTICE '';
  
  -- ШАГ 1: Проверяем, что основной аккаунт существует
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = primary_user_id) THEN
    RAISE EXCEPTION 'Основной аккаунт % не найден!', primary_user_id;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = duplicate_user_id) THEN
    RAISE EXCEPTION 'Дублирующий аккаунт % не найден!', duplicate_user_id;
  END IF;
  
  -- ШАГ 2: Удаляем дублирующую запись из memberships
  RAISE NOTICE 'Шаг 1: Удаление дублирующей записи из memberships...';
  
  DELETE FROM memberships
  WHERE user_id = duplicate_user_id
    AND org_id = target_org_id;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено % записей из memberships', affected_rows;
  
  -- ШАГ 3: Обновляем metadata основного аккаунта (объединяем группы)
  RAISE NOTICE 'Шаг 2: Обновление metadata основного аккаунта...';
  
  UPDATE memberships m
  SET metadata = jsonb_set(
    COALESCE(m.metadata, '{}'::jsonb),
    '{telegram_groups}',
    (
      SELECT jsonb_agg(DISTINCT value)
      FROM (
        SELECT jsonb_array_elements(
          COALESCE(m.metadata->'telegram_groups', '[]'::jsonb)
        ) as value
        UNION
        SELECT jsonb_array_elements(
          COALESCE(
            (SELECT metadata->'telegram_groups' 
             FROM memberships 
             WHERE user_id = duplicate_user_id AND org_id = target_org_id),
            '[]'::jsonb
          )
        ) as value
      ) combined
    )
  )
  WHERE m.user_id = primary_user_id
    AND m.org_id = target_org_id;
  
  RAISE NOTICE '  Metadata обновлен';
  
  -- ШАГ 4: Переносим записи из user_telegram_accounts
  RAISE NOTICE 'Шаг 3: Проверка user_telegram_accounts...';
  
  -- Проверяем есть ли запись для основного аккаунта
  IF EXISTS (
    SELECT 1 FROM user_telegram_accounts 
    WHERE user_id = primary_user_id AND org_id = target_org_id
  ) THEN
    RAISE NOTICE '  Запись для основного аккаунта уже существует';
    
    -- Удаляем запись дубля
    DELETE FROM user_telegram_accounts
    WHERE user_id = duplicate_user_id AND org_id = target_org_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено % дублирующих записей', affected_rows;
  ELSE
    RAISE NOTICE '  Перенос записи с дубля на основной аккаунт';
    
    -- Переносим запись с дубля на основной аккаунт
    UPDATE user_telegram_accounts
    SET user_id = primary_user_id
    WHERE user_id = duplicate_user_id AND org_id = target_org_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Перенесено % записей', affected_rows;
  END IF;
  
  -- ШАГ 5: Переносим/объединяем participants
  RAISE NOTICE 'Шаг 4: Обработка participants...';
  
  -- Помечаем участника от дубля как объединенного с основным
  UPDATE participants
  SET merged_into = (
    SELECT id FROM participants 
    WHERE user_id = primary_user_id 
      AND org_id = target_org_id 
      AND merged_into IS NULL
    LIMIT 1
  )
  WHERE user_id = duplicate_user_id 
    AND org_id = target_org_id
    AND merged_into IS NULL;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Объединено % записей participants', affected_rows;
  
  -- ШАГ 6: НЕ удаляем дублирующий аккаунт из auth.users
  -- (это может сделать только через Supabase Admin API)
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  ВНИМАНИЕ: Дублирующий аккаунт % НЕ удален из auth.users', duplicate_user_id;
  RAISE NOTICE '   Это нужно сделать вручную через Supabase Dashboard:';
  RAISE NOTICE '   Authentication > Users > Найти user_id и удалить';
  RAISE NOTICE '';
  
  -- ШАГ 7: Проверяем результат
  RAISE NOTICE 'Шаг 5: Проверка результата...';
  RAISE NOTICE '';
  
  -- Показываем что осталось в organization_admins
  RAISE NOTICE 'Записи в organization_admins для организации:';
  FOR r IN 
    SELECT user_id, role, email, has_verified_telegram
    FROM organization_admins
    WHERE org_id = target_org_id
  LOOP
    RAISE NOTICE '  user_id: %, role: %, email: %, telegram: %', 
      r.user_id, r.role, r.email, r.has_verified_telegram;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ОБЪЕДИНЕНИЕ ЗАВЕРШЕНО';
  RAISE NOTICE '========================================';
  
END $$;

