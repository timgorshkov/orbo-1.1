-- Migration 277: Subscription licensing acts & billing enhancements
-- Date: 2026-04-12
-- Purpose:
--   1. Extend org_invoices with fields for closing documents (acts of transfer
--      of non-exclusive rights) and customer data for fiscal receipts
--   2. Add sequence for act numbers (АЛ-1001, АЛ-1002, ...)

-- ═══════════════════════════════════════════════════════════════════
-- 1. Extend org_invoices with customer data + act fields
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.org_invoices
  -- Payment gateway info
  ADD COLUMN IF NOT EXISTS gateway_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_session_id UUID REFERENCES payment_sessions(id) ON DELETE SET NULL,

  -- License transfer act
  ADD COLUMN IF NOT EXISTS act_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS act_document_url TEXT,
  ADD COLUMN IF NOT EXISTS act_generated_at TIMESTAMPTZ,

  -- Customer data (for acts + fiscal receipts)
  -- Copied from contract.counterparty if exists, otherwise entered at payment time
  ADD COLUMN IF NOT EXISTS customer_type TEXT CHECK (customer_type IN ('individual', 'legal_entity', 'self_employed')),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,           -- ФИО физлица/ИП или название юрлица
  ADD COLUMN IF NOT EXISTS customer_inn TEXT,            -- ИНН (для юрлиц/ИП)
  ADD COLUMN IF NOT EXISTS customer_email TEXT,          -- для чека ККТ
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,

  -- Link to fiscal receipt
  ADD COLUMN IF NOT EXISTS fiscal_receipt_id UUID REFERENCES fiscal_receipts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_invoices.gateway_code IS 'Код платёжного шлюза: tbank, yookassa, manual (банковский перевод), etc';
COMMENT ON COLUMN public.org_invoices.payment_session_id IS 'Ссылка на платёжную сессию (если оплата через gateway)';
COMMENT ON COLUMN public.org_invoices.act_number IS 'Номер акта передачи неисключительных прав: АЛ-1001, АЛ-1002, ...';
COMMENT ON COLUMN public.org_invoices.act_document_url IS 'URL сгенерированного PDF акта в S3';
COMMENT ON COLUMN public.org_invoices.customer_type IS 'Тип плательщика для формирования акта/чека';
COMMENT ON COLUMN public.org_invoices.fiscal_receipt_id IS 'Ссылка на фискальный чек (если выбивался)';

CREATE INDEX IF NOT EXISTS idx_org_invoices_act_number ON public.org_invoices(act_number) WHERE act_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_invoices_payment_session ON public.org_invoices(payment_session_id) WHERE payment_session_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Sequence for act numbers (starting from 1001)
-- ═══════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS billing_act_seq
  START WITH 1001
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE billing_act_seq IS 'Sequential number for license transfer acts. Format: АЛ-{seq}';

-- Helper function to generate next act number
CREATE OR REPLACE FUNCTION public.next_billing_act_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  v_next := nextval('billing_act_seq');
  RETURN 'АЛ-' || v_next;
END;
$$;

COMMENT ON FUNCTION public.next_billing_act_number IS 'Returns next act number in format АЛ-{seq}';

-- ═══════════════════════════════════════════════════════════════════
-- 3. Allow subscription payment_for (if not already supported)
-- ═══════════════════════════════════════════════════════════════════

-- payment_sessions.payment_for already exists (event|membership).
-- We reuse 'membership' OR we need to extend the constraint.
-- Let's extend it to explicitly support 'subscription' (tariff plan payment).

DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_sessions_payment_for_check'
  ) THEN
    ALTER TABLE public.payment_sessions DROP CONSTRAINT payment_sessions_payment_for_check;
  END IF;

  -- Add new constraint including 'subscription'
  ALTER TABLE public.payment_sessions
    ADD CONSTRAINT payment_sessions_payment_for_check
    CHECK (payment_for IN ('event', 'membership', 'subscription'));
END $$;
