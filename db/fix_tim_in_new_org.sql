-- Исправление: добавить Tim Gorshkov как админа в новую организацию

DO $$
DECLARE
  target_org_id UUID := '960e2dab-8503-485b-b86c-181d9209f283';
  tim_user_id UUID := '9bb4b601-fa85-44d4-a811-58bf0c889e93';
  tim_tg_user_id BIGINT := 154588486;
  participant_id UUID;
  affected_rows INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ДОБАВЛЕНИЕ TIM GORSHKOV КАК АДМИНА';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Шаг 1: Найти или создать participant
  RAISE NOTICE 'Шаг 1: Поиск participant...';
  SELECT id INTO participant_id
  FROM participants
  WHERE org_id = target_org_id
    AND tg_user_id = tim_tg_user_id
    AND merged_into IS NULL;
  
  IF participant_id IS NULL THEN
    RAISE NOTICE '  Participant не найден, создаём...';
    -- Создаём participant
    INSERT INTO participants (
      org_id,
      tg_user_id,
      user_id,
      full_name,
      username,
      source,
      participant_status,
      status
    )
    VALUES (
      target_org_id,
      tim_tg_user_id,
      tim_user_id,
      'Tim Gorshkov',
      'timgorshkov',
      'telegram',
      'participant',
      'active'
    )
    RETURNING id INTO participant_id;
    
    RAISE NOTICE '  ✅ Создан participant: %', participant_id;
  ELSE
    RAISE NOTICE '  ✅ Найден participant: %', participant_id;
    
    -- Обновляем user_id если его нет
    UPDATE participants
    SET user_id = tim_user_id
    WHERE id = participant_id
      AND (user_id IS NULL OR user_id != tim_user_id);
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows > 0 THEN
      RAISE NOTICE '  ✅ Привязан user_id к participant';
    END IF;
  END IF;
  
  -- Шаг 2: Создать membership
  RAISE NOTICE '';
  RAISE NOTICE 'Шаг 2: Создание membership...';
  INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
  VALUES (
    target_org_id,
    tim_user_id,
    'admin',
    'telegram_admin',
    jsonb_build_object(
      'telegram_groups', ARRAY['-1002994446785'],
      'telegram_group_titles', ARRAY['Test2'],
      'is_owner_in_groups', true,
      'shadow_profile', false,
      'synced_at', NOW()
    )
  )
  ON CONFLICT (org_id, user_id) DO UPDATE
  SET 
    role = CASE 
      WHEN memberships.role = 'owner' THEN 'owner'  -- Не понижаем owner
      ELSE 'admin'
    END,
    role_source = 'telegram_admin',
    metadata = EXCLUDED.metadata;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  ✅ Membership создан/обновлён';
  
  -- Шаг 3: Создать user_telegram_accounts (опционально, для будущего)
  RAISE NOTICE '';
  RAISE NOTICE 'Шаг 3: Создание user_telegram_accounts...';
  INSERT INTO user_telegram_accounts (
    user_id,
    org_id,
    telegram_user_id,
    telegram_username,
    telegram_first_name,
    telegram_last_name,
    is_verified
  )
  VALUES (
    tim_user_id,
    target_org_id,
    tim_tg_user_id,
    'timgorshkov',
    'Tim',
    'Gorshkov',
    true
  )
  ON CONFLICT (user_id, org_id) DO UPDATE
  SET 
    telegram_user_id = EXCLUDED.telegram_user_id,
    telegram_username = EXCLUDED.telegram_username,
    is_verified = true;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE '  ✅ user_telegram_accounts создан/обновлён';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅✅✅ ГОТОВО! ✅✅✅';
  RAISE NOTICE '========================================';
  
END $$;

-- Проверка результата
SELECT 
  '✅ РЕЗУЛЬТАТ' as status,
  role,
  full_name,
  email,
  telegram_username,
  role_source,
  (metadata->>'is_owner_in_groups')::boolean as is_owner_in_groups
FROM organization_admins
WHERE org_id = '960e2dab-8503-485b-b86c-181d9209f283'
ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END;

