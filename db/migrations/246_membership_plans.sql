-- Migration 246: Paid Community Access - Membership Plans
-- Creates membership_plans, membership_plan_access, participant_memberships, membership_payments tables
-- Deprecates old subscriptions/payments/payment_methods tables (test data only)

-- ============================================================
-- 1. Membership Plans - what an org offers
-- ============================================================
CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  price NUMERIC(10,2),
  currency TEXT DEFAULT 'RUB',
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN
    ('one_time','weekly','monthly','quarterly','semi_annual','annual','custom')),
  custom_period_days INT,

  payment_link TEXT,
  payment_instructions TEXT,

  trial_days INT DEFAULT 0,
  grace_period_days INT DEFAULT 3,

  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  max_members INT,
  sort_order INT DEFAULT 0,

  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_org ON membership_plans(org_id) WHERE is_active;

-- ============================================================
-- 2. Access rules - which resources a plan unlocks
-- ============================================================
CREATE TABLE IF NOT EXISTS membership_plan_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,

  resource_type TEXT NOT NULL CHECK (resource_type IN
    ('telegram_group','telegram_channel','max_group','materials','events','member_directory')),
  resource_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, resource_type, resource_id)
);

-- ============================================================
-- 3. Participant memberships - who has access
-- ============================================================
CREATE TABLE IF NOT EXISTS participant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id),

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','trial','active','expired','cancelled','suspended')),

  basis TEXT NOT NULL DEFAULT 'payment' CHECK (basis IN
    ('payment','invitation','moderation','manual','import','promotion')),

  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  last_payment_id UUID,
  next_billing_date DATE,
  amount_paid NUMERIC(10,2),

  access_synced_at TIMESTAMPTZ,
  access_sync_status TEXT DEFAULT 'pending' CHECK (access_sync_status IN
    ('pending','synced','failed','not_applicable')),

  granted_by UUID,
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, participant_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_participant_memberships_org ON participant_memberships(org_id, status);
CREATE INDEX IF NOT EXISTS idx_participant_memberships_expiry ON participant_memberships(expires_at)
  WHERE status IN ('active','trial');
CREATE INDEX IF NOT EXISTS idx_participant_memberships_participant ON participant_memberships(participant_id);

-- ============================================================
-- 4. Membership payments - payment log
-- ============================================================
CREATE TABLE IF NOT EXISTS membership_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES participant_memberships(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),

  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','confirmed','failed','refunded')),

  paid_at TIMESTAMPTZ,
  confirmed_by UUID,
  notes TEXT,
  receipt_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_payments_membership ON membership_payments(membership_id);

-- ============================================================
-- 5. Update billing_plans features to include paid_membership
-- ============================================================
UPDATE billing_plans
SET features = features || '{"paid_membership": true}'::jsonb
WHERE code IN ('enterprise', 'promo');

-- ============================================================
-- 6. RLS policies
-- ============================================================

ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plan_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_payments ENABLE ROW LEVEL SECURITY;

-- membership_plans: org admins can manage, members can view
CREATE POLICY "membership_plans_select" ON membership_plans
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "membership_plans_insert" ON membership_plans
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "membership_plans_update" ON membership_plans
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "membership_plans_delete" ON membership_plans
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND role = 'owner')
  );

-- membership_plan_access: follows plan visibility
CREATE POLICY "membership_plan_access_select" ON membership_plan_access
  FOR SELECT USING (
    plan_id IN (SELECT id FROM membership_plans WHERE org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid()))
  );

CREATE POLICY "membership_plan_access_manage" ON membership_plan_access
  FOR ALL USING (
    plan_id IN (SELECT id FROM membership_plans WHERE org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

-- participant_memberships: org admins manage, members view
CREATE POLICY "participant_memberships_select" ON participant_memberships
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "participant_memberships_manage" ON participant_memberships
  FOR ALL USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- membership_payments: org admins manage
CREATE POLICY "membership_payments_select" ON membership_payments
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "membership_payments_manage" ON membership_payments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- ============================================================
-- 7. Deprecate old subscriptions/payments/payment_methods
-- ============================================================
-- Move old test data to a backup and drop tables
-- The tables had only 2 test records in subscriptions, 0 in payments, 0 in payment_methods

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
