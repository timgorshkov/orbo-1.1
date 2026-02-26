-- Track when we last checked Telegram for a participant's profile photo
-- to avoid spamming Telegram API for users with privacy-restricted photos
ALTER TABLE participants ADD COLUMN IF NOT EXISTS photo_checked_at TIMESTAMPTZ;
