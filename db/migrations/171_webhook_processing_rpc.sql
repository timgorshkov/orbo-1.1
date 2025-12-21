-- =====================================================
-- Migration 171: Optimized Webhook Processing
-- =====================================================
-- Purpose: Reduce DB roundtrips for webhook message processing
-- Before: 8-12 separate queries per message
-- After: 1-2 queries (main RPC + idempotency check)
--
-- Portability: Pure PL/pgSQL, works on any PostgreSQL 12+
-- =====================================================

-- 1. Composite index for fast participant lookup
-- Reduces lookup from ~20ms to ~1ms
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_org_tguser_active
ON participants (org_id, tg_user_id) 
WHERE merged_into IS NULL;

-- 2. Index for participant_groups lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participant_groups_lookup
ON participant_groups (participant_id, tg_group_id);

-- 3. Main RPC function for processing webhook messages
-- Combines: participant lookup/create, group link, activity event insert
CREATE OR REPLACE FUNCTION process_webhook_message(
  p_org_id UUID,
  p_tg_user_id BIGINT,
  p_tg_chat_id BIGINT,
  p_message_id BIGINT,
  p_message_thread_id BIGINT DEFAULT NULL,
  p_reply_to_message_id BIGINT DEFAULT NULL,
  p_reply_to_user_id BIGINT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_has_media BOOLEAN DEFAULT FALSE,
  p_chars_count INTEGER DEFAULT 0,
  p_links_count INTEGER DEFAULT 0,
  p_mentions_count INTEGER DEFAULT 0,
  p_reactions_count INTEGER DEFAULT 0,
  p_meta JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_participant_id UUID;
  v_is_new_participant BOOLEAN := FALSE;
  v_is_new_group_link BOOLEAN := FALSE;
  v_activity_event_id BIGINT;
  v_effective_full_name TEXT;
BEGIN
  -- Calculate effective full name
  v_effective_full_name := COALESCE(
    NULLIF(p_full_name, ''),
    NULLIF(TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')), ''),
    p_username,
    'User ' || p_tg_user_id::TEXT
  );

  -- Step 1: Get or create participant (single UPSERT)
  INSERT INTO participants (
    org_id,
    tg_user_id,
    username,
    tg_first_name,
    tg_last_name,
    full_name,
    source,
    participant_status,
    last_activity_at,
    updated_at
  ) VALUES (
    p_org_id,
    p_tg_user_id,
    p_username,
    p_first_name,
    p_last_name,
    v_effective_full_name,
    'telegram_group',
    'participant',
    NOW(),
    NOW()
  )
  ON CONFLICT (org_id, tg_user_id) 
  DO UPDATE SET
    -- Update Telegram names if changed
    tg_first_name = COALESCE(EXCLUDED.tg_first_name, participants.tg_first_name),
    tg_last_name = COALESCE(EXCLUDED.tg_last_name, participants.tg_last_name),
    username = COALESCE(EXCLUDED.username, participants.username),
    -- Always update activity timestamp
    last_activity_at = NOW(),
    updated_at = NOW()
  RETURNING id, (xmax = 0) INTO v_participant_id, v_is_new_participant;

  -- Handle merged participants: get the target participant
  SELECT COALESCE(merged_into, id) INTO v_participant_id
  FROM participants
  WHERE id = v_participant_id;

  -- Step 2: Ensure participant-group link exists
  INSERT INTO participant_groups (
    participant_id,
    tg_group_id,
    is_active,
    joined_at
  ) VALUES (
    v_participant_id,
    p_tg_chat_id,
    TRUE,
    NOW()
  )
  ON CONFLICT (participant_id, tg_group_id) 
  DO UPDATE SET
    is_active = TRUE,
    left_at = NULL
    -- Only update joined_at if was inactive
    -- joined_at = CASE WHEN participant_groups.is_active = FALSE THEN NOW() ELSE participant_groups.joined_at END
  RETURNING (xmax = 0) INTO v_is_new_group_link;

  -- Step 3: Insert activity event
  INSERT INTO activity_events (
    org_id,
    event_type,
    participant_id,
    tg_user_id,
    tg_chat_id,
    message_id,
    message_thread_id,
    reply_to_message_id,
    reply_to_user_id,
    has_media,
    chars_count,
    links_count,
    mentions_count,
    reactions_count,
    meta,
    created_at
  ) VALUES (
    p_org_id,
    'message',
    v_participant_id,
    p_tg_user_id,
    p_tg_chat_id,
    p_message_id,
    p_message_thread_id,
    p_reply_to_message_id,
    p_reply_to_user_id,
    p_has_media,
    p_chars_count,
    p_links_count,
    p_mentions_count,
    p_reactions_count,
    p_meta,
    NOW()
  )
  RETURNING id INTO v_activity_event_id;

  -- Step 4: Update telegram_groups last_sync_at (fire and forget)
  UPDATE telegram_groups
  SET last_sync_at = NOW()
  WHERE tg_chat_id = p_tg_chat_id::TEXT;

  -- Return result
  RETURN jsonb_build_object(
    'participant_id', v_participant_id,
    'is_new_participant', v_is_new_participant,
    'is_new_group_link', COALESCE(v_is_new_group_link, FALSE),
    'activity_event_id', v_activity_event_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail completely
  RAISE WARNING 'process_webhook_message error: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_webhook_message TO authenticated;
GRANT EXECUTE ON FUNCTION process_webhook_message TO service_role;

-- 4. Cleanup function for idempotency table
-- Should be called by cron every hour
CREATE OR REPLACE FUNCTION cleanup_webhook_idempotency(
  p_retention_days INTEGER DEFAULT 7
) RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_webhook_idempotency 
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_webhook_idempotency TO service_role;

-- 5. Fast idempotency check function
CREATE OR REPLACE FUNCTION check_webhook_processed(
  p_update_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM telegram_webhook_idempotency 
    WHERE update_id = p_update_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_webhook_processed TO service_role;

-- 6. Record webhook processing (for idempotency)
CREATE OR REPLACE FUNCTION record_webhook_processed(
  p_update_id BIGINT,
  p_tg_chat_id BIGINT,
  p_event_type TEXT DEFAULT 'message',
  p_org_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO telegram_webhook_idempotency (
    update_id,
    tg_chat_id,
    event_type,
    org_id
  ) VALUES (
    p_update_id,
    p_tg_chat_id,
    p_event_type,
    p_org_id
  )
  ON CONFLICT (update_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_webhook_processed TO service_role;

-- 7. Add comments for documentation
COMMENT ON FUNCTION process_webhook_message IS 
'Optimized webhook message processing. Combines participant upsert, group link, and activity event in single transaction. Reduces 8-12 roundtrips to 1.';

COMMENT ON FUNCTION cleanup_webhook_idempotency IS 
'Cleanup old idempotency records. Run via cron every hour with retention_days=7.';

COMMENT ON FUNCTION check_webhook_processed IS 
'Fast check if webhook update_id was already processed.';

COMMENT ON FUNCTION record_webhook_processed IS 
'Record successful webhook processing for idempotency.';

