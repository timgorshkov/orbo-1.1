-- Compare organizations between PostgreSQL
SELECT id, name, status, archived_at, created_at 
FROM organizations 
WHERE id = '5677600f-0c2b-43b3-96c0-4e79c498e624';

-- Check memberships for this org
SELECT m.user_id, m.role, m.created_at, u.email
FROM memberships m
LEFT JOIN users u ON u.id = m.user_id
WHERE m.org_id = '5677600f-0c2b-43b3-96c0-4e79c498e624'
ORDER BY m.created_at;

-- Check organizations created today
SELECT id, name, status, created_at 
FROM organizations 
WHERE created_at > '2026-01-06 00:00:00'
ORDER BY created_at DESC;

-- Check ALL organizations for yandex user
SELECT o.id, o.name, o.status, o.created_at, m.role, m.created_at as membership_created
FROM memberships m
JOIN organizations o ON o.id = m.org_id
WHERE m.user_id = '63671da5-7863-4718-8c49-1a7d1f8a02dd'
ORDER BY m.created_at DESC;

