-- Create proper participant for yandex user in org efwfw
INSERT INTO participants (org_id, user_id, full_name, email, source, participant_status)
VALUES (
  '5677600f-0c2b-43b3-96c0-4e79c498e624',
  '63671da5-7863-4718-8c49-1a7d1f8a02dd',
  'tim-gor@yandex.ru',
  'tim-gor@yandex.ru',
  'manual',
  'participant'
);

-- Verify
SELECT id, org_id, user_id, full_name, email, tg_user_id, source, created_at
FROM participants
WHERE org_id = '5677600f-0c2b-43b3-96c0-4e79c498e624'
ORDER BY created_at DESC;

