-- Find where Telegram ID 830088020 comes from
SELECT 'participants' as source, id, user_id, full_name, email, tg_user_id, org_id
FROM participants WHERE tg_user_id = 830088020;

SELECT 'user_telegram_accounts' as source, user_id, telegram_user_id, org_id
FROM user_telegram_accounts WHERE telegram_user_id = 830088020;

-- Check new participant created for yandex user
SELECT 'new participant' as source, id, user_id, full_name, email, tg_user_id, org_id, created_at
FROM participants WHERE id = '4a174f66-fca4-4945-b1c9-1fe072b13eb0';

-- Check all participants for this org (sorted by created_at)
SELECT id, user_id, full_name, email, tg_user_id, participant_status, created_at
FROM participants 
WHERE org_id = '5677600f-0c2b-43b3-96c0-4e79c498e624'
ORDER BY created_at DESC;

