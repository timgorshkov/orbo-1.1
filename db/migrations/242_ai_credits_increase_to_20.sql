-- Increase free AI credits from 5 to 20
-- Update column default
ALTER TABLE public.organizations
  ALTER COLUMN ai_credits_total SET DEFAULT 20;

-- Update existing orgs that still have the old default of 5
UPDATE public.organizations
  SET ai_credits_total = 20
  WHERE ai_credits_total = 5;
