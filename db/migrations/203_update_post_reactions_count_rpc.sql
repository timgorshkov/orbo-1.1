-- Migration: Add RPC function to update post reactions count
-- Description: Update reactions_count for channel posts based on Telegram's message_reaction_count webhook

CREATE OR REPLACE FUNCTION public.update_post_reactions_count(
  p_channel_tg_id BIGINT,
  p_message_id BIGINT,
  p_reactions_count INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id UUID;
  v_post_id BIGINT;
BEGIN
  -- Get channel UUID from tg_chat_id
  SELECT id INTO v_channel_id
  FROM public.telegram_channels
  WHERE tg_chat_id = p_channel_tg_id;
  
  IF v_channel_id IS NULL THEN
    RAISE NOTICE 'Channel not found for tg_chat_id: %', p_channel_tg_id;
    RETURN;
  END IF;
  
  -- Update post reactions count
  UPDATE public.channel_posts
  SET 
    reactions_count = p_reactions_count,
    updated_at = NOW()
  WHERE channel_id = v_channel_id
    AND tg_message_id = p_message_id
  RETURNING id INTO v_post_id;
  
  IF v_post_id IS NULL THEN
    RAISE NOTICE 'Post not found for channel_id: %, message_id: %', v_channel_id, p_message_id;
    RETURN;
  END IF;
  
  RAISE NOTICE 'Updated reactions_count to % for post_id: %', p_reactions_count, v_post_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_post_reactions_count(BIGINT, BIGINT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_post_reactions_count(BIGINT, BIGINT, INT) TO authenticated;

COMMENT ON FUNCTION public.update_post_reactions_count IS 'Updates reactions_count for channel posts based on Telegram message_reaction_count webhook';
