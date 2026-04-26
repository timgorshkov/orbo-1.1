-- ═══════════════════════════════════════════════════════════════════
-- Migration 289: Track who performed event check-in
--
-- A check-in can be performed by either an org admin (via NextAuth)
-- or a temporary registrator (via cookie session, see migration 288).
-- We snapshot the display name at check-in time so that revoking a
-- registrator session later still leaves a readable audit trail.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS checked_in_by_user_id              UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_registrator_id       UUID REFERENCES public.registrator_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_name                 TEXT;

COMMENT ON COLUMN public.event_registrations.checked_in_by_user_id IS
  'Org admin (users.id) who performed the check-in via the admin UI. Mutually exclusive with checked_in_by_registrator_id.';
COMMENT ON COLUMN public.event_registrations.checked_in_by_registrator_id IS
  'Registrator session (registrator_sessions.id) that performed the check-in. Mutually exclusive with checked_in_by_user_id.';
COMMENT ON COLUMN public.event_registrations.checked_in_by_name IS
  'Snapshot of the actor display name at check-in time (admin email or registrator name). Survives session revocation.';
