-- Fix: Ensure telegram_auth_codes table has all required columns
-- This migration checks and adds missing columns if needed

-- Check if table exists, if not create it
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'telegram_auth_codes') THEN
    -- Create table with all columns
    CREATE TABLE telegram_auth_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(10) UNIQUE NOT NULL,
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      event_id UUID REFERENCES events(id) ON DELETE CASCADE,
      redirect_url TEXT,
      
      -- Status
      is_used BOOLEAN DEFAULT FALSE,
      used_at TIMESTAMPTZ,
      
      -- User data after use
      telegram_user_id BIGINT,
      telegram_username TEXT,
      
      -- Metadata
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      
      CONSTRAINT unique_code UNIQUE(code)
    );

    -- Indexes
    CREATE INDEX idx_telegram_auth_codes_code ON telegram_auth_codes(code) WHERE is_used = FALSE;
    CREATE INDEX idx_telegram_auth_codes_expires_at ON telegram_auth_codes(expires_at);
    CREATE INDEX idx_telegram_auth_codes_org_id ON telegram_auth_codes(org_id);
    CREATE INDEX idx_telegram_auth_codes_event_id ON telegram_auth_codes(event_id);
    CREATE INDEX idx_telegram_auth_codes_telegram_user_id ON telegram_auth_codes(telegram_user_id);

    -- RLS
    ALTER TABLE telegram_auth_codes ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Service role can manage auth codes" ON telegram_auth_codes
      FOR ALL
      USING (true)
      WITH CHECK (true);

    RAISE NOTICE 'Created telegram_auth_codes table';
  ELSE
    -- Table exists, check and add missing columns
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'telegram_auth_codes' 
                   AND column_name = 'ip_address') THEN
      ALTER TABLE telegram_auth_codes ADD COLUMN ip_address TEXT;
      RAISE NOTICE 'Added ip_address column';
    END IF;

    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'telegram_auth_codes' 
                   AND column_name = 'user_agent') THEN
      ALTER TABLE telegram_auth_codes ADD COLUMN user_agent TEXT;
      RAISE NOTICE 'Added user_agent column';
    END IF;

    RAISE NOTICE 'telegram_auth_codes table updated';
  END IF;
END $$;

-- Cleanup function (idempotent)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_codes()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_auth_codes
  WHERE expires_at < NOW()
  OR (is_used = TRUE AND used_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

