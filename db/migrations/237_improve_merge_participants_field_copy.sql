-- Migration 237: Improve merge_participants to copy all important messenger fields.
--
-- Problems fixed:
--  1. Old version only copied max_user_id/max_username with "IS NULL" guard,
--     so if the target already had those fields set (e.g. from a previous partial
--     merge that was rolled back), the copy would silently be skipped.
--  2. Important fields like tg_user_id, username, photo_url, bio were never
--     copied at all, causing the merged profile to lose messenger context.
--  3. Operation order bug: target was updated with max_user_id/tg_user_id BEFORE
--     duplicates were marked as merged, causing a unique constraint violation on
--     participants_org_max_user_key / participants_org_tg_user_key (both partial
--     WHERE merged_into IS NULL). Fixed by marking duplicates merged first.
--
-- This version uses COALESCE: for each field, keep the target value if it is
-- already non-null, otherwise take it from the best (first non-null) duplicate.
--
-- NOTE: the column is "username" (not "tg_username") in the participants table.

CREATE OR REPLACE FUNCTION public.merge_participants(
  p_target uuid,
  p_duplicates uuid[],
  p_actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tg_user_id        bigint;
  v_username          text;
  v_photo_url         text;
  v_bio               text;
  v_max_user_id       bigint;
  v_max_username      text;
  v_tg_first_name     text;
  v_tg_last_name      text;
BEGIN
  IF array_length(p_duplicates, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Move participant_groups to target (avoid duplicates by tg_group_id)
  UPDATE public.participant_groups
  SET participant_id = p_target
  WHERE participant_id = ANY(p_duplicates)
    AND NOT EXISTS (
      SELECT 1
      FROM public.participant_groups pg2
      WHERE pg2.participant_id = p_target
        AND pg2.tg_group_id = public.participant_groups.tg_group_id
    );

  -- Move traits to target (avoid duplicate key+value pairs)
  UPDATE public.participant_traits pt
  SET participant_id = p_target,
      updated_at    = NOW(),
      updated_by    = p_actor
  WHERE participant_id = ANY(p_duplicates)
    AND NOT EXISTS (
      SELECT 1
      FROM public.participant_traits existing
      WHERE existing.participant_id = p_target
        AND existing.trait_key   = pt.trait_key
        AND existing.trait_value = pt.trait_value
    );

  -- Delete any remaining traits on duplicates (keys already present on target)
  DELETE FROM public.participant_traits pt
  WHERE participant_id = ANY(p_duplicates);

  -- NOTE: activity_events.participant_id was dropped in migration 071.
  -- Activity is linked via tg_user_id / max_user_id, not participant_id.

  -- ─── Collect best (first non-null) values from duplicates ─────────────────

  SELECT
    MAX(d.tg_user_id)    -- tg_user_id is a bigint unique per person; MAX picks any non-null
  INTO v_tg_user_id
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.tg_user_id IS NOT NULL;

  SELECT d.username INTO v_username
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.username IS NOT NULL
  LIMIT 1;

  SELECT d.photo_url INTO v_photo_url
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.photo_url IS NOT NULL
  LIMIT 1;

  SELECT d.bio INTO v_bio
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.bio IS NOT NULL
  LIMIT 1;

  SELECT MAX(d.max_user_id) INTO v_max_user_id
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.max_user_id IS NOT NULL;

  SELECT d.max_username INTO v_max_username
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.max_username IS NOT NULL
  LIMIT 1;

  SELECT d.tg_first_name INTO v_tg_first_name
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.tg_first_name IS NOT NULL
  LIMIT 1;

  SELECT d.tg_last_name INTO v_tg_last_name
  FROM public.participants d
  WHERE d.id = ANY(p_duplicates) AND d.tg_last_name IS NOT NULL
  LIMIT 1;

  -- ─── Mark duplicates as merged ────────────────────────────────────────────
  -- IMPORTANT: must happen BEFORE applying values to target.
  -- participants_org_max_user_key and participants_org_tg_user_key are partial
  -- unique indexes (WHERE merged_into IS NULL). Setting merged_into here removes
  -- duplicates from those indexes, so the subsequent UPDATE on the target can
  -- safely set the same max_user_id / tg_user_id without a constraint violation.

  UPDATE public.participants
  SET
    merged_into      = p_target,
    last_activity_at = GREATEST(last_activity_at, NOW()),
    updated_at       = NOW()
  WHERE id = ANY(p_duplicates);

  -- ─── Apply to target (COALESCE: keep target value if already set) ──────────

  UPDATE public.participants
  SET
    tg_user_id    = COALESCE(tg_user_id,    v_tg_user_id),
    username      = COALESCE(username,      v_username),
    photo_url     = COALESCE(photo_url,     v_photo_url),
    bio           = COALESCE(bio,           v_bio),
    max_user_id   = COALESCE(max_user_id,   v_max_user_id),
    max_username  = COALESCE(max_username,  v_max_username),
    tg_first_name = COALESCE(tg_first_name, v_tg_first_name),
    tg_last_name  = COALESCE(tg_last_name,  v_tg_last_name),
    updated_at    = NOW(),
    updated_by    = p_actor
  WHERE id = p_target;

END;
$$;

-- ─── Data repair: fix any existing merges where fields weren't copied ──────
-- For every canonical participant that has at least one ghost, re-run the
-- field-copy for the fields we now care about.
-- NOTE: In PostgreSQL UPDATE SET clause, use bare column names (not alias.column).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id AS canonical_id
    FROM public.participants p
    WHERE p.merged_into IS NULL
      AND EXISTS (
        SELECT 1 FROM public.participants g WHERE g.merged_into = p.id
      )
  LOOP
    UPDATE public.participants
    SET
      tg_user_id   = COALESCE(tg_user_id, (
        SELECT g.tg_user_id  FROM public.participants g
        WHERE g.merged_into = id AND g.tg_user_id IS NOT NULL LIMIT 1)),
      username     = COALESCE(username, (
        SELECT g.username    FROM public.participants g
        WHERE g.merged_into = id AND g.username IS NOT NULL LIMIT 1)),
      photo_url    = COALESCE(photo_url, (
        SELECT g.photo_url   FROM public.participants g
        WHERE g.merged_into = id AND g.photo_url IS NOT NULL LIMIT 1)),
      bio          = COALESCE(bio, (
        SELECT g.bio         FROM public.participants g
        WHERE g.merged_into = id AND g.bio IS NOT NULL LIMIT 1)),
      max_user_id  = COALESCE(max_user_id, (
        SELECT g.max_user_id FROM public.participants g
        WHERE g.merged_into = id AND g.max_user_id IS NOT NULL LIMIT 1)),
      max_username = COALESCE(max_username, (
        SELECT g.max_username FROM public.participants g
        WHERE g.merged_into = id AND g.max_username IS NOT NULL LIMIT 1)),
      tg_first_name = COALESCE(tg_first_name, (
        SELECT g.tg_first_name FROM public.participants g
        WHERE g.merged_into = id AND g.tg_first_name IS NOT NULL LIMIT 1)),
      tg_last_name  = COALESCE(tg_last_name, (
        SELECT g.tg_last_name FROM public.participants g
        WHERE g.merged_into = id AND g.tg_last_name IS NOT NULL LIMIT 1)),
      updated_at = NOW()
    WHERE id = r.canonical_id;
  END LOOP;
END;
$$;
