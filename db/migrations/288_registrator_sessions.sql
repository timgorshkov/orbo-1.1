-- ═══════════════════════════════════════════════════════════════════
-- Migration 288: Registrator sessions for temporary event check-in staff
--
-- One invite link per org, multiple registrators can join via the same link.
-- Registrators can only confirm QR check-in — no other org access.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Invite links (one active per org)
CREATE TABLE IF NOT EXISTS public.registrator_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Only one active invite per org (enforced by partial unique index)
  CONSTRAINT registrator_invites_org_unique UNIQUE (org_id)
);

CREATE INDEX IF NOT EXISTS idx_registrator_invites_token ON public.registrator_invites(token) WHERE is_active = true;

-- 2. Registrator sessions (one per person)
CREATE TABLE IF NOT EXISTS public.registrator_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invite_id       UUID NOT NULL REFERENCES public.registrator_invites(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  session_secret  TEXT NOT NULL UNIQUE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrator_sessions_secret ON public.registrator_sessions(session_secret) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_registrator_sessions_org ON public.registrator_sessions(org_id) WHERE is_active = true;

COMMENT ON TABLE public.registrator_invites IS 'One invite link per org for temporary check-in staff';
COMMENT ON TABLE public.registrator_sessions IS 'Active sessions for registrators who joined via invite link';
