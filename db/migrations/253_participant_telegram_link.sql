-- Migration 253: participant_id on telegram_auth_codes
-- Allows participants (non-NextAuth users) to link their Telegram via 6-digit code.
-- Unlike user_id (for admin group-sync), participant_id links the code to a community member.

ALTER TABLE telegram_auth_codes
  ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_auth_codes_participant ON telegram_auth_codes(participant_id)
  WHERE participant_id IS NOT NULL;

COMMENT ON COLUMN telegram_auth_codes.participant_id IS
  'Set when a community participant (participant_session user) generates a code to link their Telegram identity to their participant profile. Mutually exclusive with user_id in practice.';
