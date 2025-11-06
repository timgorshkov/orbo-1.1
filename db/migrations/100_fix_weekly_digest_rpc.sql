-- Migration 100: Fix Weekly Digest Data RPC
-- Date: Nov 6, 2025
-- Purpose: Fix column names in generate_weekly_digest_data function

CREATE OR REPLACE FUNCTION public.generate_weekly_digest_data(
  p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_key_metrics JSONB;
  v_attention_zones JSONB;
  v_upcoming_events JSONB;
  v_message_count INT;
BEGIN
  -- ==================================================
  -- BLOCK A: KEY METRICS (Week vs Previous Week)
  -- ==================================================
  WITH current_week AS (
    SELECT
      COUNT(DISTINCT ae.tg_user_id) as active_participants,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COUNT(*) FILTER (WHERE ae.reply_to_message_id IS NOT NULL) as replies,
      SUM(ae.reactions_count) as reactions
    FROM activity_events ae
    JOIN org_telegram_groups otg ON otg.tg_chat_id = ae.tg_chat_id
    WHERE otg.org_id = p_org_id
      AND ae.created_at >= NOW() - INTERVAL '7 days'
  ),
  previous_week AS (
    SELECT
      COUNT(DISTINCT ae.tg_user_id) as active_participants,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COUNT(*) FILTER (WHERE ae.reply_to_message_id IS NOT NULL) as replies,
      SUM(ae.reactions_count) as reactions
    FROM activity_events ae
    JOIN org_telegram_groups otg ON otg.tg_chat_id = ae.tg_chat_id
    WHERE otg.org_id = p_org_id
      AND ae.created_at >= NOW() - INTERVAL '14 days'
      AND ae.created_at < NOW() - INTERVAL '7 days'
  )
  SELECT jsonb_build_object(
    'current', jsonb_build_object(
      'active_participants', COALESCE(cw.active_participants, 0),
      'messages', COALESCE(cw.messages, 0),
      'replies', COALESCE(cw.replies, 0),
      'reactions', COALESCE(cw.reactions, 0)
    ),
    'previous', jsonb_build_object(
      'active_participants', COALESCE(pw.active_participants, 0),
      'messages', COALESCE(pw.messages, 0),
      'replies', COALESCE(pw.replies, 0),
      'reactions', COALESCE(pw.reactions, 0)
    )
  ) INTO v_key_metrics
  FROM current_week cw, previous_week pw;

  -- Get message count for AI decision
  SELECT COALESCE(v_key_metrics->'current'->>'messages', '0')::INT INTO v_message_count;

  -- ==================================================
  -- BLOCK B: ATTENTION ZONES
  -- ==================================================
  WITH inactive_newcomers AS (
    SELECT COUNT(*) as count
    FROM participants p
    WHERE p.org_id = p_org_id
      AND p.created_at >= NOW() - INTERVAL '7 days'
      AND (p.last_activity_at IS NULL OR p.last_activity_at < NOW() - INTERVAL '3 days')
  ),
  silent_members AS (
    SELECT COUNT(*) as count
    FROM participants p
    WHERE p.org_id = p_org_id
      AND p.last_activity_at < NOW() - INTERVAL '14 days'
      AND p.participant_status = 'participant'
  )
  SELECT jsonb_build_object(
    'inactive_newcomers', COALESCE(inn.count, 0),
    'silent_members', COALESCE(sm.count, 0)
  ) INTO v_attention_zones
  FROM inactive_newcomers inn, silent_members sm;

  -- ==================================================
  -- BLOCK E: UPCOMING EVENTS (Next 7 Days)
  -- ==================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'start_time', (e.event_date + e.start_time)::timestamptz,
      'location', e.location_info,
      'registration_count', COALESCE(reg_counts.count, 0)
    )
    ORDER BY e.event_date, e.start_time ASC
  ) INTO v_upcoming_events
  FROM events e
  LEFT JOIN (
    SELECT event_id, COUNT(*) as count
    FROM event_registrations
    WHERE status = 'registered'
    GROUP BY event_id
  ) reg_counts ON reg_counts.event_id = e.id
  WHERE e.org_id = p_org_id
    AND (e.event_date + e.start_time)::timestamptz >= NOW()
    AND (e.event_date + e.start_time)::timestamptz <= NOW() + INTERVAL '7 days'
    AND e.status = 'published';

  -- If no events, return empty array
  IF v_upcoming_events IS NULL THEN
    v_upcoming_events := '[]'::jsonb;
  END IF;

  -- ==================================================
  -- RESULT
  -- ==================================================
  v_result := jsonb_build_object(
    'org_id', p_org_id,
    'generated_at', NOW(),
    'key_metrics', v_key_metrics,
    'attention_zones', v_attention_zones,
    'upcoming_events', v_upcoming_events,
    'message_count', v_message_count,
    'ai_analysis_eligible', v_message_count >= 20
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_weekly_digest_data(UUID) TO authenticated;

COMMENT ON FUNCTION public.generate_weekly_digest_data IS 'Collects data for AI Weekly Digest: key metrics, attention zones, upcoming events. Returns eligibility for AI analysis (requires ≥20 messages).';

DO $$ BEGIN RAISE NOTICE 'Migration 100 Complete: Fixed generate_weekly_digest_data RPC (location_info, event_date+start_time, registration count).'; END $$;

