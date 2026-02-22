-- AI Credits for organizations
-- Each org gets 3 free AI analysis credits on trial

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_credits_total integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ai_credits_used integer NOT NULL DEFAULT 0;

-- Existing orgs: give 5 credits
UPDATE public.organizations
  SET ai_credits_total = 5, ai_credits_used = 0
  WHERE ai_credits_total <= 5;
