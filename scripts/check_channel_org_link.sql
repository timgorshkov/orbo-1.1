-- Check channel organization link

-- 1. Channel and its organization
SELECT 
  tc.id as channel_id,
  tc.title as channel_title,
  otc.org_id,
  o.name as org_name
FROM telegram_channels tc
LEFT JOIN org_telegram_channels otc ON otc.channel_id = tc.id
LEFT JOIN organizations o ON o.id = otc.org_id
WHERE tc.id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid;

-- 2. Participant in THAT organization
SELECT 
  p.id as participant_id,
  p.org_id,
  p.tg_user_id,
  p.first_name,
  p.last_name
FROM participants p
WHERE p.tg_user_id = 5484900079
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid;

-- 3. Subscriber
SELECT 
  cs.id as subscriber_id,
  cs.channel_id,
  cs.tg_user_id,
  cs.participant_id,
  cs.source
FROM channel_subscribers cs
WHERE cs.tg_user_id = 5484900079
  AND cs.channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid;

-- 4. Manual sync attempt (explain what would happen)
SELECT 
  cs.id as subscriber_id,
  p.id as participant_id,
  cs.tg_user_id,
  p.org_id,
  otc.org_id as channel_org_id
FROM channel_subscribers cs
CROSS JOIN telegram_channels tc
LEFT JOIN org_telegram_channels otc ON otc.channel_id = tc.id
LEFT JOIN participants p ON p.tg_user_id = cs.tg_user_id AND p.org_id = otc.org_id
WHERE cs.channel_id = tc.id
  AND tc.id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid
  AND cs.tg_user_id = 5484900079;
