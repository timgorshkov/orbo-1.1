-- 268: Add FK constraint on memberships.user_id → users.id
-- Prevents creating memberships for non-existent users (ghost orgs)

ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
