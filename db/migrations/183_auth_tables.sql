-- =====================================================
-- Migration: Create local auth tables (NextAuth.js compatible)
-- =====================================================
-- Purpose: Replace Supabase Auth with local PostgreSQL tables
-- Date: 2025-01-06
--
-- Tables:
-- - users: Main user table (replaces auth.users)
-- - accounts: OAuth accounts (Google, Yandex, etc.)
-- - sessions: User sessions
-- - verification_tokens: Email verification tokens
-- =====================================================

-- Users table (NextAuth.js compatible)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE,
  email_verified TIMESTAMPTZ,
  image TEXT,
  
  -- Custom fields
  tg_user_id BIGINT,
  phone TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tg_user_id ON users(tg_user_id);

COMMENT ON TABLE users IS 'User accounts (NextAuth.js compatible, replaces Supabase auth.users)';

-- Accounts table (OAuth accounts linked to users)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'oauth', 'email', 'credentials'
  provider TEXT NOT NULL, -- 'google', 'yandex', 'email', 'telegram'
  provider_account_id TEXT NOT NULL,
  
  -- OAuth tokens
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);

COMMENT ON TABLE accounts IS 'OAuth and other auth accounts linked to users';

-- Sessions table (for session strategy = "database")
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  
  -- Additional metadata
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

COMMENT ON TABLE sessions IS 'User sessions (optional, for database session strategy)';

-- Verification tokens (for email magic links)
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL, -- usually email
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  
  PRIMARY KEY (identifier, token)
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires ON verification_tokens(expires);

COMMENT ON TABLE verification_tokens IS 'Email verification and magic link tokens';

-- Update get_user_id_by_email to use new users table
CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
  
  RETURN v_user_id;
END;
$$;

COMMENT ON FUNCTION get_user_id_by_email IS 'Returns user_id by email from users table';

-- Update get_user_display_name to use new users table
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
  -- 1. Try users.name
  SELECT name INTO v_name
  FROM users
  WHERE id = p_user_id;
  
  IF v_name IS NOT NULL AND v_name != '' THEN
    RETURN v_name;
  END IF;

  -- 2. Try participant full_name
  SELECT full_name INTO v_name
  FROM participants
  WHERE user_id = p_user_id
    AND full_name IS NOT NULL
    AND full_name != ''
  LIMIT 1;
  
  IF v_name IS NOT NULL AND v_name != '' THEN
    RETURN v_name;
  END IF;

  -- 3. Fallback to email prefix
  SELECT SPLIT_PART(email, '@', 1) INTO v_name
  FROM users
  WHERE id = p_user_id;
  
  RETURN COALESCE(v_name, 'Пользователь');
END;
$$;

COMMENT ON FUNCTION get_user_display_name IS 'Returns display name from users table or participants';

-- Update get_user_telegram_id to use new users table
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
  -- 1. Try users.tg_user_id first
  SELECT tg_user_id INTO v_tg_user_id
  FROM users
  WHERE id = p_user_id
    AND tg_user_id IS NOT NULL;
  
  IF v_tg_user_id IS NOT NULL THEN
    RETURN v_tg_user_id;
  END IF;
  
  -- 2. Try user_telegram_accounts table
  SELECT telegram_user_id INTO v_tg_user_id
  FROM user_telegram_accounts
  WHERE user_id = p_user_id
    AND is_verified = true
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_tg_user_id IS NOT NULL THEN
    RETURN v_tg_user_id;
  END IF;
  
  -- 3. Try participants table
  SELECT tg_user_id INTO v_tg_user_id
  FROM participants
  WHERE user_id = p_user_id
    AND tg_user_id IS NOT NULL
    AND merged_into IS NULL
  LIMIT 1;
  
  RETURN v_tg_user_id;
END;
$$;

COMMENT ON FUNCTION get_user_telegram_id IS 'Returns Telegram user ID from users, user_telegram_accounts, or participants';

-- Drop profiles table (no longer needed)
DROP TABLE IF EXISTS profiles CASCADE;

-- Cleanup old email_auth_tokens (will use verification_tokens instead)
-- Keep for backward compatibility during migration, can be dropped later
-- ALTER TABLE email_auth_tokens RENAME TO email_auth_tokens_deprecated;

-- Verification
DO $$
DECLARE
  v_users_count INT;
  v_accounts_count INT;
BEGIN
  SELECT COUNT(*) INTO v_users_count FROM users;
  SELECT COUNT(*) INTO v_accounts_count FROM accounts;
  
  RAISE NOTICE '✅ Auth tables created';
  RAISE NOTICE '   - users: % rows', v_users_count;
  RAISE NOTICE '   - accounts: % rows', v_accounts_count;
END $$;

