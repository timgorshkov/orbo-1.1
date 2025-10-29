-- Быстрая диагностика для новой организации
-- ЗАМЕНИТЕ org_id на ID вашей новой организации

-- Проверка 1: Memberships (роли в организации)
SELECT 
  'Memberships' as check_type,
  m.user_id,
  m.role,
  m.role_source,
  u.email,
  (m.metadata->>'is_owner_in_groups')::boolean as is_owner_in_groups
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = 'REPLACE_WITH_ORG_ID'
ORDER BY 
  CASE m.role WHEN 'owner' THEN 1 ELSE 2 END;

-- Проверка 2: Organization Admins VIEW
SELECT 
  'Organization Admins VIEW' as check_type,
  user_id,
  role,
  full_name,
  email,
  telegram_username,
  role_source
FROM organization_admins
WHERE org_id = 'REPLACE_WITH_ORG_ID'
ORDER BY 
  CASE role WHEN 'owner' THEN 1 ELSE 2 END;

-- Проверка 3: Participants с user_id
SELECT 
  'Participants with user_id' as check_type,
  p.id,
  p.user_id,
  p.full_name,
  p.tg_user_id,
  p.username
FROM participants p
WHERE p.org_id = 'REPLACE_WITH_ORG_ID'
  AND p.user_id IS NOT NULL;

