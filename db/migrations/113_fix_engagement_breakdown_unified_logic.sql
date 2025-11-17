-- ============================================================================
-- Fix get_engagement_breakdown to use unified logic with frontend
-- Version: 113
-- ============================================================================

-- This migration aligns the SQL engagement breakdown logic with the TypeScript
-- getParticipantCategory function used in members-view and filters.
--
-- KEY CHANGES:
-- 1. Use participants.activity_score instead of weekly message counts
-- 2. Use participant_messages to calculate real_join_date and real_last_activity
-- 3. Apply same priority rules: Silent > Newcomer > Core > Experienced

-- Drop existing function
DROP FUNCTION IF EXISTS get_engagement_breakdown(UUID);

-- Recreate with unified logic
CREATE OR REPLACE FUNCTION get_engagement_breakdown(
  p_org_id UUID
)
RETURNS TABLE (
  category TEXT,
  count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_participants BIGINT;
BEGIN
  -- Get total participants in this org
  SELECT COUNT(*) INTO v_total_participants
  FROM participants p
  WHERE p.org_id = p_org_id
    AND p.merged_into IS NULL;
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH participant_activity AS (
    -- Calculate real_join_date and real_last_activity for each participant
    SELECT 
      p.id,
      p.created_at,
      p.last_activity_at,
      p.activity_score,
      MIN(pm.sent_at) as first_message_at,
      MAX(pm.sent_at) as last_message_at
    FROM participants p
    LEFT JOIN participant_messages pm ON pm.participant_id = p.id
    WHERE p.org_id = p_org_id
      AND p.merged_into IS NULL
    GROUP BY p.id, p.created_at, p.last_activity_at, p.activity_score
  ),
  participants_enriched AS (
    -- Add real_join_date and real_last_activity
    SELECT 
      id,
      created_at,
      last_activity_at,
      activity_score,
      first_message_at,
      last_message_at,
      -- real_join_date: earliest of first_message_at or created_at
      CASE 
        WHEN first_message_at IS NOT NULL AND first_message_at < created_at 
          THEN first_message_at
        ELSE created_at
      END as real_join_date,
      -- real_last_activity: latest of last_message_at or last_activity_at
      CASE
        WHEN last_message_at IS NOT NULL AND (last_activity_at IS NULL OR last_message_at > last_activity_at)
          THEN last_message_at
        ELSE last_activity_at
      END as real_last_activity
    FROM participant_activity
  ),
  categorized AS (
    SELECT 
      CASE
        -- Priority 1: Silent (no activity in 30 days OR never active and joined >7 days ago)
        WHEN real_last_activity IS NULL AND real_join_date < NOW() - INTERVAL '7 days'
          THEN 'silent'
        WHEN real_last_activity IS NOT NULL AND real_last_activity < NOW() - INTERVAL '30 days'
          THEN 'silent'
        
        -- Priority 2: Newcomers (joined <30 days ago AND not silent)
        WHEN real_join_date >= NOW() - INTERVAL '30 days'
          THEN 'newcomers'
        
        -- Priority 3: Core (activity_score >= 60)
        WHEN COALESCE(activity_score, 0) >= 60
          THEN 'core'
        
        -- Priority 4: Experienced (activity_score >= 30)
        WHEN COALESCE(activity_score, 0) >= 30
          THEN 'experienced'
        
        -- Default: other (doesn't fit any category)
        ELSE 'other'
      END as category
    FROM participants_enriched
  ),
  category_counts AS (
    SELECT 
      c.category,
      COUNT(*)::BIGINT as count,
      ROUND((COUNT(*) * 100.0 / v_total_participants), 1) as percentage
    FROM categorized c
    GROUP BY c.category
  ),
  all_categories AS (
    SELECT unnest(ARRAY['core', 'experienced', 'newcomers', 'silent', 'other']) as category
  )
  SELECT 
    ac.category,
    COALESCE(cc.count, 0)::BIGINT as count,
    COALESCE(cc.percentage, 0.0) as percentage
  FROM all_categories ac
  LEFT JOIN category_counts cc ON cc.category = ac.category
  WHERE ac.category != 'other' OR COALESCE(cc.count, 0) > 0
  ORDER BY 
    CASE ac.category
      WHEN 'core' THEN 1
      WHEN 'experienced' THEN 2
      WHEN 'newcomers' THEN 3
      WHEN 'silent' THEN 4
      WHEN 'other' THEN 5
      ELSE 6
    END;
END;
$$;

COMMENT ON FUNCTION get_engagement_breakdown IS 
'Returns engagement breakdown using unified logic:
- Silent: no activity >30d OR never active & joined >7d
- Newcomers: joined <30d (and not silent)
- Core: activity_score >= 60
- Experienced: activity_score >= 30
Uses participant_messages to calculate real activity dates.';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_engagement_breakdown(UUID) TO authenticated;

-- Refresh materialized view if exists (for future optimization)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS analytics_engagement_cache;

