-- Check user in users table
SELECT 'users table' as source, id, email, name, tg_user_id 
FROM users 
WHERE email = 'timfreelancer@gmail.com';

-- Check memberships for this user
SELECT 'memberships' as source, m.user_id, m.org_id, m.role, m.created_at
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE u.email = 'timfreelancer@gmail.com'
ORDER BY m.created_at;

-- Check memberships by user ID directly
SELECT 'memberships by id' as source, user_id, org_id, role, created_at
FROM memberships 
WHERE user_id = '9bb4b601-fa85-44d4-a811-58bf0c889e93'
ORDER BY created_at;

-- Check if organizations exist
SELECT 'organizations' as source, o.id, o.name, o.status
FROM organizations o
JOIN memberships m ON m.org_id = o.id
WHERE m.user_id = '9bb4b601-fa85-44d4-a811-58bf0c889e93'
ORDER BY o.created_at;

