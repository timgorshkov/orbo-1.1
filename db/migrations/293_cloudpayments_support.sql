-- Migration 293: CloudPayments support
--
-- 1. Allow gateway_code='cloudpayments' on payment_sessions.
-- 2. Allow per-org gateway selection (organizations.active_gateway). When NULL,
--    paymentService falls back to DEFAULT_GATEWAY env or 'tbank'. Only the
--    superadmin UI changes this column during the migration period; the public
--    Settings → Payments tab is read-only on it for now.

-- ─── 1. Extend allowed gateway codes on payment_sessions ─────────────
ALTER TABLE public.payment_sessions
  DROP CONSTRAINT IF EXISTS payment_sessions_gateway_code_check;

ALTER TABLE public.payment_sessions
  ADD CONSTRAINT payment_sessions_gateway_code_check
    CHECK (gateway_code IN ('manual', 'yookassa', 'tbank', 'sbp', 'cloudpayments'));

COMMENT ON COLUMN public.payment_sessions.gateway_code IS
  'Payment gateway used: manual, yookassa, tbank, sbp, cloudpayments.';

-- ─── 2. Active gateway per organization ──────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS active_gateway TEXT;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_active_gateway_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_active_gateway_check
    CHECK (active_gateway IS NULL OR active_gateway IN ('tbank', 'cloudpayments'));

COMMENT ON COLUMN public.organizations.active_gateway IS
  'Override of the platform-default acquiring gateway for this org. NULL = use platform default. Only one online gateway is active per org at a time during the T-Bank → CloudPayments migration.';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 293: CloudPayments gateway code allowed; organizations.active_gateway added';
END $$;
