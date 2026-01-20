-- Check available data for channel statistics

SELECT 
  'Channel Posts' as source,
  COUNT(*) as count,
  SUM(views_count) as total_views,
  SUM(reactions_count) as total_reactions,
  SUM(forwards_count) as total_forwards
FROM channel_posts 
WHERE channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid;

SELECT 
  'Channel Subscribers' as source,
  COUNT(*) as total_subscribers,
  SUM(comments_count) as total_comments,
  SUM(reactions_count) as total_reactions_by_subs
FROM channel_subscribers
WHERE channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid;

SELECT 
  'Activity Events (comments)' as source,
  COUNT(*) as total_comment_events
FROM activity_events
WHERE event_type = 'channel_comment'
  AND meta->>'channel_id' = '-1003592216264';

-- Check for bot/service accounts
SELECT 
  'Service Accounts to Filter' as info,
  tg_user_id,
  username,
  first_name,
  comments_count
FROM channel_subscribers
WHERE channel_id = '8ecc522d-e53f-4abe-b2af-04c459cb4ac5'::uuid
  AND (
    tg_user_id = 777000  -- Telegram service
    OR username LIKE '%bot' 
    OR username LIKE '%Bot'
    OR first_name = 'Telegram'
  )
ORDER BY comments_count DESC;
