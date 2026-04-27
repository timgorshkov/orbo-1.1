-- Migration 294: Recurring payment tokens for subscription auto-renewal.
--
-- After the FIRST tariff payment a CloudPayments-style webhook returns a Token
-- (cp_token) we can later use to charge the same card without user interaction.
-- We persist that token here, and a daily cron walks the table and charges
-- whoever's next_charge_at has come due. The actual money movement still goes
-- through the standard payment_session → webhook → markSessionSucceeded path,
-- so accounting (org_invoice / АЛ-act / receipt) reuses existing code.
--
-- One active token per (org, payment_for) — re-enabling auto-renewal replaces
-- the previous token (e.g. card change). Cancelled / expired tokens are kept
-- for audit trail; the unique partial index allows multiple historical rows.

CREATE TABLE IF NOT EXISTS public.recurring_payment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Acquiring gateway that issued the token. Kept gateway-agnostic so we can
  -- migrate the same row to a different provider later if needed.
  gateway_code TEXT NOT NULL,
  gateway_token TEXT NOT NULL,

  -- Card hint shown in UI ("карта **** 4242 истекает 12/27")
  card_last4 TEXT,
  card_expiry TEXT,

  -- What this token re-charges. Currently only 'subscription'; left as TEXT
  -- for future use (e.g. recurring premium memberships).
  payment_for TEXT NOT NULL,

  -- Plan identifier and recharge cadence — copied from the first payment
  -- so cron knows what to charge on the next cycle without re-resolving.
  plan_code TEXT,
  period_months INTEGER NOT NULL DEFAULT 1 CHECK (period_months IN (1, 3, 12)),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'failed')),

  -- Schedule
  next_charge_at TIMESTAMPTZ,
  last_charged_at TIMESTAMPTZ,
  last_charge_session_id UUID REFERENCES public.payment_sessions(id) ON DELETE SET NULL,

  -- Failure-handling: after N consecutive failed charges we mark the token
  -- 'failed' and require the org owner to re-enter their card (UI surfaces
  -- this with a "renew card" prompt).
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_failure_reason TEXT,

  -- Audit
  customer_snapshot JSONB,             -- frozen customer info for next acts/receipts
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Only one active/paused token per (org, payment_for); historical rows are
-- not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS recurring_tokens_one_active_per_org
  ON public.recurring_payment_tokens (org_id, payment_for)
  WHERE status IN ('active', 'paused');

-- Cron lookup: active tokens that are due
CREATE INDEX IF NOT EXISTS recurring_tokens_due
  ON public.recurring_payment_tokens (next_charge_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS recurring_tokens_org
  ON public.recurring_payment_tokens (org_id);

COMMENT ON TABLE public.recurring_payment_tokens IS
  'Saved acquirer tokens for unattended subscription auto-renewal. Charged daily by /api/cron/charge-recurring.';
COMMENT ON COLUMN public.recurring_payment_tokens.gateway_token IS
  'Opaque token from the gateway (CloudPayments calls it Token). Treat as a secret in transit; OK to store at rest since the gateway scopes it to our terminal.';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 294: recurring_payment_tokens created';
END $$;
