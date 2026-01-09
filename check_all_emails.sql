-- Check all emails in the system
SELECT 
  COUNT(*) as total_users,
  COUNT(email) FILTER (WHERE email IS NOT NULL AND email != '') as with_email,
  COUNT(*) - COUNT(email) FILTER (WHERE email IS NOT NULL AND email != '') as without_email
FROM users;

-- Show users with emails
SELECT id, email, name FROM users WHERE email IS NOT NULL AND email != '' LIMIT 10;

-- Check accounts table
SELECT provider, COUNT(*) as count FROM accounts GROUP BY provider;
