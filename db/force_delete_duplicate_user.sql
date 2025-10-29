-- ПОЛНОЕ удаление дублирующего пользователя
-- Удаляет ВСЕ данные и связи, затем удаляет из auth.users

DO $$
DECLARE
  dup_user_id UUID := 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
  affected_rows INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ПОЛНОЕ УДАЛЕНИЕ ДУБЛИРУЮЩЕГО ПОЛЬЗОВАТЕЛЯ';
  RAISE NOTICE 'User ID: %', dup_user_id;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- 1. Удаляем из memberships
  RAISE NOTICE 'Шаг 1: Удаление из memberships...';
  DELETE FROM memberships WHERE user_id = dup_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено записей: %', affected_rows;
  
  -- 2. Удаляем из user_telegram_accounts
  RAISE NOTICE 'Шаг 2: Удаление из user_telegram_accounts...';
  DELETE FROM user_telegram_accounts WHERE user_id = dup_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено записей: %', affected_rows;
  
  -- 3. Обнуляем user_id в participants (не удаляем, чтобы не потерять данные)
  RAISE NOTICE 'Шаг 3: Обнуление user_id в participants...';
  UPDATE participants SET user_id = NULL WHERE user_id = dup_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Обновлено записей: %', affected_rows;
  
  -- 4. Удаляем из event_registrations (через participant_id)
  RAISE NOTICE 'Шаг 4: Удаление из event_registrations...';
  BEGIN
    DELETE FROM event_registrations 
    WHERE participant_id IN (
      SELECT id FROM participants WHERE user_id = dup_user_id
    );
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
  END;
  
  -- 5. Обнуляем created_by в materials (если есть)
  RAISE NOTICE 'Шаг 5: Обнуление created_by в materials...';
  BEGIN
    UPDATE materials SET created_by = NULL WHERE created_by = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Обновлено записей: %', affected_rows;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
  END;
  
  -- 6. Обнуляем created_by в events (если есть)
  RAISE NOTICE 'Шаг 6: Обнуление created_by в events...';
  BEGIN
    UPDATE events SET created_by = NULL WHERE created_by = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Обновлено записей: %', affected_rows;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
  END;
  
  -- 7. Удаляем из activity_events (если есть прямая связь)
  RAISE NOTICE 'Шаг 7: Проверка activity_events...';
  BEGIN
    -- Обычно activity_events не имеет прямой связи с user_id, но проверим
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'activity_events' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'DELETE FROM activity_events WHERE user_id = $1' USING dup_user_id;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE '  Удалено записей: %', affected_rows;
    ELSE
      RAISE NOTICE '  Колонка user_id не найдена';
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
  END;
  
  -- 8. Удаляем из organization_invite_uses
  RAISE NOTICE 'Шаг 8: Удаление из organization_invite_uses...';
  BEGIN
    DELETE FROM organization_invite_uses WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
  END;
  
  -- 9. Удаляем из telegram_verification_logs
  RAISE NOTICE 'Шаг 9: Удаление из telegram_verification_logs...';
  BEGIN
    DELETE FROM telegram_verification_logs WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
  END;
  
  -- 10. Удаляем из user_group_admin_status
  RAISE NOTICE 'Шаг 10: Удаление из user_group_admin_status...';
  BEGIN
    DELETE FROM user_group_admin_status WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
  END;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ОЧИСТКА ТАБЛИЦ AUTH SCHEMA';
  RAISE NOTICE '========================================';
  
  -- 11. Удаляем из auth.identities
  RAISE NOTICE 'Шаг 11: Удаление из auth.identities...';
  BEGIN
    DELETE FROM auth.identities WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING '  ⚠️  Недостаточно прав для удаления из auth.identities';
  END;
  
  -- 12. Удаляем из auth.sessions
  RAISE NOTICE 'Шаг 12: Удаление из auth.sessions...';
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING '  ⚠️  Недостаточно прав для удаления из auth.sessions';
  END;
  
  -- 13. Удаляем из auth.mfa_factors
  RAISE NOTICE 'Шаг 13: Удаление из auth.mfa_factors...';
  BEGIN
    DELETE FROM auth.mfa_factors WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING '  ⚠️  Недостаточно прав для удаления из auth.mfa_factors';
  END;
  
  -- 14. Удаляем из auth.one_time_tokens
  RAISE NOTICE 'Шаг 14: Удаление из auth.one_time_tokens...';
  BEGIN
    DELETE FROM auth.one_time_tokens WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING '  ⚠️  Недостаточно прав для удаления из auth.one_time_tokens';
  END;
  
  -- 15. Удаляем из auth.oauth_authorizations
  RAISE NOTICE 'Шаг 15: Удаление из auth.oauth_authorizations...';
  BEGIN
    DELETE FROM auth.oauth_authorizations WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION 
    WHEN insufficient_privilege THEN
      RAISE WARNING '  ⚠️  Недостаточно прав';
    WHEN undefined_table THEN
      RAISE NOTICE '  Таблица не существует (старая версия Supabase)';
  END;
  
  -- 16. Удаляем из auth.oauth_consents
  RAISE NOTICE 'Шаг 16: Удаление из auth.oauth_consents...';
  BEGIN
    DELETE FROM auth.oauth_consents WHERE user_id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  EXCEPTION 
    WHEN insufficient_privilege THEN
      RAISE WARNING '  ⚠️  Недостаточно прав';
    WHEN undefined_table THEN
      RAISE NOTICE '  Таблица не существует (старая версия Supabase)';
  END;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ВСЕ СВЯЗИ УДАЛЕНЫ ИЗ PUBLIC И AUTH';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Проверяем что осталось
  RAISE NOTICE 'Проверка остатков:';
  
  PERFORM * FROM memberships WHERE user_id = dup_user_id;
  IF FOUND THEN
    RAISE WARNING '  ❌ Остались записи в memberships!';
  ELSE
    RAISE NOTICE '  ✅ memberships чист';
  END IF;
  
  PERFORM * FROM participants WHERE user_id = dup_user_id;
  IF FOUND THEN
    RAISE WARNING '  ❌ Остались записи в participants!';
  ELSE
    RAISE NOTICE '  ✅ participants чист';
  END IF;
  
  PERFORM * FROM user_telegram_accounts WHERE user_id = dup_user_id;
  IF FOUND THEN
    RAISE WARNING '  ❌ Остались записи в user_telegram_accounts!';
  ELSE
    RAISE NOTICE '  ✅ user_telegram_accounts чист';
  END IF;
  
  -- Финальная попытка удалить пользователя
  RAISE NOTICE 'Шаг 17: Попытка удалить пользователя из auth.users...';
  BEGIN
    DELETE FROM auth.users WHERE id = dup_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows > 0 THEN
      RAISE NOTICE '';
      RAISE NOTICE '========================================';
      RAISE NOTICE '✅✅✅ ПОЛЬЗОВАТЕЛЬ УСПЕШНО УДАЛЁН! ✅✅✅';
      RAISE NOTICE '========================================';
    ELSE
      RAISE NOTICE '  Пользователь не найден или уже удален';
    END IF;
  EXCEPTION 
    WHEN insufficient_privilege THEN
      RAISE NOTICE '';
      RAISE NOTICE '========================================';
      RAISE NOTICE '⚠️  НЕДОСТАТОЧНО ПРАВ ДЛЯ УДАЛЕНИЯ';
      RAISE NOTICE '========================================';
      RAISE NOTICE '';
      RAISE NOTICE 'Удалите пользователя вручную одним из способов:';
      RAISE NOTICE '';
      RAISE NOTICE '1. Через Supabase Dashboard:';
      RAISE NOTICE '   Authentication > Users > Найти user_id: %', dup_user_id;
      RAISE NOTICE '   Нажать на три точки справа > Delete user';
      RAISE NOTICE '';
      RAISE NOTICE '2. Через Supabase Management API:';
      RAISE NOTICE '   curl -X DELETE \';
      RAISE NOTICE '     "https://API_URL/auth/v1/admin/users/%"', dup_user_id;
      RAISE NOTICE '     -H "apikey: YOUR_SERVICE_ROLE_KEY" \';
      RAISE NOTICE '     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"';
      RAISE NOTICE '';
      RAISE NOTICE '3. Через Supabase JS Admin Client:';
      RAISE NOTICE '   const { error } = await supabase.auth.admin.deleteUser(';
      RAISE NOTICE '     "%"', dup_user_id;
      RAISE NOTICE '   )';
      RAISE NOTICE '';
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION '❌ Не удалось удалить: остались foreign key constraints! Проверьте вывод выше.';
  END;
  
END $$;

