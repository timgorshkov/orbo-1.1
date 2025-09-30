-- Create table for global Telegram identities
create table if not exists public.telegram_identities (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  language_code text,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists telegram_identities_username_idx on public.telegram_identities using gin ((lower(coalesce(username, ''))) gin_trgm_ops);

-- Link participants to identities
alter table public.participants
  add column if not exists identity_id uuid references public.telegram_identities(id) on delete set null;

-- Backfill telegram_identities from existing participants
insert into public.telegram_identities (tg_user_id, username, first_name, last_name)
select distinct p.tg_user_id, p.username, null, null
from public.participants p
where p.tg_user_id is not null
  and not exists (
    select 1
    from public.telegram_identities ti
    where ti.tg_user_id = p.tg_user_id
  );

update public.participants p
set identity_id = ti.id
from public.telegram_identities ti
where p.tg_user_id is not null
  and ti.tg_user_id = p.tg_user_id
  and coalesce(p.identity_id, '00000000-0000-0000-0000-000000000000') <> ti.id;

create unique index if not exists participants_org_identity_unique
  on public.participants (org_id, identity_id)
  where identity_id is not null;
