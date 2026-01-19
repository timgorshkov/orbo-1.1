-- Check channel discussion group activity and participant creation

-- 1. Channel info
SELECT 
  'CHANNEL INFO' as section,
  tc.title as channel,
  tc.tg_chat_id as channel_id,
  tc.linked_chat_id as discussion_group_id,
  tg.title as discussion_group
FROM telegram_channels tc
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = tc.linked_chat_id
WHERE tc.tg_chat_id = -1003592216264;

-- 2. Activity in discussion group
SELECT 
  'ACTIVITY IN DISCUSSION GROUP' as section,
  ae.tg_user_id,
  COUNT(*) as event_count,
  MIN(ae.created_at) as first_activity,
  MAX(ae.created_at) as last_activity
FROM activity_events ae
WHERE ae.tg_chat_id = -1003401096638
GROUP BY ae.tg_user_id
ORDER BY event_count DESC;

-- 3. Participants created from discussion group
SELECT 
  'PARTICIPANTS FROM DISCUSSION GROUP' as section,
  p.tg_user_id,
  p.first_name,
  p.last_name,
  p.username,
  p.created_at,
  p.source
FROM participants p
WHERE p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND p.tg_user_id IN (
    SELECT DISTINCT tg_user_id 
    FROM activity_events 
    WHERE tg_chat_id = -1003401096638
  )
ORDER BY p.created_at DESC;

-- 4. Missing participants (have activity but no participant record)
SELECT 
  'MISSING PARTICIPANTS' as section,
  ae.tg_user_id,
  COUNT(*) as missing_event_count
FROM activity_events ae
WHERE ae.tg_chat_id = -1003401096638
  AND NOT EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.tg_user_id = ae.tg_user_id 
      AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  )
GROUP BY ae.tg_user_id
ORDER BY missing_event_count DESC;
