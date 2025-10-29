-- ИСПРАВЛЕНИЕ ДУБЛЕЙ В КОМАНДЕ ОРГАНИЗАЦИИ
-- Проблемы:
-- 1. Владелец (Tim/Тимофей) имеет два user_id: 9bb4b601 (правильный) и aaa800d9 (дубль-shadow)
-- 2. Тимур Голицын имеет два user_id: 543b9ddd (в memberships) и d6495527 (в user_telegram_accounts)
-- 3. Статусы верификации показываются неверно из-за неправильных связей

DO $$
DECLARE
  target_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
  
  -- Владелец (Tim Gorshkov)
  owner_correct_user_id UUID := '9bb4b601-fa85-44d4-a811-58bf0c889e93';
  owner_duplicate_user_id UUID := 'aaa800d9-8fa6-47ac-a716-f2bc7d89d862';
  
  -- Тимур Голицын
  timur_wrong_user_id UUID := '543b9ddd-a31e-44f9-972b-6ab63341b8db';
  timur_correct_user_id UUID := 'd6495527-fda7-45f5-a113-ff43ee6a8145';
  
  affected_rows INTEGER;
  r RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ИСПРАВЛЕНИЕ ДУБЛЕЙ В КОМАНДЕ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- =====================================================
  -- ПРОБЛЕМА 1: ДУБЛЬ ВЛАДЕЛЬЦА
  -- =====================================================
  RAISE NOTICE 'Проблема 1: Дубль владельца (Тимофей Горшков = Tim Gorshkov)';
  RAISE NOTICE '--------------------------------------------------------------';
  
  -- 1.1. Удаляем дублирующий membership (admin-shadow для владельца)
  RAISE NOTICE 'Шаг 1.1: Удаление дублирующего membership...';
  DELETE FROM memberships
  WHERE org_id = target_org_id
    AND user_id = owner_duplicate_user_id
    AND role = 'admin';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено записей: %', affected_rows;
  
  -- 1.2. Обновляем participant - переносим на правильный user_id
  RAISE NOTICE 'Шаг 1.2: Обновление participant для владельца...';
  UPDATE participants
  SET user_id = owner_correct_user_id
  WHERE org_id = target_org_id
    AND user_id = owner_duplicate_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Обновлено записей: %', affected_rows;
  
  -- 1.3. Проверяем, остались ли другие записи для дублирующего user_id
  RAISE NOTICE 'Шаг 1.3: Проверка остатков для user_id: %...', owner_duplicate_user_id;
  PERFORM * FROM memberships WHERE user_id = owner_duplicate_user_id;
  IF NOT FOUND THEN
    RAISE NOTICE '  ✅ Записей в memberships не осталось';
  ELSE
    RAISE WARNING '  ⚠️  Остались записи в memberships!';
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- ПРОБЛЕМА 2: ТИМУР ГОЛИЦЫН - НЕПРАВИЛЬНЫЙ USER_ID
  -- =====================================================
  RAISE NOTICE 'Проблема 2: Тимур Голицын - неправильный user_id в memberships';
  RAISE NOTICE '----------------------------------------------------------------';
  
  -- 2.1. Проверяем, существует ли правильный user_id
  PERFORM * FROM auth.users WHERE id = timur_correct_user_id;
  IF FOUND THEN
    RAISE NOTICE 'Шаг 2.1: Обновление user_id в memberships для Тимура...';
    
    -- Сначала проверим, нет ли уже записи с правильным user_id
    PERFORM * FROM memberships 
    WHERE org_id = target_org_id 
      AND user_id = timur_correct_user_id;
    
    IF FOUND THEN
      RAISE NOTICE '  ⚠️  Запись с правильным user_id уже существует, удаляем старую...';
      DELETE FROM memberships
      WHERE org_id = target_org_id
        AND user_id = timur_wrong_user_id;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE '  Удалено старых записей: %', affected_rows;
    ELSE
      RAISE NOTICE '  Обновляем user_id на правильный...';
      UPDATE memberships
      SET user_id = timur_correct_user_id
      WHERE org_id = target_org_id
        AND user_id = timur_wrong_user_id;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE '  Обновлено записей: %', affected_rows;
    END IF;
    
    -- 2.2. Обновляем participant
    RAISE NOTICE 'Шаг 2.2: Обновление participant для Тимура...';
    UPDATE participants
    SET user_id = timur_correct_user_id
    WHERE org_id = target_org_id
      AND user_id = timur_wrong_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Обновлено записей: %', affected_rows;
  ELSE
    RAISE WARNING '  ⚠️  Правильный user_id не найден в auth.users, пропускаем';
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- ПРОВЕРКА РЕЗУЛЬТАТОВ
  -- =====================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ПРОВЕРКА РЕЗУЛЬТАТОВ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Показываем текущее состояние memberships
  RAISE NOTICE 'Текущее состояние memberships:';
  FOR r IN 
    SELECT 
      m.role,
      m.user_id,
      u.email
    FROM memberships m
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.org_id = target_org_id
    ORDER BY CASE m.role WHEN 'owner' THEN 1 ELSE 2 END
  LOOP
    RAISE NOTICE '  role: % | user_id: % | email: %', 
      r.role, r.user_id, COALESCE(r.email, '<нет>');
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ИСПРАВЛЕНИЕ ЗАВЕРШЕНО';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Следующий шаг:';
  RAISE NOTICE '  1. Проверьте страницу настроек - дублей быть не должно';
  RAISE NOTICE '  2. Если дубль owner_duplicate_user_id остался в auth.users,';
  RAISE NOTICE '     удалите его через Dashboard или API';
  RAISE NOTICE '';
  
END $$;

-- Финальная проверка: что отображается в view
SELECT 
  'РЕЗУЛЬТАТ: organization_admins view' as check_type,
  role,
  full_name,
  email,
  email_confirmed,
  has_verified_telegram,
  is_shadow_profile
FROM organization_admins
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END;

