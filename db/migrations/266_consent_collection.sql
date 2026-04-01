-- Migration 266: Consent collection for events and announcements
-- Adds organization-level consent settings, per-registration PD consent,
-- and per-participant announcements consent with revocation support.

-- 1. Organization settings for consent collection
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS privacy_policy_html TEXT,
  ADD COLUMN IF NOT EXISTS collect_pd_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collect_announcements_consent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.privacy_policy_html IS 'Rich-text privacy policy shown to participants during event registration';
COMMENT ON COLUMN public.organizations.collect_pd_consent IS 'When true, event registration requires mandatory PD processing consent checkbox';
COMMENT ON COLUMN public.organizations.collect_announcements_consent IS 'When true, event registration shows optional announcements consent checkbox';

-- 2. Per-registration PD consent timestamp
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS pd_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.event_registrations.pd_consent_at IS 'When participant gave PD processing consent for this registration (updated on re-registration)';

-- 3. Per-participant announcements consent with revocation
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS announcements_consent_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS announcements_consent_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.participants.announcements_consent_granted_at IS 'When participant last consented to receive announcements';
COMMENT ON COLUMN public.participants.announcements_consent_revoked_at IS 'When participant revoked announcements consent (null = not revoked, set = revoked). Cleared on re-consent.';

-- Index for querying participants with active announcements consent
CREATE INDEX IF NOT EXISTS idx_participants_announcements_consent
  ON public.participants(org_id)
  WHERE announcements_consent_granted_at IS NOT NULL
    AND announcements_consent_revoked_at IS NULL;
