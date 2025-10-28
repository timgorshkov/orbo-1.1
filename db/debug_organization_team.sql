-- Диагностика данных команды для организации a3e8bc8f-8171-472c-a955-2f7878aed6f1

-- 1. Проверяем memberships
SELECT 
  'MEMBERSHIPS' as source,
  m.user_id,
  m.role,
  m.role_source,
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  m.created_at
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
ORDER BY 
  CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
  m.created_at;

-- 2. Проверяем user_telegram_accounts
SELECT 
  'USER_TELEGRAM_ACCOUNTS' as source,
  uta.user_id,
  uta.org_id,
  uta.telegram_username,
  uta.telegram_user_id,
  uta.is_verified,
  uta.created_at
FROM user_telegram_accounts uta
WHERE uta.user_id IN (
  SELECT user_id FROM memberships WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
)
ORDER BY uta.user_id, uta.is_verified DESC;

-- 3. Проверяем что возвращает view organization_admins
SELECT 
  'ORGANIZATION_ADMINS VIEW' as source,
  oa.user_id,
  oa.role,
  oa.role_source,
  oa.email,
  oa.email_confirmed,
  oa.email_confirmed_at,
  oa.telegram_username,
  oa.tg_user_id,
  oa.has_verified_telegram,
  oa.is_shadow_profile
FROM organization_admins oa
WHERE oa.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
ORDER BY 
  CASE oa.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
  oa.created_at;

-- 4. Проверяем participants
SELECT 
  'PARTICIPANTS' as source,
  p.user_id,
  p.full_name,
  p.username,
  p.tg_user_id,
  p.participant_status,
  p.source
FROM participants p
WHERE p.user_id IN (
  SELECT user_id FROM memberships WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
)
AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';

