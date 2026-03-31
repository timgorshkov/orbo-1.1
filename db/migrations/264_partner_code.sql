-- Migration 264: Add partner_code to user_registration_meta
-- Stores the referral/partner code extracted from ?via= param or revroute UTM pattern

ALTER TABLE public.user_registration_meta
  ADD COLUMN IF NOT EXISTS partner_code TEXT;

CREATE INDEX IF NOT EXISTS idx_user_reg_meta_partner_code
  ON public.user_registration_meta(partner_code)
  WHERE partner_code IS NOT NULL;
