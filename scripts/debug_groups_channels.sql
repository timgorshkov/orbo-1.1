-- Script to debug participant counts and channels visibility
-- Organization ID: a3e8bc8f-8171-472c-a955-2f7878aed6f1

-- =====================================
-- 1. Check Telegram Channels
-- =====================================
SELECT 
    'Telegram Channels' as check_type,
    tc.id,
    tc.tg_chat_id,
    tc.title,
    tc.username,
    otc.is_primary,
    otc.org_id
FROM public.telegram_channels tc
JOIN public.org_telegram_channels otc ON otc.channel_id = tc.id
WHERE otc.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
ORDER BY tc.title;

-- =====================================
-- 2. Group 1: -1003485407311
-- =====================================
SELECT '=== GROUP 1: -1003485407311 ===' as separator;

-- Get group info
SELECT 
    'Group Info' as check_type,
    tg.id,
    tg.tg_chat_id,
    tg.title,
    tg.bot_status
FROM public.telegram_groups tg
WHERE tg.tg_chat_id = -1003485407311;

-- Count participants in participant_groups
SELECT 
    'participant_groups count' as check_type,
    COUNT(*) as total_in_pg,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_in_pg
FROM public.participant_groups
WHERE tg_group_id = -1003485407311;

-- Get all participants from participant_groups
SELECT 
    'All from participant_groups' as check_type,
    pg.participant_id,
    pg.is_active,
    p.tg_user_id,
    p.username,
    p.first_name,
    p.last_name,
    p.source,
    p.merged_into,
    p.participant_status
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1003485407311
ORDER BY pg.is_active DESC, p.username;

-- Count valid participants (after filtering)
SELECT 
    'Valid participants count' as check_type,
    COUNT(*) as valid_count
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1003485407311
  AND pg.is_active = true
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND p.source != 'bot'
  AND p.merged_into IS NULL
  AND p.participant_status != 'excluded';

-- =====================================
-- 3. Group 2: -1002994446785
-- =====================================
SELECT '=== GROUP 2: -1002994446785 ===' as separator;

-- Get group info
SELECT 
    'Group Info' as check_type,
    tg.id,
    tg.tg_chat_id,
    tg.title,
    tg.bot_status
FROM public.telegram_groups tg
WHERE tg.tg_chat_id = -1002994446785;

-- Count participants in participant_groups
SELECT 
    'participant_groups count' as check_type,
    COUNT(*) as total_in_pg,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_in_pg
FROM public.participant_groups
WHERE tg_group_id = -1002994446785;

-- Get all participants from participant_groups
SELECT 
    'All from participant_groups' as check_type,
    pg.participant_id,
    pg.is_active,
    p.tg_user_id,
    p.username,
    p.first_name,
    p.last_name,
    p.source,
    p.merged_into,
    p.participant_status
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1002994446785
ORDER BY pg.is_active DESC, p.username;

-- Count valid participants (after filtering)
SELECT 
    'Valid participants count' as check_type,
    COUNT(*) as valid_count
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1002994446785
  AND pg.is_active = true
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND p.source != 'bot'
  AND p.merged_into IS NULL
  AND p.participant_status != 'excluded';

-- =====================================
-- 4. Group 3: -1003401096638 (Comment group)
-- =====================================
SELECT '=== GROUP 3: -1003401096638 (Comment Group) ===' as separator;

-- Get group info
SELECT 
    'Group Info' as check_type,
    tg.id,
    tg.tg_chat_id,
    tg.title,
    tg.bot_status,
    tg.chat_type,
    tg.linked_chat_id
FROM public.telegram_groups tg
WHERE tg.tg_chat_id = -1003401096638;

-- Count participants in participant_groups
SELECT 
    'participant_groups count' as check_type,
    COUNT(*) as total_in_pg,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_in_pg
FROM public.participant_groups
WHERE tg_group_id = -1003401096638;

-- Get all participants from participant_groups
SELECT 
    'All from participant_groups' as check_type,
    pg.participant_id,
    pg.is_active,
    p.tg_user_id,
    p.username,
    p.first_name,
    p.last_name,
    p.source,
    p.merged_into,
    p.participant_status
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1003401096638
ORDER BY pg.is_active DESC, p.username;

-- Count valid participants (after filtering)
SELECT 
    'Valid participants count' as check_type,
    COUNT(*) as valid_count
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1003401096638
  AND pg.is_active = true
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND p.source != 'bot'
  AND p.merged_into IS NULL
  AND p.participant_status != 'excluded';

-- =====================================
-- 5. Check for system account IDs
-- =====================================
SELECT '=== System Accounts Check ===' as separator;

SELECT 
    'System accounts in participants' as check_type,
    p.id,
    p.tg_user_id,
    p.username,
    p.first_name,
    p.source,
    p.participant_status,
    p.org_id
FROM public.participants p
WHERE p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND (p.tg_user_id IN (777000, 136817688, 1087968824) 
       OR p.username IN ('Telegram', 'Channel_Bot', 'GroupAnonymousBot')
       OR p.first_name IN ('Telegram', 'Channel'))
ORDER BY p.tg_user_id;
