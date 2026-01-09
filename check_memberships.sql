-- Check memberships data
SELECT user_id, created_at FROM memberships ORDER BY created_at DESC LIMIT 10;

-- Count memberships per user
SELECT COUNT(*) as total_memberships FROM memberships;
