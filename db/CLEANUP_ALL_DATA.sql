-- ==========================================
-- ПОЛНАЯ ОЧИСТКА БД ДЛЯ ТЕСТИРОВАНИЯ С НУЛЯ
-- ==========================================
-- ВНИМАНИЕ: Это удалит ВСЕ данные!
-- Структура таблиц сохранится, удалятся только данные.
-- 
-- Используйте этот скрипт в Supabase SQL Editor
-- 
-- Автор: Orbo Development Team
-- Дата: 2025-01-20

-- Начало транзакции и очистка
DO $$
DECLARE
  table_exists BOOLEAN;
BEGIN
  RAISE NOTICE '=== НАЧАЛО ОЧИСТКИ БД ===';
  
  -- 1. Временно отключаем триггеры для ускорения
  RAISE NOTICE 'Отключение триггеров...';
  EXECUTE 'SET session_replication_role = replica';
  
  -- 2. Удаляем данные из зависимых таблиц (от самых зависимых к независимым)
  -- Функция для безопасной очистки таблицы
  
  -- Activity & Events
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_events') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка activity_events...';
    TRUNCATE TABLE activity_events CASCADE;
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_registrations') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка event_registrations...';
    TRUNCATE TABLE event_registrations CASCADE;
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка events...';
    TRUNCATE TABLE events CASCADE;
  END IF;
  
  -- Materials
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'material_pages') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка material_pages...';
    TRUNCATE TABLE material_pages CASCADE;
  END IF;
  
  -- Participants & Merging
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'participant_merge_history') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка participant_merge_history...';
    TRUNCATE TABLE participant_merge_history CASCADE;
  ELSE
    RAISE NOTICE 'Таблица participant_merge_history не существует, пропускаем...';
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'participant_groups') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка participant_groups...';
    TRUNCATE TABLE participant_groups CASCADE;
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'participants') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка participants...';
    TRUNCATE TABLE participants CASCADE;
  END IF;
  
  -- Telegram
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_group_admins') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка telegram_group_admins...';
    TRUNCATE TABLE telegram_group_admins CASCADE;
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_telegram_accounts') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка user_telegram_accounts...';
    TRUNCATE TABLE user_telegram_accounts CASCADE;
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_auth_codes') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка telegram_auth_codes...';
    TRUNCATE TABLE telegram_auth_codes CASCADE;
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'org_telegram_groups') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка org_telegram_groups...';
    TRUNCATE TABLE org_telegram_groups CASCADE;
  END IF;
  
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_groups') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка telegram_groups...';
    TRUNCATE TABLE telegram_groups CASCADE;
  END IF;
  
  -- Group Metrics
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_metrics') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка group_metrics...';
    TRUNCATE TABLE group_metrics CASCADE;
  END IF;
  
  -- Invitations
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invitations') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка invitations...';
    TRUNCATE TABLE invitations CASCADE;
  END IF;
  
  -- Memberships
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'memberships') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка memberships...';
    TRUNCATE TABLE memberships CASCADE;
  END IF;
  
  -- Organizations
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') INTO table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Очистка organizations...';
    TRUNCATE TABLE organizations CASCADE;
  END IF;
  
  -- 3. Удаляем пользователей из auth (ВНИМАНИЕ: необратимо!)
  RAISE NOTICE 'Очистка auth.users...';
  DELETE FROM auth.users;
  
  -- 3.1. Очищаем связанные auth таблицы (важно для предотвращения ошибок регистрации!)
  RAISE NOTICE 'Очистка auth.identities (битые записи)...';
  DELETE FROM auth.identities;
  
  RAISE NOTICE 'Очистка auth.sessions (битые сессии)...';
  DELETE FROM auth.sessions;
  
  RAISE NOTICE 'Очистка auth.refresh_tokens (битые токены)...';
  DELETE FROM auth.refresh_tokens;
  
  -- 4. Включаем триггеры обратно
  RAISE NOTICE 'Включение триггеров...';
  EXECUTE 'SET session_replication_role = DEFAULT';
  
  -- 5. Опционально: Сбрасываем sequences (если хотите начать ID с 1)
  -- RAISE NOTICE 'Сброс sequences...';
  -- EXECUTE 'ALTER SEQUENCE IF EXISTS events_id_seq RESTART WITH 1';
  -- EXECUTE 'ALTER SEQUENCE IF EXISTS telegram_groups_id_seq RESTART WITH 1';
  -- EXECUTE 'ALTER SEQUENCE IF EXISTS telegram_auth_codes_id_seq RESTART WITH 1';
  -- EXECUTE 'ALTER SEQUENCE IF EXISTS invitations_id_seq RESTART WITH 1';
  
  RAISE NOTICE '=== ОЧИСТКА ЗАВЕРШЕНА ===';
END $$;

-- 6. Проверяем, что таблицы пустые
DO $$
DECLARE
  table_counts TEXT := '';
  user_count INT;
  org_count INT;
  membership_count INT;
  participant_count INT;
  tg_group_count INT;
  tg_admin_count INT;
  tg_account_count INT;
  event_count INT;
  event_reg_count INT;
  material_count INT;
  activity_count INT;
  metrics_count INT;
  invitation_count INT;
  part_group_count INT;
BEGIN
  RAISE NOTICE '=== ПРОВЕРКА РЕЗУЛЬТАТОВ ===';
  
  -- Auth users (всегда существует)
  SELECT COUNT(*) INTO user_count FROM auth.users;
  
  -- Остальные таблицы с проверкой существования
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
    SELECT COUNT(*) INTO org_count FROM organizations;
  ELSE
    org_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'memberships') THEN
    SELECT COUNT(*) INTO membership_count FROM memberships;
  ELSE
    membership_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'participants') THEN
    SELECT COUNT(*) INTO participant_count FROM participants;
  ELSE
    participant_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_groups') THEN
    SELECT COUNT(*) INTO tg_group_count FROM telegram_groups;
  ELSE
    tg_group_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_group_admins') THEN
    SELECT COUNT(*) INTO tg_admin_count FROM telegram_group_admins;
  ELSE
    tg_admin_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_telegram_accounts') THEN
    SELECT COUNT(*) INTO tg_account_count FROM user_telegram_accounts;
  ELSE
    tg_account_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') THEN
    SELECT COUNT(*) INTO event_count FROM events;
  ELSE
    event_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_registrations') THEN
    SELECT COUNT(*) INTO event_reg_count FROM event_registrations;
  ELSE
    event_reg_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'material_pages') THEN
    SELECT COUNT(*) INTO material_count FROM material_pages;
  ELSE
    material_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_events') THEN
    SELECT COUNT(*) INTO activity_count FROM activity_events;
  ELSE
    activity_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_metrics') THEN
    SELECT COUNT(*) INTO metrics_count FROM group_metrics;
  ELSE
    metrics_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invitations') THEN
    SELECT COUNT(*) INTO invitation_count FROM invitations;
  ELSE
    invitation_count := -1;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'participant_groups') THEN
    SELECT COUNT(*) INTO part_group_count FROM participant_groups;
  ELSE
    part_group_count := -1;
  END IF;
  
  -- Формируем отчёт
  RAISE NOTICE 'Количество записей в таблицах:';
  RAISE NOTICE 'auth.users: %', user_count;
  RAISE NOTICE 'organizations: %', CASE WHEN org_count = -1 THEN 'не существует' ELSE org_count::TEXT END;
  RAISE NOTICE 'memberships: %', CASE WHEN membership_count = -1 THEN 'не существует' ELSE membership_count::TEXT END;
  RAISE NOTICE 'participants: %', CASE WHEN participant_count = -1 THEN 'не существует' ELSE participant_count::TEXT END;
  RAISE NOTICE 'telegram_groups: %', CASE WHEN tg_group_count = -1 THEN 'не существует' ELSE tg_group_count::TEXT END;
  RAISE NOTICE 'telegram_group_admins: %', CASE WHEN tg_admin_count = -1 THEN 'не существует' ELSE tg_admin_count::TEXT END;
  RAISE NOTICE 'user_telegram_accounts: %', CASE WHEN tg_account_count = -1 THEN 'не существует' ELSE tg_account_count::TEXT END;
  RAISE NOTICE 'events: %', CASE WHEN event_count = -1 THEN 'не существует' ELSE event_count::TEXT END;
  RAISE NOTICE 'event_registrations: %', CASE WHEN event_reg_count = -1 THEN 'не существует' ELSE event_reg_count::TEXT END;
  RAISE NOTICE 'material_pages: %', CASE WHEN material_count = -1 THEN 'не существует' ELSE material_count::TEXT END;
  RAISE NOTICE 'activity_events: %', CASE WHEN activity_count = -1 THEN 'не существует' ELSE activity_count::TEXT END;
  RAISE NOTICE 'group_metrics: %', CASE WHEN metrics_count = -1 THEN 'не существует' ELSE metrics_count::TEXT END;
  RAISE NOTICE 'invitations: %', CASE WHEN invitation_count = -1 THEN 'не существует' ELSE invitation_count::TEXT END;
  RAISE NOTICE 'participant_groups: %', CASE WHEN part_group_count = -1 THEN 'не существует' ELSE part_group_count::TEXT END;
  
  RAISE NOTICE '=== Если все показывает 0 или "не существует" - очистка прошла успешно! ===';
END $$;

