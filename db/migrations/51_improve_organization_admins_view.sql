-- Migration 51: Улучшение view organization_admins для показа всех админов
-- Включая теневых админов (без email)

DROP VIEW IF EXISTS organization_admins;

CREATE VIEW organization_admins AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  m.metadata,
  m.created_at,
  
  -- Email и статус подтверждения
  u.email,
  (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL) as email_confirmed,
  u.email_confirmed_at,
  
  -- Имя из разных источников (Telegram приоритетнее)
  COALESCE(
    -- Если есть Telegram, берем имя оттуда
    NULLIF(TRIM(CONCAT(uta.telegram_first_name, ' ', uta.telegram_last_name)), ''),
    uta.telegram_first_name,
    -- Если нет Telegram, берем email
    u.email,
    -- Если совсем ничего нет
    'Администратор'
  ) as full_name,
  
  -- Telegram данные
  uta.telegram_username,
  uta.telegram_user_id as tg_user_id,
  uta.is_verified as has_verified_telegram,
  uta.telegram_first_name,
  uta.telegram_last_name,
  
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
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id 
  AND (uta.org_id = m.org_id OR uta.org_id IS NULL) 
  AND uta.is_verified = true
LEFT JOIN organizations o ON o.id = m.org_id
WHERE m.role IN ('owner', 'admin')
ORDER BY 
  CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
  m.created_at;

COMMENT ON VIEW organization_admins IS 'View для управления командой организации с полной информацией о Telegram, email и правах';
COMMENT ON COLUMN organization_admins.is_shadow_profile IS 'Теневой профиль - админ из Telegram без подтвержденного email (read-only доступ)';
COMMENT ON COLUMN organization_admins.email_confirmed IS 'Email подтвержден (может редактировать контент)';
COMMENT ON COLUMN organization_admins.has_verified_telegram IS 'Telegram аккаунт привязан и верифицирован';

-- Тестовый запрос для проверки
DO $$
BEGIN
  RAISE NOTICE 'View organization_admins обновлен. Проверка доступна через: SELECT * FROM organization_admins WHERE org_id = ''your-org-id'';';
END $$;

