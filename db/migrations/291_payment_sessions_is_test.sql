-- ═══════════════════════════════════════════════════════════════════
-- Migration 291: Mark test payments
--
-- Adds is_test flag to payment_sessions. Test payments are those made
-- against acquirer's test terminal during integration setup — they
-- generate real-looking platform_income rows that must be excluded
-- from accounting reports (USN income, agent reports, etc).
--
-- Existing real payments default to is_test=false. Superadmin can
-- mark specific sessions as test via the finances UI.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.payment_sessions.is_test IS
  'True for payments made via acquirer test terminal — exclude from revenue reports.';

-- Helpful partial index: only rows that are NOT test will be hit by ledger queries
CREATE INDEX IF NOT EXISTS idx_payment_sessions_not_test
  ON public.payment_sessions(created_at)
  WHERE is_test = FALSE;
