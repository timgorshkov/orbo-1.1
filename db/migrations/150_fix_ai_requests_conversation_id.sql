-- Migration 150: Fix conversation_id column type in ai_requests
-- Date: 2025-12-15
-- Problem: conversation_id is UUID but client sends string like "conv_123_abc"
-- Solution: Change column type to TEXT

-- Change conversation_id from UUID to TEXT
ALTER TABLE ai_requests 
ALTER COLUMN conversation_id TYPE TEXT;

DO $$ BEGIN 
  RAISE NOTICE 'Migration 150: Changed ai_requests.conversation_id from UUID to TEXT'; 
END $$;

