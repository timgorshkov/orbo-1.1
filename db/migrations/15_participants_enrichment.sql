-- Migration: enrich participants schema and support duplicate detection
-- Run with supabase db push or psql

-- Ensure pg_trgm is available (used later for similarity searches)
create extension if not exists pg_trgm;

-- Add new columns to participants
alter table public.participants
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists source text default 'unknown',
  add column if not exists status text default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists notes text;

-- Ensure updated_at column and trigger exist
alter table public.participants
  add column if not exists updated_at timestamptz default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_participants_updated_at
before update on public.participants
for each row
when (old.* is distinct from new.*)
execute function public.set_updated_at();

-- Add helpful indexes
create index if not exists participants_org_source_idx on public.participants (org_id, source);
create index if not exists participants_phone_idx on public.participants (org_id, phone);
create index if not exists participants_email_idx on public.participants (org_id, email);
create index if not exists participants_full_name_trgm_idx on public.participants using gin ((coalesce(full_name, '') || ' ' || coalesce(username, '')) gin_trgm_ops);

-- Participant duplicates table
create table if not exists public.participant_duplicates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  duplicate_participant_id uuid not null references public.participants(id) on delete cascade,
  match_reason text not null,
  similarity numeric,
  status text default 'pending',
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id),
  resolved_by uuid references auth.users(id)
);

create index if not exists participant_duplicates_org_status_idx
  on public.participant_duplicates (org_id, status, similarity desc);

create index if not exists participant_duplicates_participant_idx
  on public.participant_duplicates (participant_id);

create or replace function public.set_participant_duplicates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_participant_duplicates_updated_at
before update on public.participant_duplicates
for each row
when (old.* is distinct from new.*)
execute function public.set_participant_duplicates_updated_at();

-- Helper view for enriched participants
create or replace view public.v_participants_enriched as
select
  p.id,
  p.org_id,
  p.full_name,
  p.first_name,
  p.last_name,
  p.username,
  p.tg_user_id,
  p.email,
  p.phone,
  p.source,
  p.status,
  p.created_at,
  p.updated_at,
  p.last_activity_at,
  p.activity_score,
  p.risk_score,
  p.notes,
  jsonb_agg(distinct pe.*) filter (where pe.participant_id is not null) as external_ids
from public.participants p
left join public.participant_external_ids pe on pe.participant_id = p.id
where coalesce(p.status, 'active') <> 'deleted'
group by p.id;

-- Update merge helper to mark duplicates
create or replace function public.merge_participants_extended(
  p_target uuid,
  p_duplicates uuid[],
  p_actor uuid default null
) returns void
language plpgsql
as $$
begin
  if array_length(p_duplicates, 1) is null then
    return;
  end if;

  -- Re-use existing merge logic for relations
  perform public.merge_participants(p_target, p_duplicates, p_actor);

  -- Mark duplicates as merged
  update public.participants
  set status = 'merged',
      merged_into = p_target,
      updated_at = now(),
      updated_by = p_actor
  where id = any(p_duplicates);

  update public.participant_duplicates
  set status = 'merged',
      resolved_by = p_actor,
      updated_at = now()
  where duplicate_participant_id = any(p_duplicates)
     or participant_id = any(p_duplicates);
end;
$$;
