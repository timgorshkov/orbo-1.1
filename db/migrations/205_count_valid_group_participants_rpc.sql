-- Migration 205: Create RPC function to count valid group participants
-- This function properly counts participants in a group, filtering out:
-- - Bots (source = 'bot')
-- - Archived/excluded participants (participant_status = 'excluded')
-- - Merged participants (merged_into IS NOT NULL)
-- - Inactive group memberships (is_active = false)

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
      AND p.participant_status != 'excluded';
    
    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.count_valid_group_participants(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_valid_group_participants(BIGINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_valid_group_participants(BIGINT, UUID) TO anon;

COMMENT ON FUNCTION public.count_valid_group_participants IS 
'Counts valid participants in a Telegram group, excluding bots, archived, and merged participants';
