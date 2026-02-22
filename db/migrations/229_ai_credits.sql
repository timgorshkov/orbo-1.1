-- AI Credits for organizations
-- Each org gets 3 free AI analysis credits on trial

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_credits_total integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_credits_used integer NOT NULL DEFAULT 0;

-- Existing orgs: give 3 credits to everyone who hasn't used AI yet
UPDATE public.organizations
  SET ai_credits_total = 3, ai_credits_used = 0
  WHERE ai_credits_total = 3 AND ai_credits_used = 0;
