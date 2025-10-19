-- Migration 50: Add timestamps to telegram_group_admins if missing
-- Some installations might have the table without these columns

DO $$
BEGIN
  -- Add created_at if missing
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'telegram_group_admins' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE telegram_group_admins ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added created_at column to telegram_group_admins';
  ELSE
    RAISE NOTICE 'Column created_at already exists in telegram_group_admins';
  END IF;
  
  -- Add updated_at if missing
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'telegram_group_admins' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE telegram_group_admins ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added updated_at column to telegram_group_admins';
  ELSE
    RAISE NOTICE 'Column updated_at already exists in telegram_group_admins';
  END IF;
END $$;

-- Ensure the trigger function exists
CREATE OR REPLACE FUNCTION update_telegram_group_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS telegram_group_admins_updated_at ON telegram_group_admins;
CREATE TRIGGER telegram_group_admins_updated_at
  BEFORE UPDATE ON telegram_group_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_group_admins_updated_at();

DO $$
BEGIN
  RAISE NOTICE 'Migration 50: telegram_group_admins timestamps are ready';
END $$;

