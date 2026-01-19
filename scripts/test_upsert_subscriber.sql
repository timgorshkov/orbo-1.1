-- Test upsert_channel_subscriber_from_comment function

-- Test 1: Create subscriber from comment
SELECT '=== Test 1: Create subscriber ===' as test;
SELECT public.upsert_channel_subscriber_from_comment(
  -1003592216264,  -- channel_tg_id
  5484900079,      -- user_id (Тимур)
  NULL,            -- username
  'Тимур',         -- first_name
  'Голицын'        -- last_name
) as subscriber_id;

-- Check created subscriber
SELECT 
  id, tg_user_id, first_name, last_name, 
  comments_count, source, 
  TO_CHAR(last_activity_at, 'YYYY-MM-DD HH24:MI:SS') as last_activity
FROM channel_subscribers 
WHERE channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid
  AND tg_user_id = 5484900079;

-- Test 2: Repeat call (should increment counter)
SELECT '=== Test 2: Increment counter ===' as test;
SELECT public.upsert_channel_subscriber_from_comment(
  -1003592216264,
  5484900079,
  NULL,
  'Тимур',
  'Голицын'
) as subscriber_id_repeat;

-- Check updated subscriber
SELECT 
  id, tg_user_id, first_name, last_name, 
  comments_count, source,
  TO_CHAR(last_activity_at, 'YYYY-MM-DD HH24:MI:SS') as last_activity
FROM channel_subscribers 
WHERE channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid
  AND tg_user_id = 5484900079;

-- Test 3: Sync with participants
SELECT '=== Test 3: Sync with participants ===' as test;
SELECT public.sync_channel_subscribers_with_participants() as synced_count;

-- Check if participant_id is set
SELECT 
  cs.id as subscriber_id,
  cs.tg_user_id,
  cs.participant_id,
  p.first_name as participant_first_name
FROM channel_subscribers cs
LEFT JOIN participants p ON p.id = cs.participant_id
WHERE cs.channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid
  AND cs.tg_user_id = 5484900079;

SELECT '=== All tests completed ===' as result;
