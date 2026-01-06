-- =====================================================
-- Migration: Remove auth.users dependency from runtime functions
-- =====================================================
-- Purpose: Replace auth.users references with profiles table
-- Date: 2025-01-06
--
-- Problem: After migration to self-hosted PostgreSQL, auth.users doesn't exist
-- Solution: Use profiles table (which has email, tg_user_id, etc.)
-- =====================================================

-- 1. Fix get_user_id_by_email function
CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Query profiles table instead of auth.users
  SELECT id INTO v_user_id
  FROM profiles
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
  
  RETURN v_user_id;
END;
$$;

COMMENT ON FUNCTION get_user_id_by_email IS 'Returns user_id by email from profiles table (not auth.users)';

-- 2. Fix get_user_display_name function
CREATE OR REPLACE FUNCTION get_user_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  -- 1. Try profile display_name
  SELECT display_name INTO v_name
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_name IS NOT NULL AND v_name != '' THEN
    RETURN v_name;
  END IF;

  -- 2. Try to construct from participant full_name
  SELECT full_name INTO v_name
  FROM participants
  WHERE user_id = p_user_id
    AND full_name IS NOT NULL
    AND full_name != ''
  LIMIT 1;
  
  IF v_name IS NOT NULL AND v_name != '' THEN
    RETURN v_name;
  END IF;

  -- 3. Fallback to email (extract part before @)
  SELECT SPLIT_PART(email, '@', 1) INTO v_name
  FROM profiles
  WHERE id = p_user_id;
  
  RETURN COALESCE(v_name, 'Пользователь');
END;
$$;

COMMENT ON FUNCTION get_user_display_name IS 'Returns display name from profile or participant, fallback to email prefix';

-- 3. Fix get_user_telegram_id function
CREATE OR REPLACE FUNCTION get_user_telegram_id(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tg_user_id BIGINT;
BEGIN
  -- 1. Try user_telegram_accounts table first (most reliable)
  SELECT tg_user_id INTO v_tg_user_id
  FROM user_telegram_accounts
  WHERE user_id = p_user_id
    AND verified = true
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_tg_user_id IS NOT NULL THEN
    RETURN v_tg_user_id;
  END IF;
  
  -- 2. Try profiles table (has tg_user_id field)
  SELECT tg_user_id INTO v_tg_user_id
  FROM profiles
  WHERE id = p_user_id
    AND tg_user_id IS NOT NULL;
  
  IF v_tg_user_id IS NOT NULL THEN
    RETURN v_tg_user_id;
  END IF;
  
  -- 3. Try participants table (linked via user_id)
  SELECT tg_user_id INTO v_tg_user_id
  FROM participants
  WHERE user_id = p_user_id
    AND tg_user_id IS NOT NULL
    AND merged_into IS NULL
  LIMIT 1;
  
  RETURN v_tg_user_id;
END;
$$;

COMMENT ON FUNCTION get_user_telegram_id IS 'Returns Telegram user ID from user_telegram_accounts, profiles, or participants';

-- 4. Fix get_user_by_email function
DROP FUNCTION IF EXISTS get_user_by_email(TEXT);

CREATE OR REPLACE FUNCTION get_user_by_email(user_email TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  raw_user_meta_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email::TEXT,
    p.email_verified_at as email_confirmed_at,
    p.updated_at as last_sign_in_at,
    p.created_at,
    jsonb_build_object(
      'display_name', p.display_name,
      'tg_user_id', p.tg_user_id,
      'avatar_url', p.avatar_url
    ) as raw_user_meta_data
  FROM profiles p
  WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(user_email));
END;
$$;

COMMENT ON FUNCTION get_user_by_email IS 'Returns user info by email from profiles table';

-- 5. Fix get_user_info_secure function
DROP FUNCTION IF EXISTS get_user_info_secure(UUID);

CREATE OR REPLACE FUNCTION get_user_info_secure(p_user_id UUID)
RETURNS TABLE (
  email TEXT,
  has_verified_email BOOLEAN,
  email_confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.email::TEXT,
    (p.email IS NOT NULL AND p.email_verified_at IS NOT NULL)::BOOLEAN as has_verified_email,
    p.email_verified_at as email_confirmed_at
  FROM profiles p
  WHERE p.id = p_user_id;
END;
$$;

COMMENT ON FUNCTION get_user_info_secure IS 'Securely returns user email info from profiles';

-- 6. Fix organization_admins view (if exists)
DO $$
BEGIN
  -- Check if view exists and depends on auth.users
  IF EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_name = 'organization_admins' 
    AND table_schema = 'public'
  ) THEN
    -- Drop and recreate without auth.users dependency
    DROP VIEW IF EXISTS public.organization_admins CASCADE;
    
    CREATE OR REPLACE VIEW public.organization_admins AS
    SELECT
      m.org_id,
      m.user_id,
      m.role,
      m.role_source,
      
      -- Get email from profiles
      p.email,
      (p.email IS NOT NULL AND p.email_verified_at IS NOT NULL) as has_verified_email,
      p.email_verified_at,
      
      -- Get Telegram info
      COALESCE(uta.tg_user_id, participant.tg_user_id, p.tg_user_id) as tg_user_id,
      COALESCE(uta.tg_username, participant.username) as tg_username,
      COALESCE(uta.tg_first_name, participant.full_name) as tg_first_name,
      uta.verified as has_verified_telegram,
      
      -- Metadata
      m.created_at,
      m.metadata,
      (m.metadata->>'synced_at')::timestamptz as last_synced_at
    FROM public.memberships m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN public.user_telegram_accounts uta ON uta.user_id = m.user_id AND uta.verified = true
    LEFT JOIN public.participants participant ON participant.user_id = m.user_id 
      AND participant.org_id = m.org_id 
      AND participant.merged_into IS NULL
    WHERE m.role IN ('admin', 'owner');
    
    RAISE NOTICE '✅ Recreated organization_admins view without auth.users';
  END IF;
END $$;

-- 7. Add email_verified_at column to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email_verified_at TIMESTAMPTZ;
    RAISE NOTICE '✅ Added email_verified_at column to profiles';
  END IF;
END $$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ All auth.users dependencies removed from runtime functions';
  RAISE NOTICE 'Functions updated:';
  RAISE NOTICE '  - get_user_id_by_email';
  RAISE NOTICE '  - get_user_display_name';
  RAISE NOTICE '  - get_user_telegram_id';
  RAISE NOTICE '  - get_user_by_email';
  RAISE NOTICE '  - get_user_info_secure';
  RAISE NOTICE '  - organization_admins view';
END $$;

