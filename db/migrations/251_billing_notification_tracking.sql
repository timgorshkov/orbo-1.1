-- Migration 251: Add billing notification tracking to org_subscriptions
-- Purpose: Fix broken dedup in billing notifications (was using wrong columns in notification_logs)
-- Adds a simple JSONB column to track which billing notification keys were already sent

ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS billing_notifications JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN org_subscriptions.billing_notifications IS
  'Dedup tracking for billing expiry notifications. Keys are dedup_key strings, values are ISO timestamps of when they were sent. Example: {"billing_expiry_<org_id>_d7": "2026-03-25T09:00:00Z"}';
