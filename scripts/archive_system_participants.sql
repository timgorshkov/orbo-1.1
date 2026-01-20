-- Archive existing system participants
-- These should not be created anymore after webhook filtering

-- System account IDs:
-- 777000 - Telegram Service Notifications  
-- 136817688 - @Channel_Bot
-- 1087968824 - Group Anonymous Bot

-- Find existing system participants
SELECT 
    id,
    tg_user_id,
    username,
    first_name,
    full_name,
    org_id,
    created_at
FROM participants
WHERE tg_user_id IN (777000, 136817688, 1087968824)
ORDER BY org_id, tg_user_id;

-- Archive them (set participant_status to 'excluded' and mark deleted)
UPDATE participants
SET 
    participant_status = 'excluded',
    deleted_at = NOW(),
    updated_at = NOW()
WHERE tg_user_id IN (777000, 136817688, 1087968824)
  AND participant_status != 'excluded';

-- Also remove them from channel_subscribers
DELETE FROM channel_subscribers
WHERE tg_user_id IN (777000, 136817688, 1087968824);

-- Check results
SELECT 
    COUNT(*) as archived_count,
    org_id
FROM participants
WHERE tg_user_id IN (777000, 136817688, 1087968824)
  AND participant_status = 'excluded'
GROUP BY org_id;
