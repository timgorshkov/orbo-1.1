-- =============================================
-- Migration 155: Notification Helper Functions
-- Helper functions for notification rules system
-- =============================================

-- Function to increment trigger_count atomically
CREATE OR REPLACE FUNCTION increment_notification_trigger_count(p_rule_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notification_rules
  SET trigger_count = trigger_count + 1
  WHERE id = p_rule_id;
END;
$$;

-- Grant execute to authenticated users (will be called by service role anyway)
GRANT EXECUTE ON FUNCTION increment_notification_trigger_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_notification_trigger_count(UUID) TO service_role;

-- Also grant permissions for check_notification_duplicate function
GRANT EXECUTE ON FUNCTION check_notification_duplicate(UUID, TEXT, INTEGER) TO service_role;

-- Function to get user's telegram ID from auth.users
CREATE OR REPLACE FUNCTION get_user_telegram_id(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tg_user_id BIGINT;
BEGIN
  SELECT (raw_user_meta_data->>'tg_user_id')::BIGINT INTO v_tg_user_id
  FROM auth.users
  WHERE id = p_user_id;
  
  RETURN v_tg_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_telegram_id(UUID) TO service_role;

-- Comments
COMMENT ON FUNCTION increment_notification_trigger_count IS 'Atomically increment notification rule trigger count';
COMMENT ON FUNCTION get_user_telegram_id IS 'Get telegram user ID from auth.users metadata';

