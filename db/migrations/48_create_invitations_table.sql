-- Migration: Create invitations table
-- Created: 2025-10-19
-- Purpose: Store email invitations for new administrators

DO $$
BEGIN
  RAISE NOTICE 'Creating invitations table...';
END $$;

CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- 'admin' or 'member'
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'cancelled'
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_invitation_status CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  CONSTRAINT chk_invitation_role CHECK (role IN ('admin', 'member')),
  CONSTRAINT chk_invitation_expiry CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.invitations IS 'Stores email invitations for new team members';
COMMENT ON COLUMN public.invitations.token IS 'Unique token for the invitation link';
COMMENT ON COLUMN public.invitations.status IS 'Current status of the invitation';
COMMENT ON COLUMN public.invitations.invited_by IS 'User who sent the invitation';
COMMENT ON COLUMN public.invitations.accepted_by IS 'User who accepted the invitation (created account)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON public.invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON public.invitations(expires_at);

-- Composite index for finding active invitations for an org
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Filter by expires_at in queries instead
CREATE INDEX IF NOT EXISTS idx_invitations_org_status_active 
  ON public.invitations(org_id, status, expires_at) 
  WHERE status = 'pending';

DO $$
BEGIN
  RAISE NOTICE 'Successfully created invitations table';
END $$;

-- Function to automatically expire old invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.invitations
  SET 
    status = 'expired',
    updated_at = NOW()
  WHERE 
    status = 'pending'
    AND expires_at < NOW();
    
  RAISE NOTICE 'Expired old invitations';
END;
$$;

COMMENT ON FUNCTION expire_old_invitations() IS 'Automatically marks expired invitations';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_invitations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invitations_updated_at_trigger
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_invitations_updated_at();

DO $$
BEGIN
  RAISE NOTICE 'Invitations table setup complete';
END $$;

