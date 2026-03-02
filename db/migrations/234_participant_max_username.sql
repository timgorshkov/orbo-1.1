-- Add max_username column to participants for storing MAX usernames
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'participants' AND column_name = 'max_username'
    ) THEN
        ALTER TABLE participants ADD COLUMN max_username TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_participants_max_username ON participants(max_username) WHERE max_username IS NOT NULL;
