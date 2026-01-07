-- All participants in org efwfw (5677600f)
SELECT id, user_id, full_name, email, tg_user_id, participant_status, source, created_at
FROM participants
WHERE org_id = '5677600f-0c2b-43b3-96c0-4e79c498e624'
ORDER BY created_at DESC;

-- All participants created today
SELECT id, user_id, org_id, full_name, tg_user_id, created_at
FROM participants
WHERE created_at > '2026-01-06 00:00:00'
ORDER BY created_at DESC;

-- Any participant with user_id 63671da5 (yandex user)
SELECT id, org_id, full_name, email, tg_user_id, source, created_at
FROM participants
WHERE user_id = '63671da5-7863-4718-8c49-1a7d1f8a02dd';

