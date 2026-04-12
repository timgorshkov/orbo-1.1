-- Migration 278: Billing trial reminder log
-- Date: 2026-04-12
-- Purpose: Track sent billing trial reminders for idempotency (avoid double-sends)

CREATE TABLE IF NOT EXISTS public.billing_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  reminder_type TEXT NOT NULL CHECK (reminder_type IN (
    'trial_remind_3d',
    'trial_remind_1d',
    'trial_downgrade',
    'custom'
  )),

  -- Idempotency key: e.g. 'trial_remind_3d_{org_id}_{date}'
  dedup_key TEXT NOT NULL UNIQUE,

  -- Delivery channels actually used
  email_sent BOOLEAN NOT NULL DEFAULT false,
  tg_sent BOOLEAN NOT NULL DEFAULT false,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_reminder_logs_org ON billing_reminder_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_reminder_logs_type ON billing_reminder_logs(reminder_type);
CREATE INDEX IF NOT EXISTS idx_billing_reminder_logs_created ON billing_reminder_logs(created_at DESC);

COMMENT ON TABLE billing_reminder_logs IS 'Log of billing trial reminders sent, for idempotency.';
COMMENT ON COLUMN billing_reminder_logs.dedup_key IS 'Unique key to prevent duplicate sends within cron window.';
