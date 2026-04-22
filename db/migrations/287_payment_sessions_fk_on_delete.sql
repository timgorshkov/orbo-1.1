-- ═══════════════════════════════════════════════════════════════════
-- Migration 287: Fix payment_sessions foreign keys for event deletion
--
-- Problem: Deleting an event fails with FK violation because
-- payment_sessions.event_id and payment_sessions.event_registration_id
-- default to RESTRICT. Financial records must be preserved but
-- the reference should be nullified when the event is removed.
-- ═══════════════════════════════════════════════════════════════════

-- 1. event_id → ON DELETE SET NULL
ALTER TABLE public.payment_sessions
  DROP CONSTRAINT IF EXISTS payment_sessions_event_id_fkey;

ALTER TABLE public.payment_sessions
  ADD CONSTRAINT payment_sessions_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- 2. event_registration_id → ON DELETE SET NULL
ALTER TABLE public.payment_sessions
  DROP CONSTRAINT IF EXISTS payment_sessions_event_registration_id_fkey;

ALTER TABLE public.payment_sessions
  ADD CONSTRAINT payment_sessions_event_registration_id_fkey
  FOREIGN KEY (event_registration_id) REFERENCES public.event_registrations(id) ON DELETE SET NULL;
