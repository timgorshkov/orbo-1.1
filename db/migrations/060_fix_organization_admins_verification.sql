-- Migration 060: Исправление view organization_admins для корректного отображения верификации
-- Проблема: фильтр is_verified=true в JOIN исключал неверифицированные записи из результата
-- Решение: убираем фильтр из JOIN, оставляем только проверку org_id

DROP VIEW IF EXISTS organization_admins;

CREATE VIEW organization_admins AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  m.metadata,
  m.created_at,
  
  -- Email и статус подтверждения из auth.users
  u.email,
  (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL) as email_confirmed,
  u.email_confirmed_at,
  
  -- Имя из разных источников (приоритет: participants > user_telegram_accounts > email)
  COALESCE(
    -- 1. Берем из participants (работает и для shadow профилей!)
    p.full_name,
    -- 2. Если нет в participants, берем из user_telegram_accounts
    NULLIF(TRIM(CONCAT(uta.telegram_first_name, ' ', uta.telegram_last_name)), ''),
    uta.telegram_first_name,
    -- 3. Если нет Telegram, берем email
    u.email,
    -- 4. Если совсем ничего нет
    'Администратор'
  ) as full_name,
  
  -- Telegram данные (приоритет: user_telegram_accounts > participants)
  COALESCE(uta.telegram_username, p.username) as telegram_username,
  COALESCE(uta.telegram_user_id, p.tg_user_id) as tg_user_id,
  -- ИСПРАВЛЕНИЕ: берем is_verified напрямую из таблицы, без фильтра в JOIN
  COALESCE(uta.is_verified, false) as has_verified_telegram,
  COALESCE(uta.telegram_first_name, p.tg_first_name) as telegram_first_name,
  COALESCE(uta.telegram_last_name, p.tg_last_name) as telegram_last_name,
  
  -- Название организации
  o.name as org_name,
  
  -- Метаданные о теневом профиле
  COALESCE((m.metadata->>'shadow_profile')::boolean, false) as is_shadow_profile,
  
  -- Custom titles из Telegram
  m.metadata->>'custom_titles' as custom_titles_json,
  
  -- Группы, где администратор
  m.metadata->'telegram_groups' as telegram_group_ids,
  m.metadata->'telegram_group_titles' as telegram_group_titles,
  
  -- Дата синхронизации
  (m.metadata->>'synced_at')::timestamptz as last_synced_at
  
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
-- ИСПРАВЛЕНИЕ: убрали фильтр is_verified=true из JOIN
-- Теперь JOIN возвращает ВСЕ записи user_telegram_accounts для данной org
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id 
  AND uta.org_id = m.org_id
-- JOIN с participants для shadow профилей
LEFT JOIN participants p ON p.user_id = m.user_id 
  AND p.org_id = m.org_id 
  AND p.merged_into IS NULL
LEFT JOIN organizations o ON o.id = m.org_id
WHERE m.role IN ('owner', 'admin')
ORDER BY 
  CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
  m.created_at;

COMMENT ON VIEW organization_admins IS 'View для управления командой организации с полной информацией о Telegram, email и правах. Использует данные из participants для shadow профилей. Версия 060: исправлен баг с отображением верификации.';
COMMENT ON COLUMN organization_admins.is_shadow_profile IS 'Теневой профиль - админ из Telegram без подтвержденного email (read-only доступ)';
COMMENT ON COLUMN organization_admins.email_confirmed IS 'Email подтвержден через auth.users.email_confirmed_at (может редактировать контент)';
COMMENT ON COLUMN organization_admins.has_verified_telegram IS 'Telegram аккаунт привязан и верифицирован через user_telegram_accounts.is_verified для данной организации';

-- Тестовый запрос
DO $$
DECLARE
  test_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
  test_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO test_count
  FROM organization_admins
  WHERE org_id = test_org_id;
  
  RAISE NOTICE 'View organization_admins обновлен. Найдено % членов команды для тестовой организации.', test_count;
  
  -- Выводим детали для проверки
  RAISE NOTICE 'Детали:';
  FOR r IN 
    SELECT user_id, role, email, email_confirmed, has_verified_telegram 
    FROM organization_admins 
    WHERE org_id = test_org_id
  LOOP
    RAISE NOTICE '  User: %, Role: %, Email confirmed: %, Telegram verified: %', 
      r.user_id, r.role, r.email_confirmed, r.has_verified_telegram;
  END LOOP;
END $$;

