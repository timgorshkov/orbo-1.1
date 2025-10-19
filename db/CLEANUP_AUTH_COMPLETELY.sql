-- ==========================================
-- ПОЛНАЯ ОЧИСТКА SUPABASE AUTH
-- ==========================================
-- Используйте этот скрипт, если регистрация не работает после очистки БД
-- Ошибка: "unable to find user from email identity for duplicates"

DO $$
BEGIN
  RAISE NOTICE '=== НАЧАЛО ПОЛНОЙ ОЧИСТКИ AUTH ===';
END $$;

-- 1. Очистка auth.identities (битые записи)
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  RAISE NOTICE '1. Очистка auth.identities...';
  
  DELETE FROM auth.identities
  WHERE user_id NOT IN (SELECT id FROM auth.users);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '   Удалено битых identities: %', deleted_count;
  
  -- Проверяем оставшиеся
  SELECT COUNT(*) INTO deleted_count FROM auth.identities;
  RAISE NOTICE '   Оставшихся identities: %', deleted_count;
END $$;

-- 2. Очистка auth.sessions
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  RAISE NOTICE '2. Очистка auth.sessions...';
  
  -- Если нет пользователей - удаляем все сессии
  IF NOT EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
    DELETE FROM auth.sessions;
  ELSE
    DELETE FROM auth.sessions
    WHERE user_id NOT IN (SELECT id FROM auth.users);
  END IF;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '   Удалено битых sessions: %', deleted_count;
  
  SELECT COUNT(*) INTO deleted_count FROM auth.sessions;
  RAISE NOTICE '   Оставшихся sessions: %', deleted_count;
END $$;

-- 3. Очистка auth.refresh_tokens
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  RAISE NOTICE '3. Очистка auth.refresh_tokens...';
  
  -- Если нет пользователей - удаляем все токены
  IF NOT EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
    DELETE FROM auth.refresh_tokens;
  ELSE
    -- Приводим типы для совместимости (user_id может быть VARCHAR или UUID)
    DELETE FROM auth.refresh_tokens
    WHERE user_id::TEXT NOT IN (SELECT id::TEXT FROM auth.users);
  END IF;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '   Удалено битых refresh_tokens: %', deleted_count;
  
  SELECT COUNT(*) INTO deleted_count FROM auth.refresh_tokens;
  RAISE NOTICE '   Оставшихся refresh_tokens: %', deleted_count;
END $$;

-- 4. Очистка auth.mfa_factors (если есть)
DO $$
DECLARE
  deleted_count INTEGER;
  table_exists BOOLEAN;
BEGIN
  -- Проверяем, существует ли таблица
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'auth' 
    AND table_name = 'mfa_factors'
  ) INTO table_exists;
  
  IF table_exists THEN
    RAISE NOTICE '4. Очистка auth.mfa_factors...';
    
    DELETE FROM auth.mfa_factors
    WHERE user_id NOT IN (SELECT id FROM auth.users);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '   Удалено битых mfa_factors: %', deleted_count;
  ELSE
    RAISE NOTICE '4. Таблица auth.mfa_factors не существует, пропускаем...';
  END IF;
END $$;

-- 5. Очистка auth.audit_log_entries (если нужно)
DO $$
DECLARE
  deleted_count INTEGER;
  table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'auth' 
    AND table_name = 'audit_log_entries'
  ) INTO table_exists;
  
  IF table_exists THEN
    RAISE NOTICE '5. Очистка auth.audit_log_entries...';
    
    -- Удаляем только старые записи (более 1 часа)
    DELETE FROM auth.audit_log_entries
    WHERE created_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '   Удалено старых audit_log_entries: %', deleted_count;
  ELSE
    RAISE NOTICE '5. Таблица auth.audit_log_entries не существует, пропускаем...';
  END IF;
END $$;

-- 6. Если БД полностью пустая - удаляем всех пользователей
DO $$
DECLARE
  user_count INTEGER;
  org_count INTEGER;
BEGIN
  RAISE NOTICE '6. Проверка, нужно ли удалить всех пользователей...';
  
  -- Считаем пользователей и организации
  SELECT COUNT(*) INTO user_count FROM auth.users;
  SELECT COUNT(*) INTO org_count FROM organizations;
  
  RAISE NOTICE '   Пользователей: %, Организаций: %', user_count, org_count;
  
  -- Если нет организаций, но есть пользователи - удаляем их
  IF org_count = 0 AND user_count > 0 THEN
    RAISE NOTICE '   Нет организаций, удаляем всех пользователей...';
    DELETE FROM auth.users;
    RAISE NOTICE '   ✓ Все пользователи удалены';
  ELSIF user_count = 0 THEN
    RAISE NOTICE '   ✓ Пользователей нет, всё чисто';
  ELSE
    RAISE NOTICE '   ⚠ Есть пользователи и организации, не удаляем';
  END IF;
END $$;

-- 7. Финальная проверка
DO $$
DECLARE
  user_count INTEGER;
  identity_count INTEGER;
  session_count INTEGER;
  token_count INTEGER;
BEGIN
  RAISE NOTICE '=== ФИНАЛЬНАЯ ПРОВЕРКА ===';
  
  SELECT COUNT(*) INTO user_count FROM auth.users;
  SELECT COUNT(*) INTO identity_count FROM auth.identities;
  SELECT COUNT(*) INTO session_count FROM auth.sessions;
  SELECT COUNT(*) INTO token_count FROM auth.refresh_tokens;
  
  RAISE NOTICE 'auth.users: %', user_count;
  RAISE NOTICE 'auth.identities: %', identity_count;
  RAISE NOTICE 'auth.sessions: %', session_count;
  RAISE NOTICE 'auth.refresh_tokens: %', token_count;
  
  IF identity_count = 0 AND session_count = 0 AND token_count = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ AUTH ПОЛНОСТЬЮ ОЧИЩЕН! Теперь регистрация должна работать.';
    RAISE NOTICE '';
    RAISE NOTICE 'Следующие шаги:';
    RAISE NOTICE '1. Очистите cookies в браузере';
    RAISE NOTICE '2. Откройте https://app.orbo.ru/signup в режиме инкогнито';
    RAISE NOTICE '3. Попробуйте зарегистрироваться';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠ Остались записи в auth таблицах';
    RAISE NOTICE 'Это нормально, если у вас есть активные пользователи';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE '=== ОЧИСТКА AUTH ЗАВЕРШЕНА ===';
END $$;

