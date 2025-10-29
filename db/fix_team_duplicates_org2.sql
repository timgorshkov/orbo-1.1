-- ИСПРАВЛЕНИЕ ДУБЛЕЙ В КОМАНДЕ ОРГАНИЗАЦИИ #2
-- Org ID: 7363155c-5070-4560-aa3d-89b1bef7df7b
-- Владелец: Тимур Голицын

DO $$
DECLARE
  target_org_id UUID := '7363155c-5070-4560-aa3d-89b1bef7df7b';
  
  -- Тимур Голицын (owner)
  timur_correct_user_id UUID := 'd6495527-fda7-45f5-a113-ff43ee6a8145';
  timur_duplicate_user_id UUID := '313a063b-26da-4d74-88ad-5c47b9af213b';
  
  -- Тимофей Горшков (admin-shadow)
  tim_shadow_user_id UUID := '66983106-44dd-471a-b0cd-4eb91fb43672';
  tim_real_user_id UUID := '9bb4b601-fa85-44d4-a811-58bf0c889e93'; -- Его правильный аккаунт
  
  affected_rows INTEGER;
  r RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ИСПРАВЛЕНИЕ ДУБЛЕЙ - ОРГАНИЗАЦИЯ #2';
  RAISE NOTICE 'Org: 7363155c-5070-4560-aa3d-89b1bef7df7b';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- =====================================================
  -- ПРОБЛЕМА 1: ДУБЛЬ ВЛАДЕЛЬЦА (ТИМУР ГОЛИЦЫН)
  -- =====================================================
  RAISE NOTICE 'Проблема 1: Дубль владельца (Тимур Голицын)';
  RAISE NOTICE '--------------------------------------------';
  
  -- 1.1. Удаляем дублирующий membership (admin-shadow для владельца)
  RAISE NOTICE 'Шаг 1.1: Удаление дублирующего membership для Тимура...';
  DELETE FROM memberships
  WHERE org_id = target_org_id
    AND user_id = timur_duplicate_user_id
    AND role = 'admin';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Удалено записей: %', affected_rows;
  
  -- 1.2. Обновляем participant - переносим на правильный user_id
  RAISE NOTICE 'Шаг 1.2: Обновление participant для Тимура...';
  UPDATE participants
  SET user_id = timur_correct_user_id
  WHERE org_id = target_org_id
    AND user_id = timur_duplicate_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Обновлено записей: %', affected_rows;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- ПРОБЛЕМА 2: ТИМОФЕЙ ГОРШКОВ - ТЕНЕВОЙ ПРОФИЛЬ
  -- =====================================================
  RAISE NOTICE 'Проблема 2: Тимофей Горшков - связать с правильным аккаунтом';
  RAISE NOTICE '--------------------------------------------------------------';
  
  -- 2.1. Проверяем, существует ли membership для правильного user_id
  PERFORM * FROM memberships 
  WHERE org_id = target_org_id 
    AND user_id = tim_real_user_id;
  
  IF FOUND THEN
    RAISE NOTICE 'Шаг 2.1: Membership с правильным user_id уже существует';
    RAISE NOTICE '  Удаляем теневой профиль...';
    DELETE FROM memberships
    WHERE org_id = target_org_id
      AND user_id = tim_shadow_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Удалено записей: %', affected_rows;
  ELSE
    RAISE NOTICE 'Шаг 2.1: Обновляем membership на правильный user_id...';
    UPDATE memberships
    SET user_id = tim_real_user_id
    WHERE org_id = target_org_id
      AND user_id = tim_shadow_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE '  Обновлено записей: %', affected_rows;
  END IF;
  
  -- 2.2. Обновляем participant
  RAISE NOTICE 'Шаг 2.2: Обновление participant для Тимофея...';
  UPDATE participants
  SET user_id = tim_real_user_id
  WHERE org_id = target_org_id
    AND user_id = tim_shadow_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  Обновлено записей: %', affected_rows;
  
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
  RAISE NOTICE '  2. Тимур Голицын: owner с verified статусами';
  RAISE NOTICE '  3. Тимофей Горшков: admin с verified статусами';
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
WHERE org_id = '7363155c-5070-4560-aa3d-89b1bef7df7b'
ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END;


