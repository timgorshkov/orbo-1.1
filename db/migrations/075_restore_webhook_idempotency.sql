-- Migration 075: Restore Webhook Idempotency (Simplified)
-- Created: 2025-11-01
-- Purpose: Prevent duplicate event processing from Telegram webhook
-- Context: telegram_updates was removed in migration 42, but we need idempotency back

-- =====================================================
-- 1. IDEMPOTENCY TABLE (SIMPLIFIED)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.telegram_webhook_idempotency (
  update_id BIGINT PRIMARY KEY,
  tg_chat_id BIGINT NOT NULL,
  event_type TEXT NOT NULL, -- 'message', 'chat_member', 'my_chat_member', etc.
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id UUID, -- nullable for unmapped groups
  
  -- Indexes for cleanup queries
  CREATED_AT TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup by date (delete old records)
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_created 
ON public.telegram_webhook_idempotency(created_at);

-- Index for org-specific queries (debugging)
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_org 
ON public.telegram_webhook_idempotency(org_id) WHERE org_id IS NOT NULL;

-- =====================================================
-- 2. CLEANUP FUNCTION (AUTO-DELETE OLD RECORDS)
-- =====================================================

-- Keep only last 7 days of idempotency records
CREATE OR REPLACE FUNCTION cleanup_webhook_idempotency()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.telegram_webhook_idempotency
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_webhook_idempotency IS 
'Deletes webhook idempotency records older than 7 days. Should be called daily via cron.';

-- =====================================================
-- 3. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT ON public.telegram_webhook_idempotency TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_webhook_idempotency TO authenticated;

-- =====================================================
-- 4. USAGE GUIDE
-- =====================================================

/*
USAGE IN WEBHOOK HANDLER:

1. Check if update already processed:
   SELECT 1 FROM telegram_webhook_idempotency WHERE update_id = $1

2. If exists → return early (idempotent)

3. If not exists → process update, then:
   INSERT INTO telegram_webhook_idempotency (update_id, tg_chat_id, event_type, org_id)
   VALUES ($1, $2, $3, $4)

4. Cleanup via cron (daily):
   SELECT cleanup_webhook_idempotency();

EXAMPLE:
  const { data: exists } = await supabase
    .from('telegram_webhook_idempotency')
    .select('update_id')
    .eq('update_id', update.update_id)
    .single();
  
  if (exists) return { ok: true }; // Already processed
  
  // Process update...
  
  await supabase
    .from('telegram_webhook_idempotency')
    .insert({
      update_id: update.update_id,
      tg_chat_id: chatId,
      event_type: eventType,
      org_id: orgId
    });
*/

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration 075 Complete ===';
  RAISE NOTICE 'Table created: telegram_webhook_idempotency';
  RAISE NOTICE 'Cleanup function: cleanup_webhook_idempotency()';
  RAISE NOTICE 'Retention: 7 days (auto-cleanup via cron)';
  RAISE NOTICE '================================';
END $$;

