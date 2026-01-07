-- Create proper participant for yandex user in org efwfw
INSERT INTO participants (org_id, user_id, full_name, email, source, participant_status)
VALUES (
  '5677600f-0c2b-43b3-96c0-4e79c498e624',  -- org efwfw
  '63671da5-7863-4718-8c49-1a7d1f8a02dd',  -- yandex user
  'tim-gor@yandex.ru',  -- use email as name
  'tim-gor@yandex.ru',  -- email
  'manual',
  'participant'
)
ON CONFLICT (org_id, user_id) WHERE user_id IS NOT NULL 
DO UPDATE SET 
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  updated_at = NOW();

-- Verify
SELECT id, org_id, user_id, full_name, email, tg_user_id, source
FROM participants
WHERE org_id = '5677600f-0c2b-43b3-96c0-4e79c498e624'
ORDER BY created_at DESC;

