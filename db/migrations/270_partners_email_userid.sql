-- Migration 270: Add email and user_id to partners table for partner cabinet auth

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);

-- Email is the primary lookup field for partner access
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_email ON public.partners(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partners_user_id ON public.partners(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.partners.email IS 'Partner email - used to match with user account for partner cabinet access';
COMMENT ON COLUMN public.partners.user_id IS 'Linked user account (resolved from email on first login)';
