-- Check if auth.users still exists and has data
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'auth' AND table_name = 'users'
) as auth_users_exists;

-- If exists, check data
-- SELECT id, email, raw_user_meta_data FROM auth.users LIMIT 5;
