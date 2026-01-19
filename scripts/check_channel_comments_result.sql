-- Check what was created after channel comments

-- 1. Channel subscribers created
SELECT 
  'CHANNEL SUBSCRIBERS' as section,
  cs.tg_user_id,
  cs.username,
  cs.first_name,
  cs.last_name,
  cs.comments_count,
  cs.reactions_count,
  cs.source,
  cs.participant_id IS NOT NULL as has_participant_link,
  TO_CHAR(cs.last_activity_at, 'YYYY-MM-DD HH24:MI:SS') as last_activity
FROM channel_subscribers cs
WHERE cs.channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid
ORDER BY cs.last_activity_at DESC;

-- 2. Activity events (channel_comment type)
SELECT 
  'ACTIVITY EVENTS (channel_comment)' as section,
  ae.tg_user_id,
  ae.event_type,
  ae.chars_count,
  ae.message_id,
  ae.reply_to_message_id,
  ae.meta->>'channel_id' as channel_id,
  ae.meta->>'text_preview' as text_preview,
  TO_CHAR(ae.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM activity_events ae
WHERE ae.event_type = 'channel_comment'
  AND ae.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
ORDER BY ae.created_at DESC
LIMIT 10;

-- 3. Regular activity events from discussion group
SELECT 
  'ACTIVITY EVENTS (message)' as section,
  ae.tg_user_id,
  ae.event_type,
  ae.chars_count,
  ae.message_id,
  TO_CHAR(ae.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM activity_events ae
WHERE ae.tg_chat_id = -1003401096638
  AND ae.event_type = 'message'
ORDER BY ae.created_at DESC
LIMIT 10;

-- 4. Participants created
SELECT 
  'PARTICIPANTS' as section,
  p.tg_user_id,
  p.username,
  p.first_name,
  p.last_name,
  p.source,
  TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM participants p
WHERE p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND p.tg_user_id IN (136817688, 5484900079)
ORDER BY p.created_at DESC;

-- 5. Summary
SELECT 
  'SUMMARY' as section,
  (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid) as total_subscribers,
  (SELECT COUNT(*) FROM activity_events WHERE event_type = 'channel_comment' AND org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid) as total_channel_comments,
  (SELECT COUNT(*) FROM activity_events WHERE tg_chat_id = -1003401096638 AND event_type = 'message') as total_discussion_messages;
