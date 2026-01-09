-- Check org owners and their emails
WITH owners AS (
  SELECT DISTINCT m.user_id, m.org_id, o.name as org_name
  FROM memberships m
  JOIN organizations o ON o.id = m.org_id
  WHERE m.role = 'owner'
  LIMIT 10
)
SELECT 
  ow.org_name,
  ow.user_id,
  u.email as users_email,
  a.provider_account_id as account_email,
  a.provider,
  uta.telegram_username
FROM owners ow
LEFT JOIN users u ON u.id = ow.user_id
LEFT JOIN accounts a ON a.user_id = ow.user_id AND a.provider = 'email'
LEFT JOIN user_telegram_accounts uta ON uta.user_id = ow.user_id;
