-- Add archived support to telegram_groups

alter table public.telegram_groups
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

update public.telegram_groups
  set is_archived = coalesce(is_archived, false)
where is_archived is distinct from false or is_archived is null;

create index if not exists telegram_groups_is_archived_idx
  on public.telegram_groups (is_archived);

