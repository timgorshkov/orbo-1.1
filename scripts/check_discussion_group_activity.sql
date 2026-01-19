-- Check activity in discussion group and participant creation
-- Discussion group: -1003401096638
-- Org: a3e8bc8f-8171-472c-a955-2f7878aed6f1

-- 1. Activity events from discussion group
SELECT 
  ae.tg_user_id,
  COUNT(*) as events_count,
  MIN(ae.created_at) as first_seen,
  MAX(ae.created_at) as last_seen
FROM activity_events ae
WHERE ae.tg_chat_id = -1003401096638
GROUP BY ae.tg_user_id
ORDER BY events_count DESC;

-- 2. Check if participants exist
SELECT 
  p.tg_user_id,
  p.first_name,
  p.last_name,
  p.username,
  p.created_at,
  COUNT(ae.id) as activity_count
FROM participants p
LEFT JOIN activity_events ae ON p.tg_user_id = ae.tg_user_id 
  AND ae.tg_chat_id = -1003401096638
WHERE p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND p.tg_user_id IN (
    SELECT DISTINCT tg_user_id 
    FROM activity_events 
    WHERE tg_chat_id = -1003401096638
  )
GROUP BY p.tg_user_id, p.first_name, p.last_name, p.username, p.created_at
ORDER BY activity_count DESC;

-- 3. Missing participants (activity but no participant record)
SELECT 
  ae.tg_user_id,
  COUNT(*) as missing_events
FROM activity_events ae
WHERE ae.tg_chat_id = -1003401096638
  AND NOT EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.tg_user_id = ae.tg_user_id 
      AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  )
GROUP BY ae.tg_user_id;
