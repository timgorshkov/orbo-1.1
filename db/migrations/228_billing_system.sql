-- Migration 228: Billing System
-- Purpose: Platform-level subscription billing (Free/Pro/Enterprise tiers)
-- Note: Separate from participant-level payment tracking in migration 101

-- =====================================================
-- 1. BILLING PLANS (static lookup)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly INTEGER, -- in rubles, NULL = custom pricing
  limits JSONB NOT NULL DEFAULT '{}',
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed plans
INSERT INTO billing_plans (code, name, description, price_monthly, limits, features, sort_order) VALUES
  ('free', 'Бесплатный', 'Для небольших сообществ до 1000 участников', 0,
   '{"participants": 1000, "ai_requests_per_month": 0, "custom_notification_rules": false}',
   '{"groups": true, "events": true, "announcements": true, "crm": true, "analytics": true, "ai_analysis": false, "custom_rules": false}',
   1),
  ('pro', 'Профессиональный', 'Для растущих сообществ без ограничений', 1500,
   '{"participants": -1, "ai_requests_per_month": -1, "custom_notification_rules": true}',
   '{"groups": true, "events": true, "announcements": true, "crm": true, "analytics": true, "ai_analysis": true, "custom_rules": true}',
   2),
  ('enterprise', 'Корпоративный', 'Индивидуальные условия для крупных организаций', NULL,
   '{"participants": -1, "ai_requests_per_month": -1, "custom_notification_rules": true}',
   '{"groups": true, "events": true, "announcements": true, "crm": true, "analytics": true, "ai_analysis": true, "custom_rules": true, "priority_support": true, "api_access": true}',
   3)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 2. ORG SUBSCRIPTIONS (org -> plan link)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'free' REFERENCES public.billing_plans(code),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'past_due', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  payment_url TEXT,
  over_limit_since TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id)
);

-- Seed free subscriptions for all existing orgs that don't have one
INSERT INTO org_subscriptions (org_id, plan_code, status, started_at)
SELECT id, 'free', 'active', NOW()
FROM organizations
WHERE id NOT IN (SELECT org_id FROM org_subscriptions)
ON CONFLICT (org_id) DO NOTHING;

-- =====================================================
-- 3. ORG INVOICES (payment transaction log)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.org_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.org_subscriptions(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method TEXT,
  payment_url TEXT,
  paid_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 4. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_plan ON public.org_subscriptions(plan_code);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON public.org_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_expires ON public.org_subscriptions(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_invoices_org ON public.org_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invoices_status ON public.org_invoices(status);
CREATE INDEX IF NOT EXISTS idx_org_invoices_subscription ON public.org_invoices(subscription_id) WHERE subscription_id IS NOT NULL;

-- =====================================================
-- 5. TRIGGER for updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_org_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_org_subscriptions_updated_at
BEFORE UPDATE ON public.org_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_org_subscriptions_updated_at();

-- =====================================================
-- 6. SYNC TRIGGER: keep organizations.plan in sync
-- =====================================================

CREATE OR REPLACE FUNCTION sync_org_plan_from_subscription()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE organizations SET plan = NEW.plan_code WHERE id = NEW.org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_org_plan_on_subscription_change
AFTER INSERT OR UPDATE OF plan_code ON public.org_subscriptions
FOR EACH ROW EXECUTE FUNCTION sync_org_plan_from_subscription();
