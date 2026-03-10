-- Migration 244: Add default_payment_link to organizations
-- Stores the default payment link pre-filled in every new paid event

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_payment_link TEXT;

COMMENT ON COLUMN organizations.default_payment_link IS
  'Платёжная ссылка по умолчанию, автоматически подставляется в новые платные события';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 244: default_payment_link added to organizations';
END $$;
