-- =====================================================
-- Migration: Create profiles table for self-hosted PostgreSQL
-- =====================================================
-- Purpose: Create profiles table to replace auth.users dependency
-- Date: 2025-01-06
--
-- In Supabase, profiles table was linked to auth.users
-- For self-hosted PostgreSQL, we need our own profiles table
-- =====================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  tg_user_id BIGINT,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_tg_user_id ON profiles(tg_user_id);

-- Comment
COMMENT ON TABLE profiles IS 'User profiles (replaces Supabase auth.users for self-hosted PostgreSQL)';

-- Populate profiles from existing data (user_telegram_accounts, participants)
INSERT INTO profiles (id, email, display_name, tg_user_id, created_at, updated_at)
SELECT DISTINCT 
  uta.user_id as id,
  NULL as email, -- Email comes from Supabase Auth which we still use
  COALESCE(
    (SELECT p.full_name FROM participants p WHERE p.user_id = uta.user_id AND p.full_name IS NOT NULL LIMIT 1),
    uta.tg_first_name
  ) as display_name,
  uta.tg_user_id,
  uta.created_at,
  uta.updated_at
FROM user_telegram_accounts uta
WHERE uta.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE 'Inserted profiles from user_telegram_accounts';

-- Add any users from memberships that don't have profiles yet
INSERT INTO profiles (id, created_at, updated_at)
SELECT DISTINCT 
  m.user_id,
  NOW(),
  NOW()
FROM memberships m
WHERE m.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.user_id)
ON CONFLICT (id) DO NOTHING;

-- Recreate organization_admins view
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

COMMENT ON VIEW organization_admins IS 'View of organization administrators with profile data';

-- Verification
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM profiles;
  RAISE NOTICE '✅ Created profiles table with % rows', v_count;
END $$;

