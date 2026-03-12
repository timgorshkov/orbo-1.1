-- Migration 245: Update billing plans
-- 1. Rename enterprise → Клубный, set price 7500
-- 2. Update free limit to 500 participants
-- 3. Add hidden Promo plan (like Club but price 0)

-- Add is_hidden column if not exists
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Update free plan: limit 500 participants
UPDATE billing_plans
SET limits = jsonb_set(limits, '{participants}', '500')
WHERE code = 'free';

-- Update enterprise → Клубный, price 7500, new features
UPDATE billing_plans
SET
  name = 'Клубный',
  description = 'Для клубов с расширенными возможностями',
  price_monthly = 7500,
  features = '{"ready_bots": true, "custom_bots": true, "custom_miniapps": true, "priority_support": true, "api_access": true, "dedicated_manager": true}'::jsonb
WHERE code = 'enterprise';

-- Insert promo plan (hidden, like Club but free)
INSERT INTO billing_plans (code, name, description, price_monthly, limits, features, is_active, is_hidden, sort_order)
VALUES (
  'promo',
  'Промо',
  'Специальные условия',
  0,
  '{"participants": -1, "ai_requests_per_month": -1, "custom_notification_rules": true}'::jsonb,
  '{"ready_bots": true, "custom_bots": true, "custom_miniapps": true, "priority_support": true}'::jsonb,
  true,
  true,
  99
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  is_hidden = EXCLUDED.is_hidden,
  sort_order = EXCLUDED.sort_order;
