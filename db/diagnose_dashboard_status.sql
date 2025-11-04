-- Диагностика текущего состояния дашборда

-- 1. Проверка онбординга для организации
DO $$
DECLARE
  v_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';  -- Замените на ваш org_id
  v_has_tg_account BOOLEAN;
  v_groups_count INTEGER;
  v_materials_count INTEGER;
  v_events_count INTEGER;
  v_progress INTEGER;
  v_is_onboarding BOOLEAN;
BEGIN
  -- Check Telegram account
  SELECT EXISTS(
    SELECT 1 FROM user_telegram_accounts 
    WHERE org_id = v_org_id AND is_verified = true
  ) INTO v_has_tg_account;

  -- Check groups count
  SELECT COUNT(*) INTO v_groups_count
  FROM org_telegram_groups otg
  JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
  WHERE otg.org_id = v_org_id
    AND tg.bot_status = 'connected';

  -- Check materials count
  SELECT COUNT(*) INTO v_materials_count
  FROM material_pages
  WHERE org_id = v_org_id;

  -- Check events count
  SELECT COUNT(*) INTO v_events_count
  FROM events
  WHERE org_id = v_org_id
    AND status IN ('published', 'completed');

  -- Calculate progress
  v_progress := (
    CASE WHEN v_has_tg_account THEN 20 ELSE 0 END +
    CASE WHEN v_groups_count > 0 THEN 20 ELSE 0 END +
    CASE WHEN v_materials_count > 0 THEN 20 ELSE 0 END +
    CASE WHEN v_events_count > 0 THEN 20 ELSE 0 END +
    20  -- Organization always exists
  );

  v_is_onboarding := v_progress < 60;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ONBOARDING STATUS';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Telegram account verified: %', v_has_tg_account;
  RAISE NOTICE 'Groups connected: %', v_groups_count;
  RAISE NOTICE 'Materials created: %', v_materials_count;
  RAISE NOTICE 'Events created: %', v_events_count;
  RAISE NOTICE 'Progress: % percent (% of 5 steps completed)', v_progress, (v_progress / 20);
  RAISE NOTICE 'Is Onboarding: %', v_is_onboarding;
  RAISE NOTICE 'Attention Zones Enabled: %', NOT v_is_onboarding AND v_groups_count > 0;
END $$;

-- 2. Проверка активности за последние 14 дней
SELECT 
  date,
  SUM(message_count) as total_messages
FROM group_metrics
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'  -- Замените на ваш org_id
  AND date >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY date
ORDER BY date DESC;

-- 3. Проверка критичных событий (низкая регистрация, ближайшие 3 дня)
SELECT 
  e.id,
  e.title,
  e.event_date,
  e.capacity,
  COUNT(er.id) FILTER (WHERE er.status = 'registered') as registered_count,
  ROUND(
    CASE WHEN e.capacity > 0 
    THEN (COUNT(er.id) FILTER (WHERE er.status = 'registered')::NUMERIC / e.capacity) * 100
    ELSE 0 
    END
  ) as registration_rate
FROM events e
LEFT JOIN event_registrations er ON er.event_id = e.id
WHERE e.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'  -- Замените на ваш org_id
  AND e.status = 'published'
  AND e.event_date >= CURRENT_DATE
  AND e.event_date <= CURRENT_DATE + INTERVAL '3 days'
GROUP BY e.id, e.title, e.event_date, e.capacity
HAVING 
  e.capacity > 0 
  AND ROUND(
    (COUNT(er.id) FILTER (WHERE er.status = 'registered')::NUMERIC / e.capacity) * 100
  ) < 30;

-- 4. Проверка churning participants (были активны, молчат 14+ дней)
SELECT 
  p.id,
  p.full_name,
  p.username,
  p.last_activity_at,
  EXTRACT(DAY FROM NOW() - p.last_activity_at)::INTEGER as days_since_activity,
  p.activity_score
FROM participants p
WHERE p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'  -- Замените на ваш org_id
  AND p.last_activity_at IS NOT NULL
  AND p.last_activity_at < NOW() - INTERVAL '14 days'
  AND p.activity_score > 10
  AND p.source != 'bot'
  AND (p.status IS NULL OR p.status != 'inactive')
ORDER BY p.activity_score DESC, p.last_activity_at DESC
LIMIT 5;

-- 5. Проверка inactive newcomers (новички, которые почти не активны)
WITH first_activity AS (
  SELECT 
    tg_user_id,
    MIN(created_at) as first_activity_date,
    COUNT(*) as activity_count
  FROM activity_events
  WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'  -- Замените на ваш org_id
    AND event_type IN ('message', 'join')
  GROUP BY tg_user_id
)
SELECT 
  p.id,
  p.full_name,
  p.username,
  p.created_at,
  EXTRACT(DAY FROM NOW() - COALESCE(fa.first_activity_date, p.created_at))::INTEGER as days_since_join,
  COALESCE(fa.activity_count, 0)::INTEGER as activity_count
FROM participants p
LEFT JOIN first_activity fa ON fa.tg_user_id = p.tg_user_id
WHERE 
  p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'  -- Замените на ваш org_id
  AND p.created_at > NOW() - INTERVAL '30 days'
  AND (fa.activity_count IS NULL OR fa.activity_count <= 2)
  AND COALESCE(fa.first_activity_date, p.created_at) < NOW() - INTERVAL '14 days'
  AND p.source != 'bot'
  AND (p.status IS NULL OR p.status != 'inactive')
ORDER BY p.created_at DESC
LIMIT 5;

