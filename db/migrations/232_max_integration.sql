-- MAX Messenger Integration
-- Adds tables for MAX groups and modifies existing tables to support multi-messenger architecture

-- ============================================================
-- 1. max_groups - analogous to telegram_groups
-- ============================================================
CREATE TABLE IF NOT EXISTS max_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    max_chat_id BIGINT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    invite_link TEXT,
    bot_status TEXT NOT NULL DEFAULT 'pending' CHECK (bot_status IN ('pending', 'connected', 'inactive')),
    member_count INTEGER DEFAULT 0,
    last_sync_at TIMESTAMPTZ,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_max_groups_max_chat_id ON max_groups(max_chat_id);
CREATE INDEX IF NOT EXISTS idx_max_groups_bot_status ON max_groups(bot_status);

-- ============================================================
-- 2. org_max_groups - links organizations to MAX groups
-- ============================================================
CREATE TABLE IF NOT EXISTS org_max_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    max_chat_id BIGINT NOT NULL,
    created_by UUID REFERENCES profiles(id),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE(org_id, max_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_org_max_groups_org_id ON org_max_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_org_max_groups_max_chat_id ON org_max_groups(max_chat_id);

-- ============================================================
-- 3. max_webhook_idempotency - deduplication for MAX webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS max_webhook_idempotency (
    update_id TEXT PRIMARY KEY,
    max_chat_id BIGINT,
    event_type TEXT,
    org_id UUID,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_max_webhook_idempotency_processed ON max_webhook_idempotency(processed_at);

-- ============================================================
-- 4. Add max_user_id to participants
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'participants' AND column_name = 'max_user_id'
    ) THEN
        ALTER TABLE participants ADD COLUMN max_user_id BIGINT;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS participants_org_max_user_key
    ON participants(org_id, max_user_id) WHERE max_user_id IS NOT NULL AND merged_into IS NULL;

CREATE INDEX IF NOT EXISTS idx_participants_max_user_id ON participants(max_user_id) WHERE max_user_id IS NOT NULL;

-- ============================================================
-- 5. Add messenger_type and max fields to activity_events
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activity_events' AND column_name = 'messenger_type'
    ) THEN
        ALTER TABLE activity_events ADD COLUMN messenger_type TEXT NOT NULL DEFAULT 'telegram';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activity_events' AND column_name = 'max_chat_id'
    ) THEN
        ALTER TABLE activity_events ADD COLUMN max_chat_id BIGINT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activity_events' AND column_name = 'max_user_id'
    ) THEN
        ALTER TABLE activity_events ADD COLUMN max_user_id BIGINT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_events_messenger_type ON activity_events(messenger_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_max_chat_id ON activity_events(max_chat_id) WHERE max_chat_id IS NOT NULL;

-- ============================================================
-- 6. Add messenger_type to event_registrations
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'event_registrations' AND column_name = 'messenger_type'
    ) THEN
        ALTER TABLE event_registrations ADD COLUMN messenger_type TEXT NOT NULL DEFAULT 'telegram';
    END IF;
END $$;

-- ============================================================
-- 7. Add max_group_id to application_pipelines (for linking MAX groups to pipelines)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'application_pipelines' AND column_name = 'max_group_id'
    ) THEN
        ALTER TABLE application_pipelines ADD COLUMN max_group_id BIGINT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_application_pipelines_max_group_id
    ON application_pipelines(max_group_id) WHERE max_group_id IS NOT NULL;

-- ============================================================
-- 8. Add max_chat_id and max_user_id to applications (for MAX-originated applications)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'applications' AND column_name = 'max_chat_id'
    ) THEN
        ALTER TABLE applications ADD COLUMN max_chat_id BIGINT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'applications' AND column_name = 'max_user_id'
    ) THEN
        ALTER TABLE applications ADD COLUMN max_user_id BIGINT;
    END IF;
END $$;

-- ============================================================
-- 9. Add target_max_groups to announcements
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'target_max_groups'
    ) THEN
        ALTER TABLE announcements ADD COLUMN target_max_groups JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- ============================================================
-- 10. Add max channel support to onboarding_messages
-- ============================================================
-- (no schema change needed — channel is TEXT and 'max' is a valid value)

-- ============================================================
-- 11. Add max_user_id to profiles for direct-message linking
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'max_user_id'
    ) THEN
        ALTER TABLE profiles ADD COLUMN max_user_id BIGINT;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_max_user_id_key
    ON profiles(max_user_id) WHERE max_user_id IS NOT NULL;

-- ============================================================
-- 12. Cleanup function for max_webhook_idempotency (keep 7 days)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_max_webhook_idempotency()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM max_webhook_idempotency
    WHERE processed_at < now() - INTERVAL '7 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
