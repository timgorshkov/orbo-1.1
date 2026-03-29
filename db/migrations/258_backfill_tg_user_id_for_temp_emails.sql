-- Migration 258: Backfill tg_user_id on users for telegram_XXXXXXX@orbo.temp accounts
-- Created: 2026-03-29
-- Purpose: Users who registered via Telegram 6-digit code without an org context got
--          telegram_XXXXXXX@orbo.temp emails but their tg_user_id was never set on the
--          users table, making them show as "unverified Telegram" in the admin panel.

DO $$
DECLARE
  updated_count INT;
BEGIN
  -- Extract tg_user_id from email pattern telegram_<id>@orbo.temp
  UPDATE users
  SET tg_user_id = CAST(
    SUBSTRING(email FROM '^telegram_(\d+)@orbo\.temp$') AS BIGINT
  )
  WHERE
    email LIKE 'telegram\_%@orbo.temp' ESCAPE '\'
    AND tg_user_id IS NULL
    AND SUBSTRING(email FROM '^telegram_(\d+)@orbo\.temp$') IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled tg_user_id for % users with telegram_@orbo.temp emails', updated_count;
END $$;

-- Now create user_telegram_accounts records for these users who have org memberships
-- but no linked telegram account record yet
DO $$
DECLARE
  inserted_count INT;
BEGIN
  INSERT INTO user_telegram_accounts (user_id, org_id, telegram_user_id, is_verified, verified_at)
  SELECT DISTINCT
    u.id AS user_id,
    m.org_id,
    u.tg_user_id AS telegram_user_id,
    true AS is_verified,
    u.created_at AS verified_at
  FROM users u
  JOIN memberships m ON m.user_id = u.id
  WHERE
    u.tg_user_id IS NOT NULL
    AND u.email LIKE 'telegram\_%@orbo.temp' ESCAPE '\'
    AND NOT EXISTS (
      SELECT 1 FROM user_telegram_accounts uta
      WHERE uta.user_id = u.id AND uta.org_id = m.org_id
    )
  ON CONFLICT (user_id, org_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Created % user_telegram_accounts records for bot-registered users', inserted_count;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 258 completed: tg_user_id backfill and user_telegram_accounts sync done.';
END $$;
