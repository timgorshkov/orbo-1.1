-- Delete duplicate/non-working channels

-- Channel 1: @timITmentor (empty, incorrect)
-- ID: f48024e2-aa32-4305-92ed-0af1cd995f02

-- Channel 2: @timtestchannel_1 (empty, incorrect)
-- ID: 0eae913f-e3a7-4b91-acf3-fef566d049d3

-- Keep: тестовый канал1 (working, has data)
-- ID: 8ecc522d-e53f-4abe-b2af-04c459cb4ac5

-- Step 1: Delete org-channel links
DELETE FROM org_telegram_channels 
WHERE channel_id IN (
  'f48024e2-aa32-4305-92ed-0af1cd995f02'::uuid,
  '0eae913f-e3a7-4b91-acf3-fef566d049d3'::uuid
);

-- Step 2: Delete channel records (cascade will delete related data)
-- Foreign keys with ON DELETE CASCADE will automatically delete:
-- - channel_posts
-- - channel_subscribers
-- - channel_post_reactions
DELETE FROM telegram_channels 
WHERE id IN (
  'f48024e2-aa32-4305-92ed-0af1cd995f02'::uuid,
  '0eae913f-e3a7-4b91-acf3-fef566d049d3'::uuid
);

-- Verify remaining channels
SELECT 
  tc.id,
  tc.tg_chat_id,
  tc.title,
  tc.username,
  COUNT(DISTINCT cp.id) as posts_count,
  COUNT(DISTINCT cs.id) as subscribers_count
FROM telegram_channels tc
LEFT JOIN org_telegram_channels otc ON otc.channel_id = tc.id
LEFT JOIN channel_posts cp ON cp.channel_id = tc.id
LEFT JOIN channel_subscribers cs ON cs.channel_id = tc.id
WHERE otc.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
GROUP BY tc.id, tc.tg_chat_id, tc.title, tc.username
ORDER BY tc.created_at;

SELECT 'Duplicate channels deleted, only working channel remains' AS status;
