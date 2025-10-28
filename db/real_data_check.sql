-- Проверка реальных данных для организации a3e8bc8f-8171-472c-a955-2f7878aed6f1

-- 1. Memberships
SELECT 
  'MEMBERSHIPS' as table_name,
  user_id,
  role,
  role_source
FROM memberships
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';

-- 2. Auth users (email)
SELECT 
  'AUTH.USERS' as table_name,
  u.id as user_id,
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed
FROM auth.users u
WHERE u.id IN (
  SELECT user_id FROM memberships WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
);

-- 3. User Telegram Accounts
SELECT 
  'USER_TELEGRAM_ACCOUNTS' as table_name,
  uta.user_id,
  uta.org_id,
  uta.telegram_username,
  uta.telegram_user_id,
  uta.is_verified,
  uta.verified_at
FROM user_telegram_accounts uta
WHERE uta.user_id IN (
  SELECT user_id FROM memberships WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
)
ORDER BY uta.user_id, uta.created_at;

-- 4. Что возвращает view
SELECT 
  'ORGANIZATION_ADMINS VIEW' as table_name,
  oa.user_id,
  oa.role,
  oa.email,
  oa.email_confirmed,
  oa.telegram_username,
  oa.tg_user_id,
  oa.has_verified_telegram
FROM organization_admins oa
WHERE oa.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';

