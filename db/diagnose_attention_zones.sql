-- ============================================================================
-- ДИАГНОСТИКА "ЗОН ВНИМАНИЯ" (ATTENTION ZONES)
-- ============================================================================

-- Проверяем условия отображения Attention Zones
-- Они показываются только если: !isOnboarding && groupsCount > 0

-- 1. Проверка: есть ли connected группы?
SELECT 
  otg.org_id,
  COUNT(*) as connected_groups_count
FROM org_telegram_groups otg
JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE otg.org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
  AND tg.bot_status = 'connected'
GROUP BY otg.org_id;

-- 2. Проверка: onboarding status (progress должен быть >= 60% чтобы НЕ быть в onboarding)
WITH org_status AS (
  SELECT 
    COUNT(DISTINCT CASE WHEN uta.is_verified = true THEN uta.id END) > 0 as has_telegram,
    COUNT(DISTINCT CASE WHEN tg.bot_status = 'connected' THEN tg.tg_chat_id END) > 0 as has_groups,
    COUNT(DISTINCT mp.id) > 0 as has_materials,
    COUNT(DISTINCT e.id) > 0 as has_events
  FROM organizations o
  LEFT JOIN user_telegram_accounts uta ON uta.org_id = o.id AND uta.is_verified = true
  LEFT JOIN org_telegram_groups otg ON otg.org_id = o.id
  LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id AND tg.bot_status = 'connected'
  LEFT JOIN material_pages mp ON mp.org_id = o.id
  LEFT JOIN events e ON e.org_id = o.id AND e.status IN ('published', 'completed')
  WHERE o.id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
)
SELECT 
  has_telegram,
  has_groups,
  has_materials,
  has_events,
  (
    1 + -- org created (always true)
    (CASE WHEN has_telegram THEN 1 ELSE 0 END) +
    (CASE WHEN has_groups THEN 1 ELSE 0 END) +
    (CASE WHEN has_materials THEN 1 ELSE 0 END) +
    (CASE WHEN has_events THEN 1 ELSE 0 END)
  ) * 20 as progress_percent,
  CASE WHEN ((
    1 + 
    (CASE WHEN has_telegram THEN 1 ELSE 0 END) +
    (CASE WHEN has_groups THEN 1 ELSE 0 END) +
    (CASE WHEN has_materials THEN 1 ELSE 0 END) +
    (CASE WHEN has_events THEN 1 ELSE 0 END)
  ) * 20) >= 60 THEN 'NOT onboarding (zones should show)' ELSE 'onboarding (zones hidden)' END as status
FROM org_status;

-- 3. Проверка: критичные события (< 30% регистраций, < 3 дней до начала)
SELECT 
  e.id,
  e.title,
  e.event_date,
  e.start_time,
  e.capacity,
  COUNT(DISTINCT er.participant_id) as registered_count,
  ROUND((COUNT(DISTINCT er.participant_id)::NUMERIC / NULLIF(e.capacity, 0)::NUMERIC) * 100, 0) as registration_rate,
  (e.event_date - CURRENT_DATE) as days_until_event
FROM events e
LEFT JOIN event_registrations er ON er.event_id = e.id AND er.status = 'confirmed'
WHERE e.org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
  AND e.status IN ('published')
  AND e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
  AND e.capacity > 0
GROUP BY e.id, e.title, e.event_date, e.start_time, e.capacity
HAVING ROUND((COUNT(DISTINCT er.participant_id)::NUMERIC / NULLIF(e.capacity, 0)::NUMERIC) * 100, 0) < 30
ORDER BY e.event_date
LIMIT 3;

-- 4. Проверка: участники на грани оттока (RPC function)
SELECT * FROM get_churning_participants(
  p_org_id := '4ea50899-ff82-4eff-9618-42ab6ce64e80',
  p_days_silent := 14
)
LIMIT 5;

-- 5. Проверка: неактивные новички (RPC function)
SELECT * FROM get_inactive_newcomers(
  p_org_id := '4ea50899-ff82-4eff-9618-42ab6ce64e80',
  p_days_since_first := 14
)
LIMIT 5;

-- 6. Проверка: есть ли участники с активностью?
SELECT 
  COUNT(DISTINCT p.id) as total_participants,
  COUNT(DISTINCT CASE WHEN p.last_activity_at IS NOT NULL THEN p.id END) as participants_with_activity,
  COUNT(DISTINCT CASE WHEN p.last_activity_at >= NOW() - INTERVAL '14 days' THEN p.id END) as active_last_14_days,
  COUNT(DISTINCT CASE WHEN p.last_activity_at < NOW() - INTERVAL '14 days' THEN p.id END) as inactive_14plus_days
FROM participants p
WHERE p.org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
  AND p.source != 'bot';

-- 7. Проверка: распределение участников по дате последней активности
WITH activity_buckets AS (
  SELECT 
    CASE 
      WHEN p.last_activity_at IS NULL THEN 'Never active'
      WHEN p.last_activity_at >= NOW() - INTERVAL '7 days' THEN '0-7 days ago'
      WHEN p.last_activity_at >= NOW() - INTERVAL '14 days' THEN '7-14 days ago'
      WHEN p.last_activity_at >= NOW() - INTERVAL '30 days' THEN '14-30 days ago'
      ELSE '30+ days ago'
    END as activity_bucket,
    CASE 
      WHEN p.last_activity_at IS NULL THEN 1
      WHEN p.last_activity_at < NOW() - INTERVAL '30 days' THEN 2
      WHEN p.last_activity_at < NOW() - INTERVAL '14 days' THEN 3
      WHEN p.last_activity_at < NOW() - INTERVAL '7 days' THEN 4
      ELSE 5
    END as sort_order
  FROM participants p
  WHERE p.org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
    AND p.source != 'bot'
)
SELECT 
  activity_bucket,
  COUNT(*) as participant_count
FROM activity_buckets
GROUP BY activity_bucket, sort_order
ORDER BY sort_order;

-- ============================================================================
-- ИТОГ: Если все 3 зоны пусты, проверь:
-- 1. progress_percent >= 60? (иначе onboarding, zones скрыты)
-- 2. connected_groups_count > 0? (иначе zones скрыты)
-- 3. Есть ли критичные события? (запрос 3)
-- 4. Есть ли churning participants? (запрос 4)
-- 5. Есть ли inactive newcomers? (запрос 5)
-- ============================================================================

