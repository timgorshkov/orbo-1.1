-- Fix sync function with correct JOIN logic

DROP FUNCTION IF EXISTS public.sync_channel_subscribers_with_participants();

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
    FROM public.participants p,
         public.telegram_channels tc,
         public.org_telegram_channels otc
    WHERE cs.tg_user_id = p.tg_user_id
      AND cs.channel_id = tc.id
      AND otc.channel_id = tc.id
      AND p.org_id = otc.org_id
      AND cs.participant_id IS NULL
    RETURNING cs.id
  )
  SELECT COUNT(*) INTO v_synced_count FROM updated;
  
  RAISE NOTICE 'Synced % channel_subscribers with participants', v_synced_count;
  RETURN QUERY SELECT v_synced_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_channel_subscribers_with_participants() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_channel_subscribers_with_participants() TO authenticated;

-- Run sync
SELECT public.sync_channel_subscribers_with_participants();

SELECT 'Sync function fixed and executed successfully' AS status;
