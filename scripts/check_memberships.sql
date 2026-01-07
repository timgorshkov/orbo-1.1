-- Check all memberships created on Jan 6
SELECT m.org_id, m.user_id, m.role, m.created_at, o.name as org_name, u.email
FROM memberships m
LEFT JOIN organizations o ON o.id = m.org_id
LEFT JOIN users u ON u.id = m.user_id
WHERE m.created_at > '2026-01-06 00:00:00'
ORDER BY m.created_at DESC;

-- Check memberships in Supabase vs PostgreSQL for Yandex user
SELECT 'PostgreSQL' as source, org_id, role, created_at
FROM memberships 
WHERE user_id = '63671da5-7863-4718-8c49-1a7d1f8a02dd'
ORDER BY created_at;

