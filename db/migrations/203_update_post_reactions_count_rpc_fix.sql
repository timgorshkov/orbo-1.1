-- Fix RPC function to handle UUID channel_id correctly
DROP FUNCTION IF EXISTS public.update_post_reactions_count(BIGINT, BIGINT, INT);

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
  v_channel_uuid UUID;
  v_post_id UUID;
BEGIN
  -- Get channel UUID from tg_chat_id
  SELECT id INTO v_channel_uuid
  FROM public.telegram_channels
  WHERE tg_chat_id = p_channel_tg_id;
  
  IF v_channel_uuid IS NULL THEN
    RAISE NOTICE 'Channel not found for tg_chat_id: %', p_channel_tg_id;
    RETURN;
  END IF;
  
  -- Update post reactions count using UUID
  UPDATE public.channel_posts
  SET 
    reactions_count = p_reactions_count,
    updated_at = NOW()
  WHERE channel_id = v_channel_uuid
    AND tg_message_id = p_message_id
  RETURNING id INTO v_post_id;
  
  IF v_post_id IS NULL THEN
    RAISE NOTICE 'Post not found for channel_uuid: %, message_id: %', v_channel_uuid, p_message_id;
    RETURN;
  END IF;
  
  RAISE NOTICE 'Updated reactions_count to % for post_id: %', p_reactions_count, v_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_post_reactions_count(BIGINT, BIGINT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_post_reactions_count(BIGINT, BIGINT, INT) TO authenticated;

SELECT 'RPC function fixed successfully' AS status;
