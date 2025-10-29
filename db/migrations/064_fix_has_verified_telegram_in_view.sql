-- Migration 064: Fix has_verified_telegram in organization_admins view
-- Created: 2025-10-28
-- Purpose: Show correct verification status even if user verified in another org

DO $$
BEGIN
  RAISE NOTICE 'Updating organization_admins view to fix has_verified_telegram...';
END $$;

-- Пересоздаём VIEW с правильной логикой
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
    p.full_name,
    NULLIF(TRIM(CONCAT(uta_any.telegram_first_name, ' ', uta_any.telegram_last_name)), ''),
    uta_any.telegram_first_name,
    u.email,
    'Администратор'
  ) as full_name,
  
  -- Telegram данные (приоритет: user_telegram_accounts текущей org > любой org > participants)
  COALESCE(uta_current.telegram_username, uta_any.telegram_username, p.username) as telegram_username,
  COALESCE(uta_current.telegram_user_id, uta_any.telegram_user_id, p.tg_user_id) as tg_user_id,
  
  -- ✅ ИСПРАВЛЕНИЕ: has_verified_telegram берём из ЛЮБОЙ org
  COALESCE(
    uta_current.is_verified,  -- Приоритет: текущая org
    uta_any.is_verified,      -- Fallback: любая другая org
    false
  ) as has_verified_telegram,
  
  COALESCE(uta_current.telegram_first_name, uta_any.telegram_first_name, p.tg_first_name) as telegram_first_name,
  COALESCE(uta_current.telegram_last_name, uta_any.telegram_last_name, p.tg_last_name) as telegram_last_name,
  
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

-- ✅ JOIN для текущей организации (приоритет)
LEFT JOIN user_telegram_accounts uta_current 
  ON uta_current.user_id = m.user_id 
  AND uta_current.org_id = m.org_id

-- ✅ JOIN для ЛЮБОЙ организации (fallback)
LEFT JOIN LATERAL (
  SELECT * 
  FROM user_telegram_accounts uta_global
  WHERE uta_global.user_id = m.user_id 
    AND uta_global.is_verified = true
  ORDER BY 
    -- Приоритет текущей org, если не нашли выше
    CASE WHEN uta_global.org_id = m.org_id THEN 0 ELSE 1 END,
    uta_global.verified_at DESC NULLS LAST
  LIMIT 1
) uta_any ON true

LEFT JOIN LATERAL (
  SELECT * 
  FROM participants p_inner
  WHERE p_inner.user_id = m.user_id 
    AND p_inner.org_id = m.org_id
    AND p_inner.merged_into IS NULL
  LIMIT 1
) p ON true

LEFT JOIN organizations o ON o.id = m.org_id

WHERE m.role IN ('owner', 'admin');

COMMENT ON VIEW organization_admins IS 'View for managing organization admins. has_verified_telegram now checks globally!';

DO $$
BEGIN
  RAISE NOTICE 'Migration 064 completed successfully!';
  RAISE NOTICE 'has_verified_telegram will now show correct status even if user verified in another org.';
END $$;


