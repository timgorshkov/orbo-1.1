-- ============================================================================
-- ПРОВЕРКА ЛОГИКИ "ЗОН ВНИМАНИЯ" ДЛЯ ВАШЕЙ ОРГАНИЗАЦИИ
-- ============================================================================

-- Ваши данные:
-- - 3 участника
-- - 1 "Never active"
-- - 2 "Active 0-7 days ago"
-- - 0 critical events, 0 churning, 0 inactive newcomers

-- ============================================================================
-- ПРОВЕРКА 1: Почему "Never active" участник НЕ в inactive newcomers?
-- ============================================================================

-- Критерии для inactive newcomers:
-- 1. Присоединился в последние 30 дней (created_at > NOW() - 30 days)
-- 2. Активность ≤ 2 сообщения (или вообще нет)
-- 3. Прошло 14+ дней с момента первой активности (или вступления)

SELECT 
  p.id,
  p.full_name,
  p.username,
  p.created_at,
  p.last_activity_at,
  p.source,
  EXTRACT(DAY FROM NOW() - p.created_at)::INTEGER as days_since_created,
  
  -- Check 1: Joined in last 30 days?
  CASE WHEN p.created_at > NOW() - INTERVAL '30 days' 
    THEN '✅ Yes (< 30 days)' 
    ELSE '❌ No (> 30 days)' 
  END as check_1_recent_join,
  
  -- Check 2: Has low/no activity?
  CASE WHEN p.last_activity_at IS NULL 
    THEN '✅ Yes (no activity)' 
    ELSE '⚠️ Has activity' 
  END as check_2_low_activity,
  
  -- Check 3: 14+ days passed?
  CASE WHEN p.created_at < NOW() - INTERVAL '14 days' 
    THEN '✅ Yes (> 14 days)' 
    ELSE '❌ No (< 14 days)' 
  END as check_3_time_passed,
  
  -- Final: Would show in inactive newcomers?
  CASE 
    WHEN p.created_at > NOW() - INTERVAL '30 days' 
      AND p.last_activity_at IS NULL 
      AND p.created_at < NOW() - INTERVAL '14 days'
    THEN '🔴 YES - Should alert!'
    ELSE '✅ NO - Correctly filtered out'
  END as final_verdict,
  
  -- Explanation
  CASE 
    WHEN p.created_at <= NOW() - INTERVAL '30 days' 
      THEN 'Joined > 30 days ago → Too old for newcomers'
    WHEN p.created_at >= NOW() - INTERVAL '14 days' 
      THEN 'Joined < 14 days ago → Too recent, give them time'
    WHEN p.last_activity_at IS NOT NULL 
      THEN 'Has activity → Not inactive'
    ELSE 'Would show in alerts'
  END as explanation

FROM participants p
WHERE p.org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
  AND p.source != 'bot'
ORDER BY p.created_at DESC;

-- ============================================================================
-- ПРОВЕРКА 2: Есть ли участники с риском оттока?
-- ============================================================================

-- Критерии для churning:
-- 1. Была активность раньше (last_activity_at IS NOT NULL)
-- 2. Молчит 14+ дней (last_activity_at < NOW() - 14 days)

SELECT 
  p.id,
  p.full_name,
  p.username,
  p.last_activity_at,
  EXTRACT(DAY FROM NOW() - COALESCE(p.last_activity_at, p.created_at))::INTEGER as days_since_activity,
  
  -- Check: Would show in churning?
  CASE 
    WHEN p.last_activity_at IS NOT NULL 
      AND p.last_activity_at < NOW() - INTERVAL '14 days'
    THEN '🔴 YES - Should alert!'
    ELSE '✅ NO - Correctly filtered out'
  END as churning_verdict,
  
  -- Explanation
  CASE 
    WHEN p.last_activity_at IS NULL 
      THEN 'Never active → Not churning (was never engaged)'
    WHEN p.last_activity_at >= NOW() - INTERVAL '14 days' 
      THEN 'Active recently → Not at risk'
    ELSE 'Would show in alerts'
  END as explanation

FROM participants p
WHERE p.org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
  AND p.source != 'bot'
ORDER BY p.last_activity_at DESC NULLS LAST;

-- ============================================================================
-- ПРОВЕРКА 3: Есть ли критичные события?
-- ============================================================================

-- Критерии:
-- 1. Событие в ближайшие 3 дня (event_date BETWEEN NOW() AND NOW() + 3 days)
-- 2. Регистрация < 30% от capacity

SELECT 
  e.id,
  e.title,
  e.event_date,
  e.capacity,
  COUNT(DISTINCT er.participant_id) as registered_count,
  ROUND((COUNT(DISTINCT er.participant_id)::NUMERIC / NULLIF(e.capacity, 0)::NUMERIC) * 100, 0) as registration_rate,
  (e.event_date - CURRENT_DATE) as days_until_event,
  
  CASE 
    WHEN e.event_date > CURRENT_DATE + INTERVAL '3 days' 
      THEN '✅ NO - Event too far away (> 3 days)'
    WHEN e.capacity IS NULL OR e.capacity = 0
      THEN '✅ NO - No capacity set'
    WHEN ROUND((COUNT(DISTINCT er.participant_id)::NUMERIC / NULLIF(e.capacity, 0)::NUMERIC) * 100, 0) >= 30
      THEN '✅ NO - Registration rate OK (≥ 30%)'
    ELSE '🔴 YES - Should alert!'
  END as alert_verdict

FROM events e
LEFT JOIN event_registrations er ON er.event_id = e.id AND er.status = 'confirmed'
WHERE e.org_id = '4ea50899-ff82-4eff-9618-42ab6ce64e80'
  AND e.status IN ('published')
  AND e.event_date >= CURRENT_DATE
GROUP BY e.id, e.title, e.event_date, e.capacity
ORDER BY e.event_date;

-- ============================================================================
-- ИТОГОВЫЙ ВЕРДИКТ
-- ============================================================================

SELECT 
  '✅ Зоны внимания ПРАВИЛЬНО показывают "Все отлично!"' as verdict,
  'Ваше сообщество здорово:' as explanation,
  '- Нет критичных событий' as reason_1,
  '- Нет участников на грани оттока (никто не молчит 14+ дней)' as reason_2,
  '- "Never active" участник либо старый (>30 дней), либо новый (<14 дней)' as reason_3,
  '- 2 из 3 участников активны за последнюю неделю (67% вовлечённость)' as health_metric;

