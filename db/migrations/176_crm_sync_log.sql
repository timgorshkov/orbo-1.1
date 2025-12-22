-- Migration: CRM Sync Log Table
-- Description: Store mapping between Orbo users and Weeek CRM entities

-- Create CRM sync log table
CREATE TABLE IF NOT EXISTS public.crm_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Weeek CRM IDs
    weeek_contact_id TEXT,
    weeek_deal_id TEXT,
    
    -- Cached data for reference
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    org_name TEXT,
    telegram_username TEXT,
    qualification_responses JSONB,
    
    -- Timestamps
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint - one CRM record per user
    CONSTRAINT crm_sync_log_user_id_unique UNIQUE (user_id)
);

-- Add comment
COMMENT ON TABLE public.crm_sync_log IS 'Mapping between Orbo users and Weeek CRM contacts/deals';

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_user_id ON public.crm_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_weeek_contact_id ON public.crm_sync_log(weeek_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_weeek_deal_id ON public.crm_sync_log(weeek_deal_id);

-- Enable RLS
ALTER TABLE public.crm_sync_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access
CREATE POLICY "Service role full access to crm_sync_log"
ON public.crm_sync_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_crm_sync_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_crm_sync_log_updated_at ON public.crm_sync_log;
CREATE TRIGGER trg_update_crm_sync_log_updated_at
    BEFORE UPDATE ON public.crm_sync_log
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_sync_log_updated_at();

-- Grant permissions
GRANT ALL ON public.crm_sync_log TO service_role;
GRANT SELECT ON public.crm_sync_log TO authenticated;

