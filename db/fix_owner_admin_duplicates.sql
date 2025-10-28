-- Исправление дублирования владельца в списке администраторов
-- Если пользователь является owner, удаляем его запись с role='admin'

-- Проверяем наличие дублей
SELECT 
  m.org_id,
  m.user_id,
  o.name as org_name,
  u.email,
  COUNT(*) as membership_count,
  string_agg(m.role || ' (' || m.role_source || ')', ', ') as roles
FROM memberships m
LEFT JOIN organizations o ON o.id = m.org_id
LEFT JOIN auth.users u ON u.id = m.user_id
GROUP BY m.org_id, m.user_id, o.name, u.email
HAVING COUNT(*) > 1;

-- Удаляем записи admin для пользователей, которые уже являются owner
-- Сохраняем только запись с role='owner'
DELETE FROM memberships m1
WHERE m1.role = 'admin'
AND EXISTS (
  SELECT 1 
  FROM memberships m2 
  WHERE m2.org_id = m1.org_id 
    AND m2.user_id = m1.user_id 
    AND m2.role = 'owner'
);

-- Проверяем результат
SELECT 
  m.org_id,
  m.user_id,
  o.name as org_name,
  u.email,
  COUNT(*) as membership_count,
  string_agg(m.role || ' (' || m.role_source || ')', ', ') as roles
FROM memberships m
LEFT JOIN organizations o ON o.id = m.org_id
LEFT JOIN auth.users u ON u.id = m.user_id
GROUP BY m.org_id, m.user_id, o.name, u.email
HAVING COUNT(*) > 1;

