-- Migration 074: Implement Automatic Participant Scoring
-- ============================================================================
-- This migration implements automatic calculation of activity_score and risk_score
-- for participants, enabling Dashboard "Attention Zones" feature.
--
-- Background:
-- - Columns exist since migration 09, but were never populated
-- - Dashboard uses these scores to identify at-risk participants
-- - Similar to member_count triggers (migration 073)
--
-- Scoring Logic:
-- - activity_score: Higher = more active (messages, recency, consistency)
-- - risk_score: 0-100, Higher = higher risk of churn
--
-- Related Issue: TODO_PARTICIPANT_SCORING_TRIGGERS.md
-- ============================================================================

-- 1. Function: Calculate Activity Score
-- Returns a score based on recent activity, message count, and consistency
CREATE OR REPLACE FUNCTION calculate_activity_score(p_participant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_tg_user_id BIGINT;
  v_org_id UUID;
  v_message_count INTEGER;
  v_days_since_last_activity INTEGER;
  v_days_since_join INTEGER;
  v_reply_count INTEGER;
BEGIN
  -- Get participant info
  SELECT tg_user_id, org_id, 
         EXTRACT(DAY FROM NOW() - last_activity_at)::INTEGER,
         EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  INTO v_tg_user_id, v_org_id, v_days_since_last_activity, v_days_since_join
  FROM participants
  WHERE id = p_participant_id;
  
  -- If no telegram user or org, return 0
  IF v_tg_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Count messages in last 30 days
  SELECT COUNT(*) INTO v_message_count
  FROM activity_events
  WHERE org_id = v_org_id
    AND tg_user_id = v_tg_user_id
    AND event_type = 'message'
    AND created_at > NOW() - INTERVAL '30 days';
  
  -- Count replies (more valuable than regular messages)
  SELECT COUNT(*) INTO v_reply_count
  FROM activity_events
  WHERE org_id = v_org_id
    AND tg_user_id = v_tg_user_id
    AND event_type = 'message'
    AND reply_to_message_id IS NOT NULL
    AND created_at > NOW() - INTERVAL '30 days';
  
  -- Base score: messages weighted
  v_score := (v_message_count * 5) + (v_reply_count * 3); -- Replies worth more
  
  -- Recency bonus/penalty
  IF v_days_since_last_activity IS NULL THEN
    -- Never active
    v_score := 0;
  ELSIF v_days_since_last_activity <= 1 THEN
    -- Active today/yesterday - bonus
    v_score := v_score + 20;
  ELSIF v_days_since_last_activity <= 7 THEN
    -- Active this week - small bonus
    v_score := v_score + 10;
  ELSIF v_days_since_last_activity > 30 THEN
    -- Inactive 30+ days - heavy penalty
    v_score := GREATEST(v_score - 50, 0);
  ELSIF v_days_since_last_activity > 14 THEN
    -- Inactive 14+ days - penalty
    v_score := v_score - 20;
  END IF;
  
  -- Consistency bonus (messages per day since join)
  IF v_days_since_join > 0 AND v_message_count > 0 THEN
    -- Consistent activity gets bonus
    v_score := v_score + LEAST((v_message_count * 30 / v_days_since_join)::INTEGER, 30);
  END IF;
  
  -- Normalize: min 0, max 999
  RETURN GREATEST(LEAST(v_score, 999), 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_activity_score(UUID) IS 
  'Calculates activity score (0-999) based on messages, replies, recency, and consistency. Higher = more active.';

-- 2. Function: Calculate Risk Score
-- Returns 0-100 where higher = higher risk of churn
CREATE OR REPLACE FUNCTION calculate_risk_score(p_participant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_risk_score INTEGER := 0;
  v_days_since_last_activity INTEGER;
  v_activity_score INTEGER;
  v_message_count INTEGER;
  v_tg_user_id BIGINT;
  v_org_id UUID;
  v_days_since_join INTEGER;
BEGIN
  -- Get participant info
  SELECT tg_user_id, org_id, activity_score,
         EXTRACT(DAY FROM NOW() - last_activity_at)::INTEGER,
         EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  INTO v_tg_user_id, v_org_id, v_activity_score, v_days_since_last_activity, v_days_since_join
  FROM participants
  WHERE id = p_participant_id;
  
  -- If no data, low risk (new/unknown)
  IF v_tg_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN 20;
  END IF;
  
  -- Get total message count
  SELECT COUNT(*) INTO v_message_count
  FROM activity_events
  WHERE org_id = v_org_id
    AND tg_user_id = v_tg_user_id
    AND event_type = 'message';
  
  -- Calculate risk based on inactivity patterns
  IF v_days_since_last_activity IS NULL THEN
    -- Never active
    IF v_days_since_join > 7 THEN
      v_risk_score := 60; -- High risk - joined but never participated
    ELSE
      v_risk_score := 30; -- Medium risk - just joined, give them time
    END IF;
    
  ELSIF v_message_count > 10 AND v_days_since_last_activity > 30 THEN
    -- Was active (10+ messages) but silent 30+ days - HIGH CHURN RISK
    v_risk_score := 90 + LEAST(v_days_since_last_activity - 30, 10);
    
  ELSIF v_message_count > 5 AND v_days_since_last_activity > 21 THEN
    -- Was moderately active but silent 21+ days - HIGH RISK
    v_risk_score := 80;
    
  ELSIF v_message_count > 3 AND v_days_since_last_activity > 14 THEN
    -- Had some activity but silent 14+ days - MEDIUM-HIGH RISK
    v_risk_score := 65;
    
  ELSIF v_days_since_last_activity > 30 THEN
    -- Any participant silent 30+ days - MEDIUM RISK
    v_risk_score := 50;
    
  ELSIF v_days_since_last_activity > 14 THEN
    -- Silent 14+ days - MEDIUM RISK
    v_risk_score := 40;
    
  ELSIF v_days_since_last_activity > 7 THEN
    -- Silent 7+ days - LOW-MEDIUM RISK
    v_risk_score := 25;
    
  ELSIF v_days_since_last_activity > 3 THEN
    -- Silent 3+ days - LOW RISK
    v_risk_score := 15;
    
  ELSE
    -- Active recently - VERY LOW RISK
    v_risk_score := 5;
  END IF;
  
  -- Adjust based on activity score (high activity = lower risk)
  IF v_activity_score > 100 THEN
    v_risk_score := GREATEST(v_risk_score - 20, 5);
  ELSIF v_activity_score > 50 THEN
    v_risk_score := GREATEST(v_risk_score - 10, 5);
  END IF;
  
  -- Normalize: 0-100
  RETURN GREATEST(LEAST(v_risk_score, 100), 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_risk_score(UUID) IS 
  'Calculates churn risk score (0-100). Higher = higher risk. Considers inactivity duration and past activity level.';

-- 3. Trigger Function: Auto-update scores when activity changes
CREATE OR REPLACE FUNCTION update_participant_scores_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recalculate if last_activity_at changed or is new insert
  IF TG_OP = 'INSERT' OR OLD.last_activity_at IS DISTINCT FROM NEW.last_activity_at THEN
    -- Calculate both scores
    NEW.activity_score := calculate_activity_score(NEW.id);
    NEW.risk_score := calculate_risk_score(NEW.id);
    
    -- Log for debugging (only in development)
    -- RAISE DEBUG 'Updated scores for participant %: activity=%, risk=%', 
    --             NEW.id, NEW.activity_score, NEW.risk_score;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_participant_scores_trigger() IS 
  'Trigger function that automatically updates activity_score and risk_score when last_activity_at changes.';

-- 4. Create the trigger
DROP TRIGGER IF EXISTS trigger_update_participant_scores ON participants;

CREATE TRIGGER trigger_update_participant_scores
  BEFORE INSERT OR UPDATE OF last_activity_at ON participants
  FOR EACH ROW
  EXECUTE FUNCTION update_participant_scores_trigger();

COMMENT ON TRIGGER trigger_update_participant_scores ON participants IS 
  'Automatically recalculates activity_score and risk_score when participant activity changes.';

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION calculate_activity_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_activity_score(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_risk_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_risk_score(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_participant_scores_trigger() TO authenticated;
GRANT EXECUTE ON FUNCTION update_participant_scores_trigger() TO service_role;

-- 6. Recalculate scores for all existing participants with activity
DO $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_updated_count INTEGER;
BEGIN
  v_start_time := clock_timestamp();
  
  RAISE NOTICE 'Starting bulk recalculation of participant scores...';
  
  UPDATE participants p
  SET 
    activity_score = calculate_activity_score(p.id),
    risk_score = calculate_risk_score(p.id)
  WHERE p.tg_user_id IS NOT NULL; -- Only participants with Telegram accounts
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  v_end_time := clock_timestamp();
  
  RAISE NOTICE 'Recalculated scores for % participants in %ms', 
               v_updated_count,
               EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER;
END
$$;

-- 7. Verify results
DO $$
DECLARE
  v_with_scores INTEGER;
  v_high_activity INTEGER;
  v_high_risk INTEGER;
BEGIN
  -- Count participants with scores
  SELECT COUNT(*) INTO v_with_scores
  FROM participants
  WHERE activity_score > 0 OR risk_score > 0;
  
  -- Count high activity participants
  SELECT COUNT(*) INTO v_high_activity
  FROM participants
  WHERE activity_score > 50;
  
  -- Count high risk participants
  SELECT COUNT(*) INTO v_high_risk
  FROM participants
  WHERE risk_score > 70;
  
  RAISE NOTICE '=== Scoring System Verification ===';
  RAISE NOTICE 'Participants with scores: %', v_with_scores;
  RAISE NOTICE 'High activity (score > 50): %', v_high_activity;
  RAISE NOTICE 'High risk (score > 70): %', v_high_risk;
  RAISE NOTICE '===================================';
END
$$;

