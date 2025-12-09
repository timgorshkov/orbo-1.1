-- Migration 136: Create RPC function to get user by email
-- Purpose: Allow superadmin to find user by email for adding superadmins

CREATE OR REPLACE FUNCTION public.get_user_by_email(user_email VARCHAR(255))
RETURNS TABLE (
  id UUID,
  email VARCHAR(255),
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  raw_user_meta_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.email_confirmed_at,
    u.last_sign_in_at,
    u.created_at,
    u.raw_user_meta_data
  FROM auth.users u
  WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(user_email));
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_by_email(VARCHAR(255)) TO authenticated;

COMMENT ON FUNCTION public.get_user_by_email IS 'Find auth.users data by email. Used by superadmin panel for adding superadmins.';

