-- БЫСТРОЕ ИСПРАВЛЕНИЕ: Понизить Тимофея с owner до admin в org2
-- Выполните это СЕЙЧАС, чтобы увидеть результат немедленно
-- Потом выполните миграции 062-064 для системного решения

-- Понижаем Тимофея с owner до admin во 2-й организации
UPDATE memberships
SET role = 'admin'
WHERE org_id = '7363155c-5070-4560-aa3d-89b1bef7df7b'
  AND user_id = '9bb4b601-fa85-44d4-a811-58bf0c889e93'
  AND role = 'owner';

-- Проверка результата
SELECT 
  '✅ РЕЗУЛЬТАТ' as status,
  role,
  full_name,
  email,
  has_verified_telegram
FROM organization_admins
WHERE org_id = '7363155c-5070-4560-aa3d-89b1bef7df7b'
ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END;


