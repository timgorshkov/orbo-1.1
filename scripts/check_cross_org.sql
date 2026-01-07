-- What org is 79841ac4?
SELECT id, name, created_at FROM organizations 
WHERE id = '79841ac4-6a6f-4b51-8557-d787dcc92fce';

-- Check if yandex user has membership in that org
SELECT * FROM memberships 
WHERE user_id = '63671da5-7863-4718-8c49-1a7d1f8a02dd'
AND org_id = '79841ac4-6a6f-4b51-8557-d787dcc92fce';

-- Check all participants for yandex user across all orgs
SELECT p.id, p.org_id, o.name as org_name, p.full_name, p.email, p.tg_user_id, p.created_at
FROM participants p
LEFT JOIN organizations o ON o.id = p.org_id
WHERE p.user_id = '63671da5-7863-4718-8c49-1a7d1f8a02dd';

-- Find participant by tg_user_id 830088020 with user link
SELECT p.id, p.user_id, p.org_id, o.name, p.tg_user_id
FROM participants p
LEFT JOIN organizations o ON o.id = p.org_id
WHERE p.tg_user_id = 830088020;

