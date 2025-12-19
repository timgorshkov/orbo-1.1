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

-- Comments
COMMENT ON FUNCTION increment_notification_trigger_count IS 'Atomically increment notification rule trigger count';

