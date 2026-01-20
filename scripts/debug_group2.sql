-- Debug Group 2: -1002994446785
-- Show all participant details including tg_user_id

SELECT 
    p.id,
    p.tg_user_id,
    p.username,
    p.first_name,
    p.last_name,
    p.full_name,
    p.email,
    p.phone,
    p.source,
    p.participant_status,
    p.merged_into,
    pg.is_active
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1002994446785
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
ORDER BY p.source, p.first_name;

-- Also check Group 1 for Belyaev_Aleksey status
SELECT 'Group 1 - Check Belyaev_Aleksey status' as info;
SELECT 
    p.id,
    p.tg_user_id,
    p.username,
    p.first_name,
    p.participant_status,
    p.source
FROM public.participants p
WHERE p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
  AND p.username = 'Belyaev_Aleksey';
