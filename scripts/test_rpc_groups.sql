-- Test RPC function for 3 groups
SELECT 'Group 1: -1003485407311' as group_name, 
       public.count_valid_group_participants(-1003485407311, 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid) as participant_count;

SELECT 'Group 2: -1002994446785' as group_name,
       public.count_valid_group_participants(-1002994446785, 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid) as participant_count;

SELECT 'Group 3: -1003401096638' as group_name,
       public.count_valid_group_participants(-1003401096638, 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid) as participant_count;

-- Also check details for each group
SELECT 'Group 1 Details' as info;
SELECT pg.participant_id, pg.is_active, p.username, p.first_name, p.source, p.participant_status, p.merged_into
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1003485407311
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid;

SELECT 'Group 2 Details' as info;
SELECT pg.participant_id, pg.is_active, p.username, p.first_name, p.source, p.participant_status, p.merged_into
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1002994446785
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid;

SELECT 'Group 3 Details' as info;
SELECT pg.participant_id, pg.is_active, p.username, p.first_name, p.tg_user_id, p.source, p.participant_status, p.merged_into
FROM public.participant_groups pg
JOIN public.participants p ON p.id = pg.participant_id
WHERE pg.tg_group_id = -1003401096638
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid;
