-- ДИАГНОСТИКА ДУБЛЕЙ В КОМАНДЕ
-- Простая версия для Supabase SQL Editor
-- ЗАМЕНИТЕ org_id в каждом запросе на ваш!

-- 1. ВСЕ ЗАПИСИ В MEMBERSHIPS
SELECT 
  '1️⃣ MEMBERSHIPS' as "📋 Раздел",
  m.user_id as "User ID",
  m.role as "Роль",
  m.role_source as "Источник роли",
  COALESCE(u.email, '❌ нет email') as "Email",
  m.created_at::date as "Создано"
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' -- ⚠️ ЗАМЕНИТЕ на ваш org_id
ORDER BY 
  CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
  m.created_at;

-- 2. ПРОВЕРКА ДУБЛЕЙ USER_ID (самое важное!)
SELECT 
  '2️⃣ ДУБЛИ' as "📋 Раздел",
  user_id as "User ID",
  COUNT(*) as "Количество записей",
  array_agg(role ORDER BY role) as "Роли",
  CASE 
    WHEN COUNT(*) > 1 THEN '⚠️ ДУБЛЬ НАЙДЕН!'
    ELSE '✅ OK'
  END as "Статус"
FROM memberships
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' -- ⚠️ ЗАМЕНИТЕ на ваш org_id
GROUP BY user_id
ORDER BY COUNT(*) DESC;

-- 3. ДАННЫЕ ИЗ VIEW (то что видит страница настроек)
SELECT 
  '3️⃣ VIEW ORGANIZATION_ADMINS' as "📋 Раздел",
  role as "Роль",
  full_name as "Имя",
  COALESCE(email, '❌ нет') as "Email",
  CASE WHEN email_confirmed THEN '✅' ELSE '❌' END as "Email ✓",
  COALESCE(telegram_username, '❌ нет') as "Telegram",
  CASE WHEN has_verified_telegram THEN '✅' ELSE '❌' END as "Telegram ✓",
  CASE WHEN is_shadow_profile THEN '👻 Да' ELSE 'Нет' END as "Теневой"
FROM organization_admins
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' -- ⚠️ ЗАМЕНИТЕ на ваш org_id
ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END;

-- 4. USER_TELEGRAM_ACCOUNTS (Telegram верификация)
SELECT 
  '4️⃣ TELEGRAM ACCOUNTS' as "📋 Раздел",
  uta.username as "Username",
  CASE WHEN uta.is_verified THEN '✅ Да' ELSE '❌ Нет' END as "Верифицирован",
  uta.telegram_first_name as "Имя в TG",
  uta.telegram_last_name as "Фамилия в TG",
  COALESCE(u.email, '❌ нет email') as "Email пользователя"
FROM user_telegram_accounts uta
LEFT JOIN auth.users u ON u.id = uta.user_id
WHERE uta.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' -- ⚠️ ЗАМЕНИТЕ на ваш org_id
ORDER BY u.email NULLS LAST;

-- 5. EMAIL VERIFICATION (проверка подтверждения email)
SELECT 
  '5️⃣ EMAIL VERIFICATION' as "📋 Раздел",
  u.email as "Email",
  CASE 
    WHEN u.email_confirmed_at IS NOT NULL THEN '✅ Подтверждён'
    ELSE '❌ Не подтверждён'
  END as "Статус",
  u.email_confirmed_at::date as "Дата подтверждения"
FROM auth.users u
WHERE u.id IN (
  SELECT user_id FROM memberships 
  WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' -- ⚠️ ЗАМЕНИТЕ на ваш org_id
)
ORDER BY u.email NULLS LAST;

-- 6. ИТОГОВАЯ СТАТИСТИКА
SELECT 
  '6️⃣ ИТОГО' as "📋 Раздел",
  (SELECT COUNT(*) FROM memberships 
   WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1') as "Всего записей в memberships",
  (SELECT COUNT(DISTINCT user_id) FROM memberships 
   WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1') as "Уникальных пользователей",
  (SELECT COUNT(*) FROM memberships 
   WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' AND role = 'owner') as "Владельцев",
  (SELECT COUNT(*) FROM memberships 
   WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' AND role = 'admin') as "Админов",
  CASE 
    WHEN (SELECT COUNT(*) FROM memberships 
          WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1') > 
         (SELECT COUNT(DISTINCT user_id) FROM memberships 
          WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1')
    THEN '⚠️ ЕСТЬ ДУБЛИ!'
    ELSE '✅ Всё ОК'
  END as "Дубли?";


