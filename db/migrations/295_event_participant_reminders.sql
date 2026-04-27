-- Migration 295: Per-participant reminder dedup
--
-- Bug: /api/cron/send-event-reminders runs hourly and selects events whose
-- event_date is "tomorrow" / start_time is "in 1-2h", with NO record of which
-- participants already received the reminder. Every hour each registered
-- participant got the same message again.
--
-- Fix: track sends in a dedicated table, gated by a unique constraint per
-- (event, registration, reminder_type). Cron INSERTs an "in-progress" row,
-- skips on conflict, and updates the row to status='sent' (or 'failed') after
-- the Telegram send returns.

CREATE TABLE IF NOT EXISTS public.event_participant_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- registration_id is on the registration event (parent for recurring series),
  -- but we also pin to the specific event_id so series instances dedup
  -- independently — a 24h reminder for occurrence A doesn't suppress one for
  -- occurrence B that happens to share the same registration row.
  registration_id UUID NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,

  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24h', '1h', 'post_event')),

  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  tg_message_id BIGINT,
  error_message TEXT,

  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The whole point: prevent duplicate sends.
CREATE UNIQUE INDEX IF NOT EXISTS event_participant_reminders_unique
  ON public.event_participant_reminders (event_id, registration_id, reminder_type);

CREATE INDEX IF NOT EXISTS event_participant_reminders_event
  ON public.event_participant_reminders (event_id);

COMMENT ON TABLE public.event_participant_reminders IS
  'Per-participant reminder send log. Unique on (event, registration, type) prevents the hourly cron from re-sending.';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 295: event_participant_reminders created';
END $$;
