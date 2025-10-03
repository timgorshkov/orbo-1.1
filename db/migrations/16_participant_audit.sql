create table if not exists public.participant_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  identity_id uuid null,
  actor_id uuid null,
  actor_type text not null default 'system',
  source text not null,
  action text not null,
  field_changes jsonb null,
  message text null,
  integration_job_id uuid null references public.integration_jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists participant_audit_log_org_participant_idx
  on public.participant_audit_log (org_id, participant_id, created_at desc);

create index if not exists participant_audit_log_source_idx
  on public.participant_audit_log (source);

create index if not exists participant_audit_log_integration_idx
  on public.participant_audit_log (integration_job_id);

comment on table public.participant_audit_log is 'История изменений участников (ручные правки, синхронизации, слияния)';

