-- Create missing participant for Channel_Bot and sync

-- 1. Create participant for Channel_Bot (136817688)
INSERT INTO participants (
  org_id,
  tg_user_id,
  username,
  first_name,
  source
) VALUES (
  'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid,
  136817688,
  'Channel_Bot',
  'Channel',
  'channel_discussion_import'
)
ON CONFLICT (org_id, tg_user_id) DO UPDATE SET
  username = EXCLUDED.username,
  first_name = EXCLUDED.first_name
RETURNING id, tg_user_id, first_name, username;

-- 2. Sync channel_subscribers with participants
SELECT public.sync_channel_subscribers_with_participants() as synced_count;

-- 3. Check result
SELECT 
  cs.tg_user_id,
  cs.username,
  cs.first_name,
  cs.comments_count,
  cs.participant_id IS NOT NULL as has_participant_link,
  p.first_name as participant_name
FROM channel_subscribers cs
LEFT JOIN participants p ON p.id = cs.participant_id
WHERE cs.channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid
ORDER BY cs.tg_user_id;

SELECT 'Participant created and synced' AS status;
