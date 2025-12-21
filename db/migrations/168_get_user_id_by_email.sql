-- Function to get Supabase user ID by email
-- Used by unified auth to link NextAuth users to existing Supabase users

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Query auth.users table (requires SECURITY DEFINER to access)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
  
  RETURN v_user_id;
END;
$$;

-- Grant execute to authenticated and service role
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_user_id_by_email IS 'Returns Supabase user ID for a given email address. Used to link NextAuth sessions to existing Supabase users.';

