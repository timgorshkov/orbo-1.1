-- ==========================================
-- ДИАГНОСТИКА ПРОБЛЕМ С РЕГИСТРАЦИЕЙ
-- ==========================================
-- Этот скрипт проверяет возможные причины ошибки "Database error finding user"

DO $$
BEGIN
  RAISE NOTICE '=== НАЧАЛО ДИАГНОСТИКИ ===';
END $$;

-- 1. Проверяем, что auth schema доступна
DO $$
BEGIN
  RAISE NOTICE '1. Проверка доступа к auth.users...';
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    RAISE NOTICE '   ✓ Таблица auth.users существует';
  ELSE
    RAISE NOTICE '   ✗ ОШИБКА: Таблица auth.users не найдена!';
  END IF;
END $$;

-- 2. Проверяем RLS на auth.users
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  RAISE NOTICE '2. Проверка RLS на auth.users...';
  
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE relname = 'users' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth');
  
  IF rls_enabled THEN
    RAISE NOTICE '   ⚠ RLS включен на auth.users';
  ELSE
    RAISE NOTICE '   ✓ RLS отключен на auth.users';
  END IF;
END $$;

-- 3. Проверяем количество пользователей
DO $$
DECLARE
  user_count INTEGER;
BEGIN
  RAISE NOTICE '3. Проверка количества пользователей...';
  
  SELECT COUNT(*) INTO user_count FROM auth.users;
  RAISE NOTICE '   Пользователей в auth.users: %', user_count;
END $$;

-- 4. Проверяем таблицы, которые ссылаются на auth.users
DO $$
BEGIN
  RAISE NOTICE '4. Проверка зависимых таблиц...';
  
  -- Memberships
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'memberships') THEN
    RAISE NOTICE '   ✓ Таблица memberships существует';
    
    -- Проверяем foreign key
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name = 'memberships' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%user_id%'
    ) THEN
      RAISE NOTICE '   ✓ Foreign key на user_id существует';
    ELSE
      RAISE NOTICE '   ⚠ Foreign key на user_id отсутствует';
    END IF;
  ELSE
    RAISE NOTICE '   ✗ Таблица memberships не существует';
  END IF;
END $$;

-- 5. Проверяем views, которые используют auth.users
DO $$
BEGIN
  RAISE NOTICE '5. Проверка views с auth.users...';
  
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'organization_admins') THEN
    RAISE NOTICE '   ✓ View organization_admins существует';
    
    -- Пробуем выполнить запрос к view
    BEGIN
      PERFORM * FROM organization_admins LIMIT 1;
      RAISE NOTICE '   ✓ View organization_admins работает';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '   ✗ ОШИБКА в view organization_admins: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '   ⚠ View organization_admins не существует';
  END IF;
END $$;

-- 6. Проверяем триггеры на auth.users
DO $$
DECLARE
  trigger_count INTEGER;
  trigger_rec RECORD;
BEGIN
  RAISE NOTICE '6. Проверка триггеров на auth.users...';
  
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE event_object_schema = 'auth'
  AND event_object_table = 'users';
  
  IF trigger_count > 0 THEN
    RAISE NOTICE '   ⚠ Найдено % триггеров на auth.users:', trigger_count;
    
    FOR trigger_rec IN (
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
    ) LOOP
      RAISE NOTICE '     - %: % -> %', trigger_rec.trigger_name, trigger_rec.event_manipulation, trigger_rec.action_statement;
    END LOOP;
  ELSE
    RAISE NOTICE '   ✓ Триггеров на auth.users нет';
  END IF;
END $$;

-- 7. Проверяем функции, которые могут вызываться при создании пользователя
DO $$
DECLARE
  func_rec RECORD;
BEGIN
  RAISE NOTICE '7. Проверка функций обработки пользователей...';
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE '%handle%user%' OR proname LIKE '%on_auth%') THEN
    RAISE NOTICE '   ⚠ Найдены функции обработки пользователей:';
    
    FOR func_rec IN (
      SELECT proname, pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname LIKE '%handle%user%' OR proname LIKE '%on_auth%'
      LIMIT 5
    ) LOOP
      RAISE NOTICE '     - %', func_rec.proname;
    END LOOP;
  ELSE
    RAISE NOTICE '   ✓ Функций обработки пользователей не найдено';
  END IF;
END $$;

-- 8. Проверяем RLS политики на public таблицах
DO $$
DECLARE
  policy_count INTEGER;
  policy_rec RECORD;
BEGIN
  RAISE NOTICE '8. Проверка RLS политик на public таблицах...';
  
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public';
  
  RAISE NOTICE '   Найдено % RLS политик', policy_count;
  
  -- Проверяем политики на organizations
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations') THEN
    RAISE NOTICE '   ⚠ RLS политики на organizations:';
    FOR policy_rec IN (
      SELECT policyname, cmd, qual
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'organizations'
      LIMIT 3
    ) LOOP
      RAISE NOTICE '     - %: %', policy_rec.policyname, policy_rec.cmd;
    END LOOP;
  END IF;
END $$;

-- 9. Проверяем права доступа к auth schema
DO $$
BEGIN
  RAISE NOTICE '9. Проверка прав доступа к auth schema...';
  
  -- Проверяем, можем ли мы SELECT из auth.users
  BEGIN
    PERFORM * FROM auth.users LIMIT 1;
    RAISE NOTICE '   ✓ SELECT из auth.users работает';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '   ✗ ОШИБКА: Недостаточно прав для SELECT из auth.users';
  WHEN OTHERS THEN
    RAISE NOTICE '   ⚠ Другая ошибка при SELECT: %', SQLERRM;
  END;
END $$;

-- 10. Попробуем создать тестового пользователя (через SQL - только для диагностики!)
DO $$
DECLARE
  test_user_id UUID;
BEGIN
  RAISE NOTICE '10. Тест создания пользователя в auth.users...';
  RAISE NOTICE '    (Это только диагностика - пользователь будет удален)';
  
  BEGIN
    -- Генерируем UUID для теста
    test_user_id := gen_random_uuid();
    
    -- Пытаемся вставить тестового пользователя
    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      instance_id,
      aud,
      role
    ) VALUES (
      test_user_id,
      'test@example.com',
      'fake_encrypted_password',
      NOW(),
      NOW(),
      NOW(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated'
    );
    
    RAISE NOTICE '   ✓ Тестовый пользователь создан успешно';
    
    -- Удаляем тестового пользователя
    DELETE FROM auth.users WHERE id = test_user_id;
    RAISE NOTICE '   ✓ Тестовый пользователь удален';
    
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '   ✗ ОШИБКА: Недостаточно прав для INSERT в auth.users';
    RAISE NOTICE '      Это нормально - обычно только Supabase Auth может вставлять в auth.users';
  WHEN OTHERS THEN
    RAISE NOTICE '   ⚠ Другая ошибка: %', SQLERRM;
  END;
END $$;

DO $$
BEGIN
  RAISE NOTICE '=== ДИАГНОСТИКА ЗАВЕРШЕНА ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Рекомендации:';
  RAISE NOTICE '1. Если нет доступа к auth.users - проверьте права в Supabase Dashboard';
  RAISE NOTICE '2. Если есть триггеры на auth.users - проверьте их логику';
  RAISE NOTICE '3. Если есть ошибки в views - пересоздайте их';
  RAISE NOTICE '4. Проверьте логи Supabase в Dashboard → Logs → Auth';
END $$;

