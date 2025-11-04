-- Check recently created participants
SELECT 
  p.id,
  p.org_id,
  p.full_name,
  p.tg_user_id,
  p.username,
  p.tg_first_name,
  p.tg_last_name,
  p.source,
  p.created_at,
  p.last_activity_at
FROM participants p
WHERE p.created_at > NOW() - INTERVAL '1 hour'
ORDER BY p.created_at DESC;

-- Check participant_groups for recently added participants
SELECT 
  pg.participant_id,
  pg.tg_group_id,
  p.tg_user_id,
  pg.is_active,
  pg.joined_at as created_at,
  p.full_name,
  p.username
FROM participant_groups pg
LEFT JOIN participants p ON p.id = pg.participant_id
WHERE pg.joined_at > NOW() - INTERVAL '1 hour'
ORDER BY pg.joined_at DESC;

-- Check if ChatKeeperBot was created
SELECT 
  p.id,
  p.org_id,
  p.full_name,
  p.tg_user_id,
  p.username,
  p.source,
  p.created_at
FROM participants p
WHERE p.tg_user_id = 553147242; -- ChatKeeperBot from logs

