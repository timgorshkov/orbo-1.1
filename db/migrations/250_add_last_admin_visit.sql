-- Track the last time an owner or admin visited the org admin interface.
-- Updated (at most once per hour) from the org layout server component.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS last_admin_visit_at timestamptz;
