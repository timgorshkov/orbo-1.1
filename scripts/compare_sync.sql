-- Count organizations in PostgreSQL
SELECT 'PostgreSQL organizations' as source, COUNT(*) as count FROM organizations;

-- Count by status
SELECT status, COUNT(*) FROM organizations GROUP BY status;

-- Find organizations created after migration (after Jan 5)
SELECT id, name, status, created_at 
FROM organizations 
WHERE created_at > '2026-01-05 00:00:00'
ORDER BY created_at DESC;

