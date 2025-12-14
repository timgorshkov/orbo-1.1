-- Migration 148: Optimize get_engagement_breakdown function
-- Date: 2025-12-14
-- Problem: N+1 subqueries causing 2.5s execution time
-- Solution: Pre-aggregate WhatsApp activity in CTE instead of correlated subqueries

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
SET search_path = public
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
  WITH 
  -- Pre-aggregate WhatsApp activity (no N+1 subqueries!)
  whatsapp_activity AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      MIN(ae.created_at) as first_activity,
      MAX(ae.created_at) as last_activity
    FROM activity_events ae
    WHERE ae.tg_chat_id = 0 
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.org_id = p_org_id
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Pre-aggregate Telegram messages
  telegram_activity AS (
    SELECT 
      pm.participant_id,
      MIN(pm.sent_at) as first_message,
      MAX(pm.sent_at) as last_message
    FROM participant_messages pm
    WHERE pm.org_id = p_org_id
    GROUP BY pm.participant_id
  ),
  -- Calculate real activity dates for each participant using JOINs
  participant_activity AS (
    SELECT 
      p.id,
      p.created_at,
      p.last_activity_at,
      p.activity_score,
      LEAST(ta.first_message, wa.first_activity) as first_message_at,
      GREATEST(ta.last_message, wa.last_activity) as last_message_at
    FROM participants p
    LEFT JOIN telegram_activity ta ON ta.participant_id = p.id
    LEFT JOIN whatsapp_activity wa ON wa.participant_id = p.id
    WHERE p.org_id = p_org_id
      AND p.merged_into IS NULL
  ),
  participants_enriched AS (
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
  )
  SELECT 
    c.category,
    COUNT(*)::BIGINT as count,
    ROUND((COUNT(*)::NUMERIC / v_total_participants) * 100, 1) as percentage
  FROM categorized c
  GROUP BY c.category
  ORDER BY 
    CASE c.category
      WHEN 'core' THEN 1
      WHEN 'experienced' THEN 2
      WHEN 'newcomers' THEN 3
      WHEN 'silent' THEN 4
      ELSE 5
    END;
END;
$$;

-- Add index on activity_events for WhatsApp participant queries
CREATE INDEX IF NOT EXISTS idx_activity_events_whatsapp_participant 
ON activity_events ((meta->>'participant_id'))
WHERE tg_chat_id = 0 AND event_type = 'message' AND meta->>'participant_id' IS NOT NULL;

-- Add index on participant_messages for aggregation
CREATE INDEX IF NOT EXISTS idx_participant_messages_org_participant 
ON participant_messages (org_id, participant_id);

DO $$ BEGIN 
  RAISE NOTICE 'Migration 148: Optimized get_engagement_breakdown - replaced N+1 subqueries with JOINs'; 
END $$;

