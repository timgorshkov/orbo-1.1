-- Диагностика утечки bio и custom_attributes между организациями
-- Находит участников, которые существуют в нескольких организациях
-- и имеют одинаковые bio/custom_attributes

-- 1. Участники в нескольких организациях
SELECT 
  'Participants in multiple orgs' as check_type,
  tg_user_id,
  COUNT(DISTINCT org_id) as org_count,
  array_agg(DISTINCT org_id::text) as org_ids,
  array_agg(DISTINCT full_name) as names
FROM participants
WHERE tg_user_id IS NOT NULL
GROUP BY tg_user_id
HAVING COUNT(DISTINCT org_id) > 1
ORDER BY org_count DESC;

-- 2. Участники с одинаковыми bio в разных организациях
WITH multi_org_participants AS (
  SELECT tg_user_id
  FROM participants
  WHERE tg_user_id IS NOT NULL
  GROUP BY tg_user_id
  HAVING COUNT(DISTINCT org_id) > 1
)
SELECT 
  'Same bio across orgs' as check_type,
  p.tg_user_id,
  p.full_name,
  p.org_id,
  o.name as org_name,
  LENGTH(p.bio) as bio_length,
  LEFT(p.bio, 100) as bio_preview
FROM participants p
JOIN multi_org_participants mop ON p.tg_user_id = mop.tg_user_id
JOIN organizations o ON p.org_id = o.id
WHERE p.bio IS NOT NULL 
  AND p.bio != ''
ORDER BY p.tg_user_id, p.org_id;

-- 3. Участники с одинаковыми custom_attributes в разных организациях
WITH multi_org_participants AS (
  SELECT tg_user_id
  FROM participants
  WHERE tg_user_id IS NOT NULL
  GROUP BY tg_user_id
  HAVING COUNT(DISTINCT org_id) > 1
)
SELECT 
  'Same custom_attributes across orgs' as check_type,
  p.tg_user_id,
  p.full_name,
  p.org_id,
  o.name as org_name,
  jsonb_object_keys(p.custom_attributes) as attribute_keys,
  p.custom_attributes
FROM participants p
JOIN multi_org_participants mop ON p.tg_user_id = mop.tg_user_id
JOIN organizations o ON p.org_id = o.id
WHERE p.custom_attributes IS NOT NULL 
  AND p.custom_attributes != '{}'::jsonb
ORDER BY p.tg_user_id, p.org_id;

-- 4. Статистика: сколько участников затронуто
SELECT 
  'Summary statistics' as check_type,
  (SELECT COUNT(*) FROM (
    SELECT tg_user_id 
    FROM participants 
    WHERE tg_user_id IS NOT NULL
    GROUP BY tg_user_id
    HAVING COUNT(DISTINCT org_id) > 1
  ) AS multi_org) as participants_in_multiple_orgs,
  (SELECT COUNT(*) 
   FROM participants 
   WHERE bio IS NOT NULL AND bio != '') as participants_with_bio,
  (SELECT COUNT(*) 
   FROM participants 
   WHERE custom_attributes IS NOT NULL AND custom_attributes != '{}'::jsonb) as participants_with_custom_attributes;

