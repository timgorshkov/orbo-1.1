-- Migration 205 fix: Add system accounts filtering

-- Drop and recreate with system account filtering
CREATE OR REPLACE FUNCTION public.count_valid_group_participants(
    p_tg_group_id BIGINT,
    p_org_id UUID
)
RETURNS BIGINT AS $$
DECLARE
    v_count BIGINT;
BEGIN
    SELECT COUNT(DISTINCT p.id)
    INTO v_count
    FROM public.participant_groups pg
    INNER JOIN public.participants p ON p.id = pg.participant_id
    WHERE pg.tg_group_id = p_tg_group_id
      AND pg.is_active = true
      AND p.org_id = p_org_id
      AND p.source != 'bot'
      AND p.merged_into IS NULL
      AND p.participant_status != 'excluded'
      -- Filter out system Telegram accounts
      AND (p.tg_user_id IS NULL OR p.tg_user_id NOT IN (
          777000,      -- Telegram Service Notifications
          136817688,   -- @Channel_Bot
          1087968824   -- Group Anonymous Bot
      ));
    
    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.count_valid_group_participants IS 
'Counts valid participants in a Telegram group, excluding bots, archived, merged, and system accounts';
