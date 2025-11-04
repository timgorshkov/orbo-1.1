-- Check RLS on activity_events and participant_messages
SELECT 
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('activity_events', 'participant_messages');

-- Check if records exist (bypassing RLS with service role)
SELECT COUNT(*) as total_imported
FROM activity_events
WHERE import_source = 'html_import'
  AND created_at > NOW() - INTERVAL '1 hour';

-- Check recent imported events with meta
SELECT 
  id,
  org_id,
  tg_chat_id,
  tg_user_id,
  meta->'source'->>'format' as import_format,
  meta->'message'->>'text_preview' as preview,
  LENGTH(meta::text) as meta_size,
  created_at
FROM activity_events
WHERE import_source = 'html_import'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY id DESC
LIMIT 10;

-- Check participant_messages
SELECT 
  pm.id,
  pm.activity_event_id,
  LENGTH(pm.message_text) as text_length,
  pm.created_at
FROM participant_messages pm
WHERE pm.created_at > NOW() - INTERVAL '1 hour'
ORDER BY pm.id DESC
LIMIT 10;

