-- Fix: Link channel to organization

-- Add channel-org link
INSERT INTO org_telegram_channels (org_id, channel_id, is_primary)
VALUES (
  'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid,  -- PRO-тусовка
  '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid,  -- тестовый канал1
  false
)
ON CONFLICT (org_id, channel_id) DO NOTHING
RETURNING *;

-- Now sync subscribers with participants
SELECT public.sync_channel_subscribers_with_participants() as synced_count;

-- Check result
SELECT 
  cs.id as subscriber_id,
  cs.tg_user_id,
  cs.first_name,
  cs.participant_id,
  p.first_name as participant_name,
  p.org_id
FROM channel_subscribers cs
LEFT JOIN participants p ON p.id = cs.participant_id
WHERE cs.tg_user_id = 5484900079
  AND cs.channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid;

SELECT 'Channel linked and subscribers synced' AS status;
