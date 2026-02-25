-- Add retry_count to onboarding_messages for transient error retry logic
ALTER TABLE onboarding_messages ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
