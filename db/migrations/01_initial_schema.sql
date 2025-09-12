-- Организации
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  plan text default 'free'
);

-- Пользователи (auth.users — от Supabase). Привязки к оргам:
create table public.memberships (
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner','admin','member','viewer')) not null default 'member',
  primary key (org_id, user_id),
  created_at timestamptz default now()
);

-- Telegram-группы, подключенные к организации
create table public.telegram_groups (
  id bigserial primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  tg_chat_id bigint not null unique,
  title text,
  invite_link text,
  bot_status text, -- 'pending'|'connected'|'error'
  last_sync_at timestamptz
);

-- Участники (могут быть не пользователями Supabase)
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  tg_user_id bigint,
  username text,
  full_name text,
  phone text,
  email text,
  interests text[],
  created_at timestamptz default now()
);

-- Связи участник <-> телеграм-группа
create table public.participant_groups (
  participant_id uuid references public.participants(id) on delete cascade,
  tg_group_id bigint references public.telegram_groups(tg_chat_id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key (participant_id, tg_group_id)
);

-- События активности (минимально для дашборда)
create table public.activity_events (
  id bigserial primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  type text check (type in ('join','leave','message','checkin')),
  participant_id uuid references public.participants(id),
  tg_group_id bigint,
  meta jsonb,
  created_at timestamptz default now()
);

-- Материалы (простая иерархия)
create table public.material_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  parent_id uuid references public.material_folders(id),
  name text not null,
  created_at timestamptz default now()
);

create table public.material_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  folder_id uuid references public.material_folders(id) on delete set null,
  kind text check (kind in ('doc','file','link')) not null,
  title text not null,
  content text,      -- для kind='doc'
  file_path text,    -- для kind='file' (Supabase Storage path)
  url text,          -- для kind='link'
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Доступы на материалы (по группам и/или точечно по участникам)
create table public.material_access (
  id bigserial primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  item_id uuid references public.material_items(id) on delete cascade,
  tg_group_id bigint,             -- если доступ для всей TG-группы
  participant_id uuid,            -- если точечный доступ
  unique (item_id, tg_group_id, participant_id)
);

-- События (ивенты)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  visibility text check (visibility in ('public','members')) default 'members',
  calendar_url text, -- сгенерированный .ics или deeplink
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Билеты/регистрация на событие
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  status text check (status in ('invited','registered','checked_in')) default 'registered',
  qr_token text unique not null, -- одноразовый/временной токен для чек-ина
  created_at timestamptz default now()
);

-- Включаем RLS
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.telegram_groups enable row level security;
alter table public.participants enable row level security;
alter table public.participant_groups enable row level security;
alter table public.activity_events enable row level security;
alter table public.material_folders enable row level security;
alter table public.material_items enable row level security;
alter table public.material_access enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;

-- Хелпер: функция проверки членства
create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = auth.uid()
  )
$$;

-- RPC функция для проверки членства
create or replace function public.is_org_member_rpc(_org uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = auth.uid()
  );
$$;

-- Примеры политик (аналогично для остальных таблиц):
create policy org_read on public.telegram_groups
for select using (public.is_org_member(org_id));

create policy org_crud_admin on public.telegram_groups
for all using (public.is_org_member(org_id))
with check (
  exists (select 1 from public.memberships 
          where org_id = telegram_groups.org_id 
            and user_id = auth.uid() 
            and role in ('owner','admin'))
);

-- Функция для дашборда
create or replace function public.org_dashboard_stats(_org uuid)
returns json language sql stable security definer as $$
  with totals as (
    select
      (select count(*) from participants p where p.org_id = _org) as total_participants,
      (select count(*) from activity_events e where e.org_id = _org and e.type='join' and e.created_at >= now() - interval '7 days') as new_7d,
      (select count(*) from activity_events e where e.org_id = _org and e.type='leave' and e.created_at >= now() - interval '7 days') as left_7d
  )
  select to_json(totals) from totals;
$$;

-- Добавляем индексы
create index on public.participants (org_id);
create index on public.participants (tg_user_id);
create index on public.activity_events (org_id, created_at);
create index on public.activity_events (org_id, type);
create index on public.material_items (org_id, created_at);
create index on public.events (org_id, starts_at);
