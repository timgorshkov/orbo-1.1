-- Create table for participant traits
create table if not exists public.participant_traits (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  trait_key text not null,
  trait_value text not null,
  value_type text default 'text',
  source text default 'manual',
  confidence numeric,
  metadata jsonb,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

create unique index if not exists participant_traits_unique_key_value
  on public.participant_traits (participant_id, trait_key, trait_value);

create index if not exists participant_traits_key_idx
  on public.participant_traits (participant_id, trait_key);

create index if not exists participant_traits_source_idx
  on public.participant_traits (source);

create index if not exists participant_traits_updated_at_idx
  on public.participant_traits (updated_at desc);

-- Ensure participants table has basic audit columns
alter table public.participants
  add column if not exists last_activity_at timestamptz,
  add column if not exists merged_into uuid references public.participants(id),
  add column if not exists traits_cache jsonb;

create index if not exists participants_merged_into_idx
  on public.participants (merged_into);

-- Helpers
create or replace function public.upsert_participant_trait(
  p_participant_id uuid,
  p_trait_key text,
  p_trait_value text,
  p_value_type text default 'text',
  p_source text default 'manual',
  p_confidence numeric default null,
  p_metadata jsonb default null,
  p_user_id uuid default null
) returns public.participant_traits
language plpgsql
as $$
  declare
    v_trait public.participant_traits;
  begin
    insert into public.participant_traits (
      participant_id,
      trait_key,
      trait_value,
      value_type,
      source,
      confidence,
      metadata,
      created_by,
      updated_by
    ) values (
      p_participant_id,
      p_trait_key,
      p_trait_value,
      coalesce(p_value_type, 'text'),
      coalesce(p_source, 'manual'),
      p_confidence,
      p_metadata,
      p_user_id,
      p_user_id
    )
    on conflict (participant_id, trait_key, trait_value)
    do update set
      value_type = excluded.value_type,
      source = excluded.source,
      confidence = excluded.confidence,
      metadata = excluded.metadata,
      updated_at = now(),
      updated_by = excluded.updated_by
    returning * into v_trait;

    return v_trait;
  end;
$$;

create or replace function public.merge_participants(
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

    update public.participant_groups
    set participant_id = p_target
    where participant_id = any(p_duplicates)
      and not exists (
        select 1
        from public.participant_groups pg2
        where pg2.participant_id = p_target
          and pg2.tg_group_id = public.participant_groups.tg_group_id
      );

    update public.participant_traits pt
    set participant_id = p_target,
        updated_at = now(),
        updated_by = p_actor
    where participant_id = any(p_duplicates)
      and not exists (
        select 1
        from public.participant_traits existing
        where existing.participant_id = p_target
          and existing.trait_key = pt.trait_key
          and existing.trait_value = pt.trait_value
      );

    delete from public.participant_traits pt
    where participant_id = any(p_duplicates);

    update public.activity_events
    set participant_id = p_target
    where participant_id = any(p_duplicates);

    update public.participants
    set merged_into = p_target,
        last_activity_at = greatest(public.participants.last_activity_at, now())
    where id = any(p_duplicates);

  end;
$$;

-- Simple view for listing traits per participant
create or replace view public.v_participant_traits as
select
  pt.id,
  pt.participant_id,
  pt.trait_key,
  pt.trait_value,
  pt.value_type,
  pt.source,
  pt.confidence,
  pt.metadata,
  pt.created_at,
  pt.updated_at
from public.participant_traits pt;
