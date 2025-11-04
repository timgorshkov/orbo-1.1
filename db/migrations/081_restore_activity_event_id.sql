-- Migration 081: Restore activity_event_id column to participant_messages
-- Date: Nov 4, 2025
-- Purpose: Restore the link between participant_messages and activity_events
--          This column was removed in migration 071 but is needed for message storage unification

-- Add the column back
ALTER TABLE participant_messages 
ADD COLUMN IF NOT EXISTS activity_event_id INTEGER REFERENCES activity_events(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_participant_messages_activity_event 
ON participant_messages(activity_event_id);

-- Comment
COMMENT ON COLUMN participant_messages.activity_event_id IS 'Links to the activity event that created this message record. Restored in migration 081.';

DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 081 Complete: Restored activity_event_id column to participant_messages'; 
END $$;

