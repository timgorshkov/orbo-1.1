-- ALL user_telegram_accounts with tg_user_id 830088020
SELECT * FROM user_telegram_accounts WHERE telegram_user_id = 830088020;

-- All user_telegram_accounts for user 63671da5
SELECT user_id, org_id, telegram_user_id, telegram_username, is_verified, created_at 
FROM user_telegram_accounts 
WHERE user_id = '63671da5-7863-4718-8c49-1a7d1f8a02dd';

-- Check if user 63671da5 has any telegram connection
SELECT 'accounts' as source, provider, provider_account_id 
FROM accounts WHERE user_id = '63671da5-7863-4718-8c49-1a7d1f8a02dd';

-- Check newly created org today  
SELECT id, name, created_at FROM organizations 
WHERE created_at > '2026-01-06 00:00:00'
ORDER BY created_at DESC;

-- All memberships created today
SELECT m.user_id, m.org_id, o.name, m.role, m.created_at
FROM memberships m
LEFT JOIN organizations o ON o.id = m.org_id
WHERE m.created_at > '2026-01-06 00:00:00'
ORDER BY m.created_at DESC;

