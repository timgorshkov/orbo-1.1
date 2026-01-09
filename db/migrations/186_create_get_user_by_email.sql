-- Migration: Create get_user_by_email function
-- Description: Function to find user by email in local users table
-- Required for superadmin management after migration from Supabase

DROP FUNCTION IF EXISTS get_user_by_email(TEXT);

CREATE OR REPLACE FUNCTION get_user_by_email(user_email TEXT)
RETURNS TABLE(id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email
  FROM users u
  WHERE LOWER(u.email) = LOWER(user_email)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_by_email(TEXT) IS 'Find user by email address (case-insensitive)';
