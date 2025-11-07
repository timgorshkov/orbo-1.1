-- Migration 101: Payment Tracking (Manual)
-- Created: 2025-11-07
-- Purpose: Enable manual payment tracking for org subscriptions and event payments
-- Context: Solo founder needs simple revenue tracking without payment gateway integration

-- =====================================================
-- 1. SUBSCRIPTIONS TABLE (membership subscriptions)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  
  -- Plan details
  plan_name TEXT NOT NULL, -- 'monthly', 'annual', 'quarterly', 'custom'
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'quarterly', 'annual', 'one-time')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE, -- NULL for one-time payments
  next_billing_date DATE,
  
  -- Metadata
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 2. PAYMENTS TABLE (actual payment records)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  
  -- Payment type (subscription payment OR event payment)
  payment_type TEXT NOT NULL DEFAULT 'subscription' CHECK (payment_type IN ('subscription', 'event', 'other')),
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  
  -- Payment details
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  payment_method TEXT NOT NULL, -- 'bank_transfer', 'card', 'cash', 'online', 'other'
  payment_method_details TEXT, -- e.g., 'Карта 1234', 'Счёт ИП'
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  
  -- Dates
  due_date DATE,
  paid_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  receipt_url TEXT, -- Link to receipt/invoice (Supabase storage or external)
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 3. PAYMENT METHODS TABLE (for org - reusable methods)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Method details
  method_type TEXT NOT NULL CHECK (method_type IN ('bank_transfer', 'card', 'cash', 'online', 'other')),
  display_name TEXT NOT NULL, -- e.g., 'Карта Сбербанк *1234'
  instructions TEXT, -- Payment instructions (account number, card number, etc.)
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 4. INDEXES
-- =====================================================

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_org 
ON public.subscriptions(org_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_participant 
ON public.subscriptions(participant_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status 
ON public.subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing 
ON public.subscriptions(next_billing_date) WHERE status = 'active';

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_subscription 
ON public.payments(subscription_id) WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_event 
ON public.payments(event_id) WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_org 
ON public.payments(org_id);

CREATE INDEX IF NOT EXISTS idx_payments_status 
ON public.payments(status);

CREATE INDEX IF NOT EXISTS idx_payments_due_date 
ON public.payments(due_date) WHERE status = 'pending';

-- Payment methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_org 
ON public.payment_methods(org_id);

-- =====================================================
-- 5. RLS POLICIES
-- =====================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Subscriptions: Org members can SELECT their subscriptions
CREATE POLICY subscriptions_select ON public.subscriptions 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = subscriptions.org_id 
    AND user_id = auth.uid()
  )
);

-- Subscriptions: Only owners/admins can INSERT
CREATE POLICY subscriptions_insert ON public.subscriptions 
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = subscriptions.org_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Subscriptions: Only owners/admins can UPDATE
CREATE POLICY subscriptions_update ON public.subscriptions 
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = subscriptions.org_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Subscriptions: Only owners can DELETE
CREATE POLICY subscriptions_delete ON public.subscriptions 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = subscriptions.org_id 
    AND user_id = auth.uid() 
    AND role = 'owner'
  )
);

-- Payments: Org members can SELECT their payments
CREATE POLICY payments_select ON public.payments 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payments.org_id 
    AND user_id = auth.uid()
  )
);

-- Payments: Only owners/admins can INSERT
CREATE POLICY payments_insert ON public.payments 
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payments.org_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Payments: Only owners/admins can UPDATE
CREATE POLICY payments_update ON public.payments 
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payments.org_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Payments: Only owners can DELETE
CREATE POLICY payments_delete ON public.payments 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payments.org_id 
    AND user_id = auth.uid() 
    AND role = 'owner'
  )
);

-- Payment Methods: Org members can SELECT
CREATE POLICY payment_methods_select ON public.payment_methods 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payment_methods.org_id 
    AND user_id = auth.uid()
  )
);

-- Payment Methods: Only owners/admins can INSERT
CREATE POLICY payment_methods_insert ON public.payment_methods 
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payment_methods.org_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Payment Methods: Only owners/admins can UPDATE
CREATE POLICY payment_methods_update ON public.payment_methods 
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payment_methods.org_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Payment Methods: Only owners can DELETE
CREATE POLICY payment_methods_delete ON public.payment_methods 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE org_id = payment_methods.org_id 
    AND user_id = auth.uid() 
    AND role = 'owner'
  )
);

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_subscriptions_updated_at 
BEFORE UPDATE ON public.subscriptions 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at 
BEFORE UPDATE ON public.payments 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at 
BEFORE UPDATE ON public.payment_methods 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON TABLE public.subscriptions IS 'Manual tracking of membership subscriptions';
COMMENT ON TABLE public.payments IS 'Manual tracking of payments (subscriptions or events)';
COMMENT ON TABLE public.payment_methods IS 'Reusable payment methods for an organization';

COMMENT ON COLUMN public.subscriptions.billing_period IS 'Frequency of billing: monthly, quarterly, annual, one-time';
COMMENT ON COLUMN public.subscriptions.next_billing_date IS 'Next expected payment date (NULL for one-time or cancelled)';

COMMENT ON COLUMN public.payments.payment_type IS 'Type of payment: subscription (membership) or event (ticket/registration)';
COMMENT ON COLUMN public.payments.subscription_id IS 'Link to subscription (NULL for event payments)';
COMMENT ON COLUMN public.payments.event_id IS 'Link to event (NULL for subscription payments)';

