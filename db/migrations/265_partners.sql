-- Migration 265: Partners table for affiliate/referral program

CREATE TABLE IF NOT EXISTS public.partners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  contact     TEXT,
  code        TEXT NOT NULL,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partners_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_partners_code ON public.partners(code);
CREATE INDEX IF NOT EXISTS idx_partners_is_active ON public.partners(is_active);

COMMENT ON TABLE public.partners IS 'Affiliate/referral partners. code is used in ?via= referral links.';
COMMENT ON COLUMN public.partners.code IS 'Unique referral code used in ?via=CODE links';
