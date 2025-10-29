-- БЫСТРАЯ ДИАГНОСТИКА ПРОБЛЕМЫ С ДУБЛЯМИ В КОМАНДЕ
-- Выполните этот скрипт и пришлите результат

DO $$
DECLARE
  target_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'; -- Ваш org_id
  r RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ДИАГНОСТИКА ДУБЛЕЙ В КОМАНДЕ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- 1. Все записи в memberships
  RAISE NOTICE '1. ВСЕ ЗАПИСИ В MEMBERSHIPS:';
  RAISE NOTICE '----------------------------';
  FOR r IN 
    SELECT 
      m.user_id,
      m.role,
      u.email,
      m.created_at,
      m.role_source
    FROM memberships m
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.org_id = target_org_id
    ORDER BY 
      CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
      m.created_at
  LOOP
    RAISE NOTICE '  user_id: % | role: % | email: % | source: % | created: %', 
      r.user_id, r.role, COALESCE(r.email, '<нет>'), r.role_source, r.created_at;
  END LOOP;
  
  RAISE NOTICE '';
  
  -- 2. Проверка дублей
  RAISE NOTICE '2. ДУБЛИ USER_ID (если есть):';
  RAISE NOTICE '------------------------------';
  FOR r IN 
    SELECT 
      user_id,
      COUNT(*) as count,
      array_agg(role ORDER BY role) as roles
    FROM memberships
    WHERE org_id = target_org_id
    GROUP BY user_id
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE '  ⚠️  user_id: % имеет % записей с ролями: %', 
      r.user_id, r.count, r.roles;
  END LOOP;
  
  IF NOT FOUND THEN
    RAISE NOTICE '  ✅ Дублей не найдено';
  END IF;
  
  RAISE NOTICE '';
  
  -- 3. Данные из view organization_admins
  RAISE NOTICE '3. ДАННЫЕ ИЗ VIEW ORGANIZATION_ADMINS:';
  RAISE NOTICE '---------------------------------------';
  FOR r IN 
    SELECT 
      user_id,
      role,
      full_name,
      email,
      email_confirmed,
      telegram_username,
      has_verified_telegram,
      is_shadow_profile
    FROM organization_admins
    WHERE org_id = target_org_id
    ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  LOOP
    RAISE NOTICE '  role: % | name: % | email: % (✓%) | telegram: @% (✓%) | shadow: %', 
      r.role, 
      r.full_name, 
      COALESCE(r.email, '<нет>'),
      CASE WHEN r.email_confirmed THEN 'да' ELSE 'нет' END,
      COALESCE(r.telegram_username, '<нет>'),
      CASE WHEN r.has_verified_telegram THEN 'да' ELSE 'нет' END,
      CASE WHEN r.is_shadow_profile THEN 'да' ELSE 'нет' END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'АНАЛИЗ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Проверьте раздел 2:';
  RAISE NOTICE '  - Если есть ⚠️, значит один user_id имеет несколько ролей';
  RAISE NOTICE '  - Это вызывает дублирование в списке команды';
  RAISE NOTICE '';
  RAISE NOTICE 'Проверьте раздел 3:';
  RAISE NOTICE '  - Если owner отображается как admin - это дубль';
  RAISE NOTICE '  - Если статусы ✓нет, но должны быть ✓да - проблема в данных';
  RAISE NOTICE '';
  
END $$;


