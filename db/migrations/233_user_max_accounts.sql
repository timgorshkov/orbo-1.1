-- MAX Account Verification System
-- Stores verified MAX accounts for org owners/admins (mirrors user_telegram_accounts)

CREATE TABLE IF NOT EXISTS user_max_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    max_user_id BIGINT NOT NULL,
    max_username TEXT,
    max_first_name TEXT,
    max_last_name TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_code TEXT,
    verification_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_user_max_accounts_user_id ON user_max_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_max_accounts_org_id ON user_max_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_user_max_accounts_max_user_id ON user_max_accounts(max_user_id);
