-- Migration 159: Fix organization_admins view - restore missing fields
-- Date: 2025-12-20
-- Problem: Migration 149 removed email_confirmed, has_verified_telegram fields
-- Solution: Restore full view with all necessary fields

DO $$ BEGIN 
  RAISE NOTICE 'Restoring organization_admins view with all fields...'; 
END $$;

-- Drop and recreate organization_admins view with ALL fields
DROP VIEW IF EXISTS public.organization_admins CASCADE;

CREATE VIEW public.organization_admins 
WITH (security_invoker = true) AS
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
  
  -- has_verified_telegram берём из ЛЮБОЙ org
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

FROM public.memberships m
LEFT JOIN auth.users u ON u.id = m.user_id

-- JOIN для текущей организации (приоритет)
LEFT JOIN public.user_telegram_accounts uta_current 
  ON uta_current.user_id = m.user_id 
  AND uta_current.org_id = m.org_id

-- JOIN для ЛЮБОЙ организации (fallback)
LEFT JOIN LATERAL (
  SELECT * 
  FROM public.user_telegram_accounts uta_global
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
  FROM public.participants p_inner
  WHERE p_inner.user_id = m.user_id 
    AND p_inner.org_id = m.org_id
    AND p_inner.merged_into IS NULL
  LIMIT 1
) p ON true

LEFT JOIN public.organizations o ON o.id = m.org_id

WHERE m.role IN ('owner', 'admin');

-- Grant access
GRANT SELECT ON public.organization_admins TO authenticated;

COMMENT ON VIEW public.organization_admins IS 'View for managing organization admins with verification status (restored in migration 159)';

DO $$ BEGIN 
  RAISE NOTICE 'Migration 159 complete: organization_admins view restored with email_confirmed, has_verified_telegram'; 
END $$;

