-- Проверка исправлений для страницы команды организации
-- Запускать ПОСЛЕ применения миграции 060 и fix_owner_admin_duplicates.sql

SET client_min_messages TO NOTICE;

DO $$
DECLARE
  test_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
  owner_count INTEGER;
  admin_count INTEGER;
  duplicate_count INTEGER;
  verified_count INTEGER;
  email_confirmed_count INTEGER;
  r RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ПРОВЕРКА ИСПРАВЛЕНИЙ ДЛЯ КОМАНДЫ ОРГАНИЗАЦИИ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- 1. Проверка дублирования владельца
  RAISE NOTICE '1. ПРОВЕРКА ДУБЛИРОВАНИЯ:';
  
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_id, COUNT(*) as cnt
    FROM memberships
    WHERE org_id = test_org_id
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE WARNING '  ❌ Найдено % пользователей с дублированными записями!', duplicate_count;
    
    -- Показываем дубли
    FOR r IN 
      SELECT m.user_id, u.email, string_agg(m.role, ', ') as roles
      FROM memberships m
      LEFT JOIN auth.users u ON u.id = m.user_id
      WHERE m.org_id = test_org_id
      GROUP BY m.user_id, u.email
      HAVING COUNT(*) > 1
    LOOP
      RAISE WARNING '    Дубль: user_id=%, email=%, roles=%', r.user_id, r.email, r.roles;
    END LOOP;
  ELSE
    RAISE NOTICE '  ✅ Дублей не найдено';
  END IF;
  
  RAISE NOTICE '';
  
  -- 2. Проверка количества владельцев и админов
  RAISE NOTICE '2. КОЛИЧЕСТВО ЧЛЕНОВ КОМАНДЫ:';
  
  SELECT COUNT(*) INTO owner_count
  FROM memberships
  WHERE org_id = test_org_id AND role = 'owner';
  
  SELECT COUNT(*) INTO admin_count
  FROM memberships
  WHERE org_id = test_org_id AND role = 'admin';
  
  RAISE NOTICE '  Владельцев: %', owner_count;
  RAISE NOTICE '  Администраторов: %', admin_count;
  
  IF owner_count > 1 THEN
    RAISE WARNING '  ❌ Найдено несколько владельцев!';
  ELSIF owner_count = 0 THEN
    RAISE WARNING '  ❌ Владелец не найден!';
  ELSE
    RAISE NOTICE '  ✅ Один владелец (правильно)';
  END IF;
  
  RAISE NOTICE '';
  
  -- 3. Проверка верификации email
  RAISE NOTICE '3. ВЕРИФИКАЦИЯ EMAIL:';
  
  SELECT COUNT(*) INTO email_confirmed_count
  FROM organization_admins
  WHERE org_id = test_org_id AND email_confirmed = true;
  
  RAISE NOTICE '  Подтвержденных email: % из % членов', email_confirmed_count, owner_count + admin_count;
  
  -- Детали по каждому члену
  FOR r IN 
    SELECT user_id, role, email, email_confirmed, email_confirmed_at
    FROM organization_admins
    WHERE org_id = test_org_id
    ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END
  LOOP
    IF r.email_confirmed THEN
      RAISE NOTICE '  ✅ %: % (подтвержден %)', r.role, r.email, 
        COALESCE(to_char(r.email_confirmed_at, 'DD.MM.YYYY'), 'давно');
    ELSE
      RAISE WARNING '  ❌ %: % (НЕ подтвержден)', r.role, COALESCE(r.email, 'email отсутствует');
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  
  -- 4. Проверка верификации Telegram
  RAISE NOTICE '4. ВЕРИФИКАЦИЯ TELEGRAM:';
  
  SELECT COUNT(*) INTO verified_count
  FROM organization_admins
  WHERE org_id = test_org_id AND has_verified_telegram = true;
  
  RAISE NOTICE '  Верифицированных Telegram: % из % членов', verified_count, owner_count + admin_count;
  
  -- Детали по каждому члену
  FOR r IN 
    SELECT user_id, role, telegram_username, tg_user_id, has_verified_telegram
    FROM organization_admins
    WHERE org_id = test_org_id
    ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END
  LOOP
    IF r.has_verified_telegram THEN
      RAISE NOTICE '  ✅ %: @% (ID: %, верифицирован)', 
        r.role, 
        COALESCE(r.telegram_username, 'без username'), 
        r.tg_user_id;
    ELSE
      RAISE WARNING '  ❌ %: Telegram НЕ верифицирован (ID: %)', 
        r.role, 
        COALESCE(r.tg_user_id::text, 'отсутствует');
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ПРОВЕРКА ЗАВЕРШЕНА';
  RAISE NOTICE '========================================';
  
END $$;

