-- Migration 141: Create whatsapp_imports table for import history
-- Tracks WhatsApp chat imports with statistics

CREATE TABLE IF NOT EXISTS whatsapp_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Import metadata
  file_name TEXT NOT NULL,
  group_name TEXT,
  import_status TEXT DEFAULT 'completed' CHECK (import_status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Statistics
  messages_total INT DEFAULT 0,
  messages_imported INT DEFAULT 0,
  messages_duplicates INT DEFAULT 0,
  participants_total INT DEFAULT 0,
  participants_created INT DEFAULT 0,
  participants_existing INT DEFAULT 0,
  
  -- Date range of imported messages
  date_range_start TIMESTAMP WITH TIME ZONE,
  date_range_end TIMESTAMP WITH TIME ZONE,
  
  -- Error info
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX idx_whatsapp_imports_org_id ON whatsapp_imports(org_id);
CREATE INDEX idx_whatsapp_imports_created_at ON whatsapp_imports(created_at DESC);

-- RLS
ALTER TABLE whatsapp_imports ENABLE ROW LEVEL SECURITY;

-- Policy: admins can view their org's imports
CREATE POLICY "Admins can view org imports"
  ON whatsapp_imports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = whatsapp_imports.org_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- Policy: service role full access
CREATE POLICY "Service role full access"
  ON whatsapp_imports
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE whatsapp_imports IS 'Tracks WhatsApp chat import history with statistics';

