-- Migration 204: Channel Subscribers Enhancements
-- Add participant_id link and source tracking

-- 1. Add participant_id to channel_subscribers for direct link
ALTER TABLE public.channel_subscribers 
ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE;

-- 2. Add source column to track where subscriber came from
ALTER TABLE public.channel_subscribers
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown';

-- 3. Add constraint for source values
ALTER TABLE public.channel_subscribers
DROP CONSTRAINT IF EXISTS channel_subscribers_source_check;

ALTER TABLE public.channel_subscribers
ADD CONSTRAINT channel_subscribers_source_check
CHECK (source IN ('discussion_group_import', 'comment', 'reaction', 'deep_link', 'manual', 'unknown'));

-- 4. Create index for participant_id lookups
CREATE INDEX IF NOT EXISTS idx_channel_subscribers_participant 
ON public.channel_subscribers(participant_id);

-- 5. Create index for tg_user_id lookups
CREATE INDEX IF NOT EXISTS idx_channel_subscribers_user 
ON public.channel_subscribers(tg_user_id);

-- 6. Function to sync channel_subscribers with participants
CREATE OR REPLACE FUNCTION public.sync_channel_subscribers_with_participants()
RETURNS TABLE(synced_count BIGINT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_synced_count BIGINT;
BEGIN
  -- Update channel_subscribers with participant_id
  WITH updated AS (
    UPDATE public.channel_subscribers cs
    SET participant_id = p.id
    FROM public.participants p
    JOIN public.org_telegram_channels otc ON otc.channel_id = cs.channel_id
    WHERE cs.tg_user_id = p.tg_user_id
      AND p.org_id = otc.org_id
      AND cs.participant_id IS NULL
    RETURNING cs.id
  )
  SELECT COUNT(*) INTO v_synced_count FROM updated;
  
  RAISE NOTICE 'Synced % channel_subscribers with participants', v_synced_count;
  RETURN QUERY SELECT v_synced_count;
END;
$$;

-- 7. Function to create/update channel subscriber from comment
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
    subscribed_at
  ) VALUES (
    v_channel_uuid,
    p_tg_user_id,
    p_username,
    p_first_name,
    p_last_name,
    1, -- Initial comment
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

-- 8. Grant permissions
GRANT EXECUTE ON FUNCTION public.sync_channel_subscribers_with_participants() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_channel_subscribers_with_participants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_channel_subscriber_from_comment(BIGINT, BIGINT, TEXT, TEXT, TEXT) TO service_role;

-- 9. Run initial sync for existing data
SELECT public.sync_channel_subscribers_with_participants();

COMMENT ON COLUMN public.channel_subscribers.participant_id IS 'Direct link to participant record in participants table';
COMMENT ON COLUMN public.channel_subscribers.source IS 'How the subscriber was discovered: discussion_group_import, comment, reaction, deep_link, manual';
COMMENT ON FUNCTION public.sync_channel_subscribers_with_participants IS 'Syncs channel_subscribers.participant_id with participants table based on tg_user_id';
COMMENT ON FUNCTION public.upsert_channel_subscriber_from_comment IS 'Creates or updates channel subscriber when they comment in discussion group';

SELECT 'Migration 204 completed successfully' AS status;
