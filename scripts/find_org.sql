-- Find organization by name
SELECT id, name, status, created_at FROM organizations WHERE name LIKE '%всывсыв%';
SELECT id, name, status, created_at FROM organizations WHERE name LIKE '%efwfw%';

-- Find recent organizations
SELECT id, name, status, created_at FROM organizations ORDER BY created_at DESC LIMIT 10;

-- Count all organizations
SELECT COUNT(*) as total FROM organizations;
SELECT COUNT(*) as active FROM organizations WHERE status IS NULL OR status = 'active';
SELECT COUNT(*) as archived FROM organizations WHERE status = 'archived';

