-- Fix merge_participants function: activity_events.participant_id was dropped in migration 071
-- The function still references it, causing "column participant_id does not exist" errors

CREATE OR REPLACE FUNCTION public.merge_participants(
  p_target uuid,
  p_duplicates uuid[],
  p_actor uuid default null
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF array_length(p_duplicates, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Move participant_groups to target (avoid duplicates)
  UPDATE public.participant_groups
  SET participant_id = p_target
  WHERE participant_id = any(p_duplicates)
    AND NOT EXISTS (
      SELECT 1
      FROM public.participant_groups pg2
      WHERE pg2.participant_id = p_target
        AND pg2.tg_group_id = public.participant_groups.tg_group_id
    );

  -- Move traits to target (avoid duplicates)
  UPDATE public.participant_traits pt
  SET participant_id = p_target,
      updated_at = now(),
      updated_by = p_actor
  WHERE participant_id = any(p_duplicates)
    AND NOT EXISTS (
      SELECT 1
      FROM public.participant_traits existing
      WHERE existing.participant_id = p_target
        AND existing.trait_key = pt.trait_key
        AND existing.trait_value = pt.trait_value
    );

  DELETE FROM public.participant_traits pt
  WHERE participant_id = any(p_duplicates);

  -- NOTE: activity_events.participant_id was dropped in migration 071.
  -- Activity is linked via tg_user_id / max_user_id, not participant_id.

  -- Copy max_user_id from duplicate to target if target doesn't have one
  UPDATE public.participants target
  SET max_user_id = (
    SELECT d.max_user_id FROM public.participants d
    WHERE d.id = any(p_duplicates) AND d.max_user_id IS NOT NULL
    LIMIT 1
  )
  WHERE target.id = p_target
    AND target.max_user_id IS NULL;

  -- Copy max_username from duplicate to target if target doesn't have one
  UPDATE public.participants target
  SET max_username = (
    SELECT d.max_username FROM public.participants d
    WHERE d.id = any(p_duplicates) AND d.max_username IS NOT NULL
    LIMIT 1
  )
  WHERE target.id = p_target
    AND target.max_username IS NULL;

  -- Mark duplicates as merged
  UPDATE public.participants
  SET merged_into = p_target,
      last_activity_at = greatest(public.participants.last_activity_at, now())
  WHERE id = any(p_duplicates);
END;
$$;
