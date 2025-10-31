-- Migration 068: Create RPC function to get auth.users data
-- Purpose: Allow superadmin to fetch user emails and metadata from auth schema

CREATE OR REPLACE FUNCTION public.get_users_by_ids(user_ids UUID[])
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
  WHERE u.id = ANY(user_ids);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_users_by_ids(UUID[]) TO authenticated;

COMMENT ON FUNCTION public.get_users_by_ids IS 'Fetch auth.users data by user IDs. Used by superadmin panel.';

