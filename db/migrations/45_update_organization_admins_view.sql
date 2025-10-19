-- Обновление view organization_admins для отображения custom_title из Telegram

DROP VIEW IF EXISTS organization_admins;

CREATE VIEW organization_admins AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  m.metadata,
  m.created_at,
  u.email,
  COALESCE(
    CONCAT(uta.telegram_first_name, ' ', uta.telegram_last_name),
    uta.telegram_first_name,
    u.email
  ) as full_name,
  uta.telegram_username,
  uta.telegram_user_id as tg_user_id,
  uta.is_verified as has_verified_telegram,
  o.name as org_name,
  -- Добавляем custom_title из metadata (массив должностей из разных групп)
  m.metadata->>'custom_titles' as custom_titles_json
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id AND uta.org_id = m.org_id AND uta.is_verified = true
LEFT JOIN organizations o ON o.id = m.org_id
WHERE m.role IN ('owner', 'admin');

COMMENT ON VIEW organization_admins IS 'View for managing organization admins with their Telegram info and custom titles';
COMMENT ON COLUMN organization_admins.custom_titles_json IS 'JSON array of custom admin titles from Telegram groups';

