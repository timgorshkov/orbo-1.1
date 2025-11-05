-- Migration 086: Reactions Count Helper Function
-- Date: Nov 5, 2025
-- Purpose: Create helper function to increment/decrement reactions_count

CREATE OR REPLACE FUNCTION increment_reactions_count(
  p_org_id UUID,
  p_tg_chat_id BIGINT,
  p_message_id BIGINT,
  p_delta INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update reactions_count for the original message
  UPDATE activity_events
  SET reactions_count = GREATEST(0, reactions_count + p_delta)
  WHERE org_id = p_org_id
    AND tg_chat_id = p_tg_chat_id
    AND message_id = p_message_id
    AND event_type = 'message';
    
  -- If no rows updated, log warning (message not found)
  IF NOT FOUND THEN
    RAISE NOTICE 'Message not found for reaction update: org=%, chat=%, msg=%', p_org_id, p_tg_chat_id, p_message_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION increment_reactions_count IS 'Increments or decrements reactions_count on a message';

GRANT EXECUTE ON FUNCTION increment_reactions_count(UUID, BIGINT, BIGINT, INT) TO authenticated;

DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 086 Complete: increment_reactions_count helper function created';
END $$;

