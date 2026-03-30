-- Migration 259: Telegram member sync jobs table
-- Created: 2026-03-30
-- Purpose: Track background jobs that fetch ALL group members via MTProto
--          (service account user API, not bot API)

CREATE TABLE IF NOT EXISTS telegram_member_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tg_chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_members INT,
  synced_members INT NOT NULL DEFAULT 0,
  new_members INT NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_member_sync_jobs_org_chat
  ON telegram_member_sync_jobs(org_id, tg_chat_id);

CREATE INDEX idx_member_sync_jobs_status
  ON telegram_member_sync_jobs(status)
  WHERE status IN ('pending', 'running');

COMMENT ON TABLE telegram_member_sync_jobs IS
  'Tracks background jobs that import all Telegram group members via MTProto service account';

DO $$
BEGIN
  RAISE NOTICE 'Migration 259 complete: telegram_member_sync_jobs table created';
END $$;
