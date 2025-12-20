-- =============================================
-- Migration 162: Helper function to get user display name
-- Получение отображаемого имени пользователя
-- =============================================

CREATE OR REPLACE FUNCTION get_user_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name TEXT;
BEGIN
  -- 1. Try auth.users raw_user_meta_data
  SELECT 
    COALESCE(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      SPLIT_PART(email, '@', 1)
    )
  INTO v_name
  FROM auth.users
  WHERE id = p_user_id;
  
  IF v_name IS NOT NULL AND v_name != '' THEN
    RETURN v_name;
  END IF;
  
  -- 2. Try user_telegram_accounts (verified Telegram name)
  SELECT 
    COALESCE(
      CONCAT(telegram_first_name, ' ', telegram_last_name),
      telegram_username,
      telegram_first_name
    )
  INTO v_name
  FROM user_telegram_accounts
  WHERE user_id = p_user_id
    AND is_verified = true
  ORDER BY verified_at DESC
  LIMIT 1;
  
  IF v_name IS NOT NULL AND TRIM(v_name) != '' THEN
    RETURN TRIM(v_name);
  END IF;
  
  -- 3. Fallback to email
  SELECT email INTO v_name
  FROM auth.users
  WHERE id = p_user_id;
  
  RETURN COALESCE(v_name, 'Пользователь');
END;
$$;

COMMENT ON FUNCTION get_user_display_name IS 'Возвращает отображаемое имя пользователя из доступных источников';

