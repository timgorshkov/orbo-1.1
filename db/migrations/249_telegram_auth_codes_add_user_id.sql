-- Migration 249: add user_id to telegram_auth_codes
--
-- Allows associating an auth code with an already-logged-in user
-- (e.g. email-registered user linking Telegram on the welcome screen).
-- When user_id is set on the code, verifyTelegramAuthCode updates that
-- user's tg_user_id directly instead of looking up by telegram_user_id.
-- Nullable: codes without user_id continue to work as before (TG-only registration).

ALTER TABLE telegram_auth_codes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
