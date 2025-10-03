create extension if not exists pgcrypto;

create table if not exists public.integration_connectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connector_id uuid not null references public.integration_connectors(id) on delete cascade,
  status text not null default 'draft',
  sync_mode text not null default 'manual',
  schedule_cron text,
  last_sync_at timestamptz,
  last_status text,
  credentials_encrypted text,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, connector_id)
);

create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error jsonb
);

create table if not exists public.integration_job_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.integration_jobs(id) on delete cascade,
  level text not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.participant_external_ids (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  system_code text not null,
  external_id text not null,
  url text,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(participant_id, system_code),
  unique(org_id, system_code, external_id)
);

create index if not exists integration_connections_org_idx on public.integration_connections (org_id);
create index if not exists integration_jobs_connection_idx on public.integration_jobs (connection_id, started_at desc);
create index if not exists participant_external_ids_participant_idx on public.participant_external_ids (participant_id);

insert into public.integration_connectors (code, name, description, category)
values
  ('getcourse', 'GetCourse', 'Импорт участников из платформы GetCourse', 'crm'),
  ('amocrm', 'AmoCRM', 'Экспорт контактов и сделок в AmoCRM', 'crm')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  updated_at = now();

