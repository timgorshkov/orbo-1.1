-- Проверка конкретного пользователя в participants
-- Замените значения на реальные из логов Vercel

-- ВАЖНО: Замените эти значения на реальные из логов!
DO $$
DECLARE
  v_user_id UUID := '9bb4b601-fa85-44d4-a811-58bf0c889e93'; -- ЗАМЕНИТЕ на user_id из логов Vercel
  v_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';  -- ЗАМЕНИТЕ на org_id из логов Vercel
  v_tg_user_id BIGINT;
BEGIN
  RAISE NOTICE '========== CHECKING USER % IN ORG % ==========', v_user_id, v_org_id;
  
  -- 1. Проверяем user_telegram_accounts
  RAISE NOTICE '';
  RAISE NOTICE '1. Checking user_telegram_accounts:';
  SELECT telegram_user_id INTO v_tg_user_id
  FROM user_telegram_accounts
  WHERE user_id = v_user_id AND org_id = v_org_id AND is_verified = true
  LIMIT 1;
  
  IF v_tg_user_id IS NOT NULL THEN
    RAISE NOTICE '   ✅ Telegram account found: tg_user_id = %', v_tg_user_id;
  ELSE
    RAISE NOTICE '   ❌ No telegram account found';
  END IF;
  
  -- 2. Проверяем participants по tg_user_id
  IF v_tg_user_id IS NOT NULL THEN
    RAISE NOTICE '';
    RAISE NOTICE '2. Checking participants by tg_user_id = %:', v_tg_user_id;
    
    PERFORM id FROM participants
    WHERE org_id = v_org_id 
      AND tg_user_id = v_tg_user_id 
      AND merged_into IS NULL;
    
    IF FOUND THEN
      RAISE NOTICE '   ✅ Participant found by tg_user_id';
      
      -- Показываем детали
      FOR r IN (
        SELECT id, user_id, full_name, username, tg_user_id
        FROM participants
        WHERE org_id = v_org_id 
          AND tg_user_id = v_tg_user_id 
          AND merged_into IS NULL
        LIMIT 1
      ) LOOP
        RAISE NOTICE '      id: %', r.id;
        RAISE NOTICE '      user_id: %', r.user_id;
        RAISE NOTICE '      full_name: %', r.full_name;
        RAISE NOTICE '      username: %', r.username;
        RAISE NOTICE '      tg_user_id: %', r.tg_user_id;
        
        IF r.user_id != v_user_id THEN
          RAISE NOTICE '   ⚠️  WARNING: participant.user_id (%) != session user_id (%)', r.user_id, v_user_id;
        END IF;
      END LOOP;
    ELSE
      RAISE NOTICE '   ❌ No participant found by tg_user_id';
    END IF;
  END IF;
  
  -- 3. Проверяем participants по user_id
  RAISE NOTICE '';
  RAISE NOTICE '3. Checking participants by user_id = %:', v_user_id;
  
  PERFORM id FROM participants
  WHERE org_id = v_org_id 
    AND user_id = v_user_id 
    AND merged_into IS NULL;
  
  IF FOUND THEN
    RAISE NOTICE '   ✅ Participant found by user_id';
    
    -- Показываем детали
    FOR r IN (
      SELECT id, user_id, full_name, username, tg_user_id
      FROM participants
      WHERE org_id = v_org_id 
        AND user_id = v_user_id 
        AND merged_into IS NULL
      LIMIT 1
    ) LOOP
      RAISE NOTICE '      id: %', r.id;
      RAISE NOTICE '      user_id: %', r.user_id;
      RAISE NOTICE '      full_name: %', r.full_name;
      RAISE NOTICE '      username: %', r.username;
      RAISE NOTICE '      tg_user_id: %', r.tg_user_id;
    END LOOP;
  ELSE
    RAISE NOTICE '   ❌ No participant found by user_id';
  END IF;
  
  -- 4. Показываем ВСЕ participants с таким tg_user_id (даже с другим user_id или в другой org)
  IF v_tg_user_id IS NOT NULL THEN
    RAISE NOTICE '';
    RAISE NOTICE '4. ALL participants with tg_user_id = % (any org, any user_id):', v_tg_user_id;
    
    FOR r IN (
      SELECT id, org_id, user_id, full_name, username, tg_user_id, merged_into
      FROM participants
      WHERE tg_user_id = v_tg_user_id
      ORDER BY created_at
    ) LOOP
      RAISE NOTICE '   - id: %, org_id: %, user_id: %, full_name: %, merged_into: %', 
        r.id, r.org_id, r.user_id, r.full_name, r.merged_into;
    END LOOP;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '========== CHECK COMPLETE ==========';
END $$;

