-- Fix upsert_channel_subscriber_from_comment function
-- Remove subscribed_at column and fix escaping

DROP FUNCTION IF EXISTS public.upsert_channel_subscriber_from_comment(BIGINT, BIGINT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_channel_subscriber_from_comment(
  p_channel_tg_id BIGINT,
  p_tg_user_id BIGINT,
  p_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_uuid UUID;
  v_subscriber_id UUID;
BEGIN
  -- Get channel UUID
  SELECT id INTO v_channel_uuid
  FROM public.telegram_channels
  WHERE tg_chat_id = p_channel_tg_id;
  
  IF v_channel_uuid IS NULL THEN
    RAISE EXCEPTION 'Channel not found: %', p_channel_tg_id;
  END IF;
  
  -- Upsert channel_subscriber
  INSERT INTO public.channel_subscribers (
    channel_id,
    tg_user_id,
    username,
    first_name,
    last_name,
    comments_count,
    source,
    last_activity_at,
    first_seen_at
  ) VALUES (
    v_channel_uuid,
    p_tg_user_id,
    p_username,
    p_first_name,
    p_last_name,
    1,
    'comment',
    NOW(),
    NOW()
  )
  ON CONFLICT (channel_id, tg_user_id) 
  DO UPDATE SET
    comments_count = channel_subscribers.comments_count + 1,
    last_activity_at = NOW(),
    username = COALESCE(EXCLUDED.username, channel_subscribers.username),
    first_name = COALESCE(EXCLUDED.first_name, channel_subscribers.first_name),
    last_name = COALESCE(EXCLUDED.last_name, channel_subscribers.last_name)
  RETURNING id INTO v_subscriber_id;
  
  RETURN v_subscriber_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_channel_subscriber_from_comment(BIGINT, BIGINT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.upsert_channel_subscriber_from_comment IS 'Creates or updates channel subscriber when they comment in discussion group';

SELECT 'Function fixed successfully' AS status;
