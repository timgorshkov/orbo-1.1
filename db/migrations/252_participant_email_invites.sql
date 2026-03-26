-- Migration 252: Participant email invites + auth tokens
-- Система email-приглашений участников и магических ссылок для входа

-- 1. Новые колонки в participants
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_source TEXT; -- 'telegram', 'email_invite', 'link_invite', 'manual', 'import'

COMMENT ON COLUMN participants.email_verified_at IS 'Когда email участника был подтверждён (через принятие приглашения или magic link)';
COMMENT ON COLUMN participants.invite_source IS 'Источник создания участника';

-- 2. Таблица email-приглашений участников
CREATE TABLE IF NOT EXISTS participant_email_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  personal_note TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participant_email_invites_org ON participant_email_invites(org_id);
CREATE INDEX IF NOT EXISTS idx_participant_email_invites_email ON participant_email_invites(email);
CREATE INDEX IF NOT EXISTS idx_participant_email_invites_token ON participant_email_invites(token);
CREATE INDEX IF NOT EXISTS idx_participant_email_invites_status ON participant_email_invites(org_id, status);

COMMENT ON TABLE participant_email_invites IS 'Email-приглашения участников (не администраторов) в сообщество';
COMMENT ON COLUMN participant_email_invites.token IS 'Уникальный токен для ссылки-приглашения';
COMMENT ON COLUMN participant_email_invites.participant_id IS 'Заполняется при принятии — ссылка на созданного/найденного участника';

-- 3. Таблица токенов аутентификации участников (magic link для входа)
CREATE TABLE IF NOT EXISTS participant_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participant_auth_tokens_token ON participant_auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_participant_auth_tokens_participant ON participant_auth_tokens(participant_id);
CREATE INDEX IF NOT EXISTS idx_participant_auth_tokens_email_org ON participant_auth_tokens(email, org_id);

COMMENT ON TABLE participant_auth_tokens IS 'Одноразовые токены для входа участников через email (magic link)';

-- 4. Trigger: updated_at для participant_email_invites
CREATE OR REPLACE FUNCTION update_participant_email_invites_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participant_email_invites_updated_at ON participant_email_invites;
CREATE TRIGGER trg_participant_email_invites_updated_at
  BEFORE UPDATE ON participant_email_invites
  FOR EACH ROW EXECUTE FUNCTION update_participant_email_invites_updated_at();
