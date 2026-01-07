-- Create profiles table for compatibility with functions that reference auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}',
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Populate from users table
INSERT INTO profiles (id, email, email_verified_at, created_at, updated_at)
SELECT id, email, email_verified_at, created_at, updated_at
FROM users
ON CONFLICT (id) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

