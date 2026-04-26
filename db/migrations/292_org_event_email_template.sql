-- ═══════════════════════════════════════════════════════════════════
-- Migration 292: Org-level event email/DM confirmation template
--
-- Adds JSONB column on organizations for the customisable confirmation
-- message sent to participants after they register (and after payment for
-- paid events). Same template is used for both email and Telegram DM.
--
-- NULL = use the platform-default built-in template (backwards-compatible).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS event_email_template JSONB;

COMMENT ON COLUMN public.organizations.event_email_template IS
  'Customised confirmation template sent to participants after event registration / payment. Shape: { subject, bodyMarkdown, qrInstructionMarkdown, updatedAt }. NULL = use built-in default.';
