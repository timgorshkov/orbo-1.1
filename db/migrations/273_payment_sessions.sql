-- ═══════════════════════════════════════════════════════════════════
-- Migration 273: Payment Sessions
-- Central table for tracking all payment attempts through gateways.
-- Part of Phase 3: Payment Gateway Integration
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. payment_sessions — tracks each payment attempt
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- What this payment is for
  payment_for           TEXT NOT NULL CHECK (payment_for IN ('event', 'membership')),
  event_id              UUID REFERENCES public.events(id),
  event_registration_id UUID REFERENCES public.event_registrations(id),
  membership_payment_id TEXT,
  participant_id        UUID REFERENCES public.participants(id),

  -- Payment details
  amount                NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency              TEXT NOT NULL DEFAULT 'RUB',
  description           TEXT,

  -- Gateway
  gateway_code          TEXT NOT NULL CHECK (gateway_code IN ('manual', 'yookassa', 'tbank', 'sbp')),
  gateway_payment_id    TEXT,
  gateway_data          JSONB DEFAULT '{}',

  -- Bank transfer reconciliation
  payment_reference     TEXT UNIQUE,

  -- Status flow: pending → processing → succeeded | failed | cancelled | refunded
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded')),

  -- Return URLs
  return_url            TEXT,
  success_url           TEXT,
  fail_url              TEXT,

  -- Redirect URL from gateway
  payment_url           TEXT,

  -- Idempotency
  idempotency_key       TEXT UNIQUE,

  -- Metadata
  metadata              JSONB DEFAULT '{}',
  error_message         TEXT,

  -- Who initiated
  created_by            UUID REFERENCES public.users(id),

  -- Timestamps
  expires_at            TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  refunded_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_sessions_org_id ON public.payment_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON public.payment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_gateway ON public.payment_sessions(gateway_code);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_event_reg ON public.payment_sessions(event_registration_id) WHERE event_registration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_sessions_payment_ref ON public.payment_sessions(payment_reference) WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_sessions_gateway_payment ON public.payment_sessions(gateway_code, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_sessions_created_at ON public.payment_sessions(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER trg_payment_sessions_updated_at
  BEFORE UPDATE ON public.payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 2. Comments
-- ═══════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.payment_sessions IS 'Tracks each payment attempt through any gateway. Central table for payment flow.';
COMMENT ON COLUMN public.payment_sessions.payment_for IS 'What is being paid for: event registration or membership.';
COMMENT ON COLUMN public.payment_sessions.gateway_code IS 'Payment gateway used: manual, yookassa, tbank, sbp.';
COMMENT ON COLUMN public.payment_sessions.gateway_payment_id IS 'External payment ID from the gateway.';
COMMENT ON COLUMN public.payment_sessions.payment_reference IS 'Unique reference for bank transfer reconciliation (format: ORB-XXXX-XXXX).';
COMMENT ON COLUMN public.payment_sessions.payment_url IS 'URL to redirect user to for payment (from gateway).';
COMMENT ON COLUMN public.payment_sessions.idempotency_key IS 'Prevents duplicate payment session creation.';
