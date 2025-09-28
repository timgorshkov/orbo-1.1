-- Add status tracking for org_telegram_groups mappings

alter table public.org_telegram_groups
  add column if not exists status text not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

-- Ensure all existing rows default to active
update public.org_telegram_groups
  set status = coalesce(status, 'active')
where status is distinct from 'active' or status is null;

create index if not exists org_telegram_groups_status_idx
  on public.org_telegram_groups (status);

create index if not exists org_telegram_groups_archived_at_idx
  on public.org_telegram_groups (archived_at);

