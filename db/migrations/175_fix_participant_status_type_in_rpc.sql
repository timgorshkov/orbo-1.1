-- Migration 175: Fix participant_status type mismatch in get_enriched_participants
-- The participant_status column is an ENUM but RPC returns TEXT - need to cast it

CREATE OR REPLACE FUNCTION get_enriched_participants(
  p_org_id UUID,
  p_include_tags BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  user_id UUID,
  full_name TEXT,
  username TEXT,
  email TEXT,
  phone TEXT,
  bio TEXT,
  photo_url TEXT,
  tg_user_id BIGINT,
  tg_first_name TEXT,
  tg_last_name TEXT,
  participant_status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  enriched_at TIMESTAMPTZ,
  interests TEXT[],
  links JSONB,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count BIGINT,
  is_org_owner BOOLEAN,
  is_org_admin BOOLEAN,
  is_group_creator BOOLEAN,
  is_group_admin BOOLEAN,
  custom_title TEXT,
  tags JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Get org memberships (owner/admin)
  org_roles AS (
    SELECT m.user_id, m.role
    FROM memberships m
    WHERE m.org_id = p_org_id AND m.role IN ('owner', 'admin')
  ),
  
  -- Get telegram groups for this org
  org_groups AS (
    SELECT otg.tg_chat_id
    FROM org_telegram_groups otg
    WHERE otg.org_id = p_org_id
  ),
  
  -- Get telegram admins for org groups
  tg_admins AS (
    SELECT DISTINCT ON (tga.tg_user_id)
      tga.tg_user_id,
      tga.is_owner,
      tga.is_admin,
      tga.custom_title
    FROM telegram_group_admins tga
    WHERE tga.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND tga.expires_at > NOW()
    ORDER BY tga.tg_user_id, tga.is_owner DESC, tga.is_admin DESC
  ),
  
  -- Get message stats per participant (using aggregates, NOT loading all messages)
  msg_stats AS (
    SELECT 
      pm.participant_id,
      MIN(pm.sent_at) as first_msg,
      MAX(pm.sent_at) as last_msg,
      COUNT(*) as msg_count
    FROM participant_messages pm
    WHERE pm.participant_id IN (
      SELECT p.id FROM participants p 
      WHERE p.org_id = p_org_id AND p.merged_into IS NULL
    )
    GROUP BY pm.participant_id
  ),
  
  -- Get WhatsApp stats
  wa_stats AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      MIN(ae.created_at) as first_msg,
      MAX(ae.created_at) as last_msg,
      COUNT(*) as msg_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id 
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
    GROUP BY ae.meta->>'participant_id'
  ),
  
  -- Combine message stats
  combined_stats AS (
    SELECT 
      COALESCE(ms.participant_id, ws.participant_id) as participant_id,
      LEAST(ms.first_msg, ws.first_msg) as first_msg,
      GREATEST(ms.last_msg, ws.last_msg) as last_msg,
      COALESCE(ms.msg_count, 0) + COALESCE(ws.msg_count, 0) as msg_count
    FROM msg_stats ms
    FULL OUTER JOIN wa_stats ws ON ms.participant_id = ws.participant_id
  ),
  
  -- Get tags if requested
  participant_tags_agg AS (
    SELECT 
      pta.participant_id,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', pt.id,
          'name', pt.name,
          'color', pt.color
        )
      ) as tags
    FROM participant_tag_assignments pta
    JOIN participant_tags pt ON pt.id = pta.tag_id
    WHERE p_include_tags
      AND pta.participant_id IN (
        SELECT p.id FROM participants p 
        WHERE p.org_id = p_org_id AND p.merged_into IS NULL
      )
    GROUP BY pta.participant_id
  )
  
  SELECT 
    p.id,
    p.org_id,
    p.user_id,
    p.full_name,
    p.username,
    p.email,
    p.phone,
    p.bio,
    p.photo_url,
    p.tg_user_id,
    p.tg_first_name,
    p.tg_last_name,
    -- Cast ENUM to TEXT to match function return type
    p.participant_status::TEXT as participant_status,
    p.created_at,
    p.updated_at,
    p.last_activity_at,
    -- Get enriched_at from custom_attributes JSON field
    (p.custom_attributes->>'last_enriched_at')::TIMESTAMPTZ as enriched_at,
    -- Use COALESCE for interests in case it's NULL
    COALESCE(p.interests, '{}'::TEXT[]) as interests,
    -- links column doesn't exist - return NULL
    NULL::JSONB as links,
    cs.first_msg as first_message_at,
    cs.last_msg as last_message_at,
    COALESCE(cs.msg_count, 0) as message_count,
    (r.role = 'owner') as is_org_owner,
    (r.role = 'admin') as is_org_admin,
    COALESCE(ta.is_owner, false) as is_group_creator,
    COALESCE(ta.is_admin, false) as is_group_admin,
    ta.custom_title,
    COALESCE(pt.tags, '[]'::JSONB) as tags
  FROM participants p
  LEFT JOIN org_roles r ON r.user_id = p.user_id
  LEFT JOIN tg_admins ta ON ta.tg_user_id = p.tg_user_id
  LEFT JOIN combined_stats cs ON cs.participant_id = p.id
  LEFT JOIN participant_tags_agg pt ON pt.participant_id = p.id
  WHERE p.org_id = p_org_id
    AND p.participant_status != 'excluded'
    AND p.merged_into IS NULL
  ORDER BY p.full_name NULLS LAST;
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION get_enriched_participants(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_enriched_participants(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION get_enriched_participants IS 'Returns enriched participant data for an organization with message stats, tags, and roles. Fixed: participant_status ENUM cast to TEXT.';

