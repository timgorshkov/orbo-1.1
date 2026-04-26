-- ═══════════════════════════════════════════════════════════════════
-- Migration 290: Capture WHY an announcement failed
--
-- Currently we only have status='failed' with no semantic distinction
-- between "transient network issue, gave up after N retries" and
-- "event already started, no point retrying further". The UI needs
-- this distinction to show useful copy to organizers.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

COMMENT ON COLUMN public.announcements.failure_reason IS
  'Machine-readable reason when status=failed. Values: ''event_passed'' (event already started, will not retry), ''max_retries'' (network gave up after many attempts), ''no_targets'' (no valid groups). NULL for non-failed.';
