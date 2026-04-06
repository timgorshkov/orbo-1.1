-- Migration 271: Organization accounts and transaction ledger
-- Foundation for the payment system: internal account per org, double-entry inspired ledger

-- ═══════════════════════════════════════════════════════════════════
-- 1. Org accounts — configuration, not balance (balance is computed)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.org_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0500,  -- 5% default
  min_withdrawal_amount NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
  currency        TEXT NOT NULL DEFAULT 'RUB',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_accounts_org_id ON public.org_accounts(org_id);

COMMENT ON TABLE public.org_accounts IS 'Internal financial account per organization. Commission rate and withdrawal config.';
COMMENT ON COLUMN public.org_accounts.commission_rate IS 'Platform commission rate (0.0500 = 5%). Applied to each incoming payment.';
COMMENT ON COLUMN public.org_accounts.min_withdrawal_amount IS 'Minimum amount for withdrawal request (RUB).';

-- ═══════════════════════════════════════════════════════════════════
-- 2. Transaction ledger — single source of truth for all money movements
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.org_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Type taxonomy
  type                  TEXT NOT NULL CHECK (type IN (
    'payment_incoming',       -- participant pays for event/membership
    'commission_deduction',   -- platform commission on incoming payment
    'withdrawal_requested',   -- org owner requests payout (freezes funds)
    'withdrawal_completed',   -- payout actually sent
    'withdrawal_rejected',    -- payout rejected, funds unfrozen
    'refund',                 -- refund to participant
    'commission_reversal',    -- commission returned on refund
    'adjustment'              -- manual correction by superadmin
  )),

  -- Amount: positive = money in, negative = money out
  amount                NUMERIC(10,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'RUB',

  -- Running balance (computed atomically by RPC function)
  balance_after         NUMERIC(10,2) NOT NULL,

  -- References (polymorphic)
  event_registration_id UUID REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  membership_payment_id UUID,  -- references membership_payments(id), no FK to avoid circular deps
  withdrawal_id         UUID,  -- will reference org_withdrawals(id) after Phase 2 migration

  -- Source details
  participant_id        UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  event_id              UUID REFERENCES public.events(id) ON DELETE SET NULL,
  payment_gateway       TEXT,   -- 'manual', 'yookassa', 'tbank', 'sbp'
  external_payment_id   TEXT,   -- payment ID from gateway

  -- Idempotency: prevents duplicate recordings
  idempotency_key       TEXT UNIQUE,

  -- Metadata
  description           TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_transactions_org_id ON public.org_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_org_transactions_org_created ON public.org_transactions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_transactions_type ON public.org_transactions(type);
CREATE INDEX IF NOT EXISTS idx_org_transactions_event_id ON public.org_transactions(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_transactions_participant_id ON public.org_transactions(participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_transactions_event_registration ON public.org_transactions(event_registration_id) WHERE event_registration_id IS NOT NULL;

COMMENT ON TABLE public.org_transactions IS 'Financial ledger. Every money movement is a row. Balance is derived from balance_after of latest row per org.';
COMMENT ON COLUMN public.org_transactions.balance_after IS 'Running balance after this transaction. Computed atomically by record_incoming_payment().';
COMMENT ON COLUMN public.org_transactions.idempotency_key IS 'Unique key preventing duplicate entries (e.g. evt_reg_{id}, mbr_pay_{id}).';

-- ═══════════════════════════════════════════════════════════════════
-- 3. Convenience view: current balance per org
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.org_account_balances AS
SELECT DISTINCT ON (org_id)
  org_id,
  balance_after AS balance,
  created_at AS last_transaction_at
FROM public.org_transactions
ORDER BY org_id, created_at DESC;

COMMENT ON VIEW public.org_account_balances IS 'Current balance per org — latest balance_after from ledger.';

-- ═══════════════════════════════════════════════════════════════════
-- 4. RPC: record_incoming_payment — atomic double-entry recording
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_incoming_payment(
  p_org_id                UUID,
  p_amount                NUMERIC,
  p_currency              TEXT DEFAULT 'RUB',
  p_idempotency_key       TEXT DEFAULT NULL,
  p_event_registration_id UUID DEFAULT NULL,
  p_membership_payment_id UUID DEFAULT NULL,
  p_event_id              UUID DEFAULT NULL,
  p_participant_id        UUID DEFAULT NULL,
  p_payment_gateway       TEXT DEFAULT 'manual',
  p_external_payment_id   TEXT DEFAULT NULL,
  p_description           TEXT DEFAULT NULL,
  p_created_by            UUID DEFAULT NULL
)
RETURNS TABLE(
  payment_transaction_id    UUID,
  commission_transaction_id UUID,
  commission_amount         NUMERIC,
  net_amount                NUMERIC,
  new_balance               NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_commission_rate    NUMERIC;
  v_commission_amount  NUMERIC;
  v_net_amount         NUMERIC;
  v_current_balance    NUMERIC;
  v_balance_after_pay  NUMERIC;
  v_balance_after_comm NUMERIC;
  v_pay_tx_id          UUID;
  v_comm_tx_id         UUID;
  v_idem_key_comm      TEXT;
BEGIN
  -- Validate
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount;
  END IF;

  -- Ensure org_account exists, lock it for serialization
  INSERT INTO public.org_accounts (org_id)
  VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;

  SELECT commission_rate INTO v_commission_rate
  FROM public.org_accounts
  WHERE org_id = p_org_id
  FOR UPDATE;

  -- Calculate commission
  v_commission_amount := ROUND(p_amount * v_commission_rate, 2);
  v_net_amount := p_amount - v_commission_amount;

  -- Get current balance (lock latest row to serialize concurrent writes)
  SELECT balance_after INTO v_current_balance
  FROM public.org_transactions
  WHERE org_id = p_org_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    v_current_balance := 0;
  END IF;

  -- 1) Insert incoming payment
  v_balance_after_pay := v_current_balance + p_amount;
  v_pay_tx_id := gen_random_uuid();

  INSERT INTO public.org_transactions (
    id, org_id, type, amount, currency, balance_after,
    event_registration_id, membership_payment_id, event_id,
    participant_id, payment_gateway, external_payment_id,
    idempotency_key, description, created_by
  ) VALUES (
    v_pay_tx_id, p_org_id, 'payment_incoming', p_amount, p_currency, v_balance_after_pay,
    p_event_registration_id, p_membership_payment_id, p_event_id,
    p_participant_id, p_payment_gateway, p_external_payment_id,
    p_idempotency_key, p_description, p_created_by
  );

  -- 2) Insert commission deduction
  v_balance_after_comm := v_balance_after_pay - v_commission_amount;
  v_comm_tx_id := gen_random_uuid();

  IF p_idempotency_key IS NOT NULL THEN
    v_idem_key_comm := p_idempotency_key || '_commission';
  END IF;

  INSERT INTO public.org_transactions (
    id, org_id, type, amount, currency, balance_after,
    event_registration_id, membership_payment_id, event_id,
    participant_id, idempotency_key, description, created_by
  ) VALUES (
    v_comm_tx_id, p_org_id, 'commission_deduction', -v_commission_amount, p_currency, v_balance_after_comm,
    p_event_registration_id, p_membership_payment_id, p_event_id,
    p_participant_id, v_idem_key_comm,
    'Комиссия платформы ' || ROUND(v_commission_rate * 100, 1) || '%',
    p_created_by
  );

  -- Return results
  RETURN QUERY SELECT v_pay_tx_id, v_comm_tx_id, v_commission_amount, v_net_amount, v_balance_after_comm;
END;
$$;

COMMENT ON FUNCTION public.record_incoming_payment IS 'Atomically records incoming payment + commission deduction. Returns transaction IDs and new balance.';

-- ═══════════════════════════════════════════════════════════════════
-- 5. RPC: record_simple_transaction — for withdrawals, refunds, adjustments
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_simple_transaction(
  p_org_id          UUID,
  p_type            TEXT,
  p_amount          NUMERIC,
  p_currency        TEXT DEFAULT 'RUB',
  p_idempotency_key TEXT DEFAULT NULL,
  p_withdrawal_id   UUID DEFAULT NULL,
  p_event_registration_id UUID DEFAULT NULL,
  p_membership_payment_id UUID DEFAULT NULL,
  p_event_id        UUID DEFAULT NULL,
  p_participant_id  UUID DEFAULT NULL,
  p_description     TEXT DEFAULT NULL,
  p_metadata        JSONB DEFAULT '{}',
  p_created_by      UUID DEFAULT NULL
)
RETURNS TABLE(transaction_id UUID, new_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance     NUMERIC;
  v_tx_id           UUID;
BEGIN
  -- Get current balance with lock
  SELECT balance_after INTO v_current_balance
  FROM public.org_transactions
  WHERE org_id = p_org_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + p_amount;
  v_tx_id := gen_random_uuid();

  INSERT INTO public.org_transactions (
    id, org_id, type, amount, currency, balance_after,
    withdrawal_id, event_registration_id, membership_payment_id,
    event_id, participant_id,
    idempotency_key, description, metadata, created_by
  ) VALUES (
    v_tx_id, p_org_id, p_type, p_amount, p_currency, v_new_balance,
    p_withdrawal_id, p_event_registration_id, p_membership_payment_id,
    p_event_id, p_participant_id,
    p_idempotency_key, p_description, p_metadata, p_created_by
  );

  RETURN QUERY SELECT v_tx_id, v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.record_simple_transaction IS 'Records a single ledger entry (withdrawal, refund, adjustment). Atomically computes balance.';
