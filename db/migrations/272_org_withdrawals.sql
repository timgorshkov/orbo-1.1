-- ═══════════════════════════════════════════════════════════════════
-- Migration 272: Withdrawal System
-- Creates org_withdrawals + org_withdrawal_items tables
-- Part of Phase 2: Withdrawal System
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. Act number sequence (АКТ-000001)
-- ═══════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS act_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_act_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'АКТ-' || LPAD(nextval('act_number_seq')::TEXT, 6, '0');
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. org_withdrawals — withdrawal requests
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.org_withdrawals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Status flow: requested → processing → completed | rejected
  status              TEXT NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('requested', 'processing', 'completed', 'rejected')),

  -- Financial
  amount              NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  commission_amount   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  net_amount          NUMERIC(10,2) NOT NULL CHECK (net_amount > 0),
  currency            TEXT NOT NULL DEFAULT 'RUB',

  -- Period covered by this withdrawal
  period_from         TIMESTAMPTZ,
  period_to           TIMESTAMPTZ,

  -- Act document
  act_number          TEXT UNIQUE DEFAULT generate_act_number(),
  act_document_url    TEXT,

  -- Bank account used for payout
  bank_account_id     UUID REFERENCES public.bank_accounts(id),
  contract_id         UUID REFERENCES public.contracts(id),

  -- Linked ledger transactions
  requested_transaction_id  UUID REFERENCES public.org_transactions(id),
  completed_transaction_id  UUID REFERENCES public.org_transactions(id),

  -- Processing info
  requested_by        UUID REFERENCES public.users(id),
  processed_by        UUID REFERENCES public.users(id),
  rejection_reason    TEXT,

  -- Timestamps
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_withdrawals_org_id ON public.org_withdrawals(org_id);
CREATE INDEX IF NOT EXISTS idx_org_withdrawals_status ON public.org_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_org_withdrawals_requested_at ON public.org_withdrawals(requested_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER trg_org_withdrawals_updated_at
  BEFORE UPDATE ON public.org_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 3. org_withdrawal_items — line items for the act
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.org_withdrawal_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id       UUID NOT NULL REFERENCES public.org_withdrawals(id) ON DELETE CASCADE,
  transaction_id      UUID REFERENCES public.org_transactions(id),

  -- Line item details
  description         TEXT NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  quantity            INT NOT NULL DEFAULT 1,
  total               NUMERIC(10,2) NOT NULL,

  -- Optional references
  event_id            UUID REFERENCES public.events(id),
  event_name          TEXT,
  participant_count   INT,

  -- Order in act
  sort_order          INT NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_withdrawal_items_withdrawal_id ON public.org_withdrawal_items(withdrawal_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4. Add FK from org_transactions.withdrawal_id → org_withdrawals
-- ═══════════════════════════════════════════════════════════════════

-- Add FK constraint (the column already exists from migration 271)
ALTER TABLE public.org_transactions
  ADD CONSTRAINT fk_org_transactions_withdrawal_id
  FOREIGN KEY (withdrawal_id) REFERENCES public.org_withdrawals(id);

-- ═══════════════════════════════════════════════════════════════════
-- 5. Comments
-- ═══════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.org_withdrawals IS 'Withdrawal requests from org accounts. Status: requested → processing → completed/rejected.';
COMMENT ON TABLE public.org_withdrawal_items IS 'Line items for withdrawal acts — breakdown of what is being paid out.';
COMMENT ON COLUMN public.org_withdrawals.amount IS 'Gross withdrawal amount (before any withdrawal fee).';
COMMENT ON COLUMN public.org_withdrawals.commission_amount IS 'Withdrawal processing fee (usually 0, reserved for future).';
COMMENT ON COLUMN public.org_withdrawals.net_amount IS 'Amount actually transferred to bank account.';
COMMENT ON COLUMN public.org_withdrawals.act_number IS 'Auto-generated act number (АКТ-000001 format).';
