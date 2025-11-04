-- Test: Verify JSON Import saves message texts (FIXED version)
-- This version starts from participant_messages to avoid RLS issues

-- Test 1: Check participant_messages directly
SELECT 
  pm.id,
  pm.activity_event_id,
  pm.message_text,
  pm.tg_user_id,
  pm.tg_chat_id,
  pm.created_at
FROM participant_messages pm
WHERE pm.created_at > NOW() - INTERVAL '1 hour'
ORDER BY pm.created_at DESC
LIMIT 10;

-- Test 2: Join with activity_events (if RLS allows)
SELECT 
  pm.id as pm_id,
  pm.activity_event_id,
  LENGTH(pm.message_text) as text_length,
  ae.id as ae_id,
  ae.event_type,
  ae.meta->'message'->>'text_preview' as preview,
  ae.meta->'source'->>'format' as import_format,
  ae.created_at as event_created
FROM participant_messages pm
LEFT JOIN activity_events ae ON ae.id = pm.activity_event_id
WHERE pm.created_at > NOW() - INTERVAL '1 hour'
ORDER BY pm.created_at DESC
LIMIT 10;

