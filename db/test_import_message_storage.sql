-- Test 3: Verify JSON Import saves message texts to participant_messages
-- Run after importing JSON file

SELECT 
  ae.id as event_id,
  ae.meta->'message'->>'text_preview' as preview,
  ae.meta->'import'->>'format' as import_format,
  pm.message_text,
  pm.activity_event_id,
  pm.created_at as message_created_at,
  ae.created_at as event_created_at
FROM activity_events ae
LEFT JOIN participant_messages pm ON pm.activity_event_id = ae.id
WHERE ae.import_source = 'html_import' -- All file imports use this
  AND ae.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ae.created_at DESC
LIMIT 10;

-- Expected results:
-- ✅ message_text should contain full message text
-- ✅ activity_event_id should match ae.id
-- ✅ import_format should be 'json' for JSON imports
-- ✅ text_preview should be first ~200 chars

