-- Migration 084: Analytics Support Schema
-- Date: Nov 5, 2025
-- Purpose: Add fields and indexes to support comprehensive analytics

-- ============================================================================
-- 1. Add timezone to organizations
-- ============================================================================
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

COMMENT ON COLUMN organizations.timezone IS 'Organization timezone (IANA format, e.g. Europe/Moscow, America/New_York)';

-- ============================================================================
-- 2. Add reactions_count to activity_events
-- ============================================================================
ALTER TABLE activity_events
ADD COLUMN IF NOT EXISTS reactions_count INT DEFAULT 0;

COMMENT ON COLUMN activity_events.reactions_count IS 'Total count of reactions on this message (for fast aggregation)';

-- ============================================================================
-- 3. Add source to participant_groups
-- ============================================================================
ALTER TABLE participant_groups
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'webhook_join';

COMMENT ON COLUMN participant_groups.source IS 'How participant was added: webhook_join, import, manual';

-- Add CHECK constraint for source values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'participant_groups' AND constraint_name = 'participant_groups_source_check'
  ) THEN
    ALTER TABLE participant_groups
    ADD CONSTRAINT participant_groups_source_check 
    CHECK (source IN ('webhook_join', 'import', 'manual'));
  END IF;
END $$;

-- ============================================================================
-- 4. Create indexes for analytics performance
-- ============================================================================

-- For activity timeline queries (group by date)
CREATE INDEX IF NOT EXISTS idx_activity_events_org_date
ON activity_events(org_id, created_at DESC);

-- For user activity queries
CREATE INDEX IF NOT EXISTS idx_activity_events_user_date
ON activity_events(tg_user_id, created_at DESC) 
WHERE tg_user_id IS NOT NULL;

-- For group-specific queries
CREATE INDEX IF NOT EXISTS idx_activity_events_chat_date
ON activity_events(tg_chat_id, created_at DESC)
WHERE tg_chat_id IS NOT NULL;

-- For event type filtering (reactions, messages)
CREATE INDEX IF NOT EXISTS idx_activity_events_type_date
ON activity_events(event_type, org_id, created_at DESC);

-- For participant engagement queries
CREATE INDEX IF NOT EXISTS idx_participants_last_activity
ON participants(org_id, last_activity_at DESC NULLS LAST);

-- For participant_groups joined_at queries (newcomers)
CREATE INDEX IF NOT EXISTS idx_participant_groups_joined
ON participant_groups(tg_group_id, joined_at DESC);

-- ============================================================================
-- 5. Update existing webhook messages with reactions_count
-- ============================================================================
-- Extract reactions count from meta for existing messages
UPDATE activity_events
SET reactions_count = COALESCE(
  (meta->'reactions'->>'total_count')::INT,
  0
)
WHERE event_type = 'message'
  AND reactions_count = 0
  AND meta->'reactions'->>'total_count' IS NOT NULL;

-- ============================================================================
-- 6. Set default timezone for existing organizations
-- ============================================================================
-- Set timezone to 'Europe/Moscow' for existing orgs (can be changed in settings)
UPDATE organizations
SET timezone = 'Europe/Moscow'
WHERE timezone = 'UTC' OR timezone IS NULL;

COMMENT ON TABLE organizations IS 'Organizations table. timezone should be set based on owner location or manual settings';

DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 084 Complete: Analytics support schema added';
  RAISE NOTICE '  - Added organizations.timezone (default: Europe/Moscow for existing)';
  RAISE NOTICE '  - Added activity_events.reactions_count (extracted from meta for existing)';
  RAISE NOTICE '  - Added participant_groups.source (default: webhook_join)';
  RAISE NOTICE '  - Created 7 indexes for analytics performance';
END $$;

