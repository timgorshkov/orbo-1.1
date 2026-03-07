-- Fix created_by FK constraints to reference users(id) instead of profiles(id)
-- The project migrated from Supabase (where profiles was primary) to PostgreSQL (where users is primary).
-- Some users don't have a profiles row, causing FK violations when adding channels/groups.

-- org_telegram_channels.created_by
ALTER TABLE org_telegram_channels
  DROP CONSTRAINT IF EXISTS org_telegram_channels_created_by_fkey;

ALTER TABLE org_telegram_channels
  ADD CONSTRAINT org_telegram_channels_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- org_max_groups.created_by
ALTER TABLE org_max_groups
  DROP CONSTRAINT IF EXISTS org_max_groups_created_by_fkey;

ALTER TABLE org_max_groups
  ADD CONSTRAINT org_max_groups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
