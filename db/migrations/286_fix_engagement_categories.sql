-- Migration 286: Fix engagement categories — add observer, use group_joined_at
-- Date: 2026-04-20
-- Purpose:
--   1. Переименовать 'other' → 'observers' (наблюдатели — присутствуют, но score <30)
--   2. Учесть participant_groups.joined_at в real_join_date (приоритет перед created_at)
--   3. Убедиться что newcomers без активности НЕ попадают в silent
--      (фикс фронтенда сделан отдельно; SQL RPC уже был правильным, но для
--      единообразия обновляем real_join_date и категорию 'observers')

CREATE OR REPLACE FUNCTION public.get_engagement_breakdown(p_org_id uuid)
RETURNS TABLE(category text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_participants BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total_participants
  FROM participants p
  WHERE p.org_id = p_org_id
    AND p.merged_into IS NULL
    AND p.participant_status != 'excluded';

  IF v_total_participants = 0 THEN
    v_total_participants := 1;
  END IF;

  RETURN QUERY
  WITH
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
  telegram_activity AS (
    SELECT
      pm.participant_id,
      MIN(pm.sent_at) as first_message,
      MAX(pm.sent_at) as last_message
    FROM participant_messages pm
    WHERE pm.org_id = p_org_id
    GROUP BY pm.participant_id
  ),
  -- Earliest group join date per participant
  group_join_dates AS (
    SELECT
      pg.participant_id,
      MIN(pg.joined_at) as earliest_group_joined
    FROM participant_groups pg
    WHERE pg.participant_id IN (
      SELECT id FROM participants WHERE org_id = p_org_id AND merged_into IS NULL
    )
    GROUP BY pg.participant_id
  ),
  participant_activity AS (
    SELECT
      p.id,
      p.created_at,
      p.last_activity_at,
      p.activity_score,
      LEAST(ta.first_message, wa.first_activity) as first_message_at,
      GREATEST(ta.last_message, wa.last_activity) as last_message_at,
      gj.earliest_group_joined
    FROM participants p
    LEFT JOIN telegram_activity ta ON ta.participant_id = p.id
    LEFT JOIN whatsapp_activity wa ON wa.participant_id = p.id
    LEFT JOIN group_join_dates gj ON gj.participant_id = p.id
    WHERE p.org_id = p_org_id
      AND p.merged_into IS NULL
      AND p.participant_status != 'excluded'
  ),
  participants_enriched AS (
    SELECT
      id,
      created_at,
      last_activity_at,
      activity_score,
      first_message_at,
      last_message_at,
      -- real_join_date: приоритет group_joined_at > first_message_at > created_at
      LEAST(
        COALESCE(earliest_group_joined, created_at),
        COALESCE(first_message_at, created_at),
        created_at
      ) as real_join_date,
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
        -- Silent: БЫЛА активность и >30 дней; ИЛИ НИКОГДА не было и joined >7 дней
        WHEN real_last_activity IS NULL AND real_join_date < NOW() - INTERVAL '7 days'
          THEN 'silent'
        WHEN real_last_activity IS NOT NULL AND real_last_activity < NOW() - INTERVAL '30 days'
          THEN 'silent'

        -- Newcomers: joined <30 дней
        WHEN real_join_date >= NOW() - INTERVAL '30 days'
          THEN 'newcomers'

        -- Core: score >= 60
        WHEN COALESCE(activity_score, 0) >= 60
          THEN 'core'

        -- Experienced: score >= 30
        WHEN COALESCE(activity_score, 0) >= 30
          THEN 'experienced'

        -- Observers: присутствуют, но score <30 (бывшие «other»)
        ELSE 'observers'
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
      WHEN 'observers' THEN 4
      WHEN 'silent' THEN 5
      ELSE 6
    END;
END;
$function$;

DO $$ BEGIN RAISE NOTICE 'Migration 286 complete: engagement categories updated (other → observers, group_joined_at added).'; END $$;
