-- Mapping table to allow the same Telegram group (tg_chat_id) to be linked to multiple organizations
create table if not exists public.org_telegram_groups (
  org_id uuid not null references public.organizations(id) on delete cascade,
  tg_chat_id bigint not null references public.telegram_groups(tg_chat_id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  primary key (org_id, tg_chat_id)
);

-- Helpful index for reverse lookups
create index if not exists org_telegram_groups_tg_chat_id_idx on public.org_telegram_groups (tg_chat_id);

-- RLS
alter table public.org_telegram_groups enable row level security;

-- Allow members to read mappings of their org
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'org_telegram_groups'
      and policyname = 'org_telegram_groups_read'
  ) then
    create policy org_telegram_groups_read on public.org_telegram_groups
      for select using (
        public.is_org_member(org_id)
      );
  end if;
end$$;

-- Allow admins/owners to add mappings for their org
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'org_telegram_groups'
      and policyname = 'org_telegram_groups_write'
  ) then
    create policy org_telegram_groups_write on public.org_telegram_groups
      for insert with check (
        exists (
          select 1 from public.memberships m
          where m.org_id = org_telegram_groups.org_id
            and m.user_id = auth.uid()
            and m.role in ('owner','admin')
        )
      );
  end if;
end$$;

