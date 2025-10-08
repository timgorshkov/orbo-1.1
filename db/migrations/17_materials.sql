create table if not exists public.material_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.material_pages(id) on delete cascade,
  title text not null,
  slug text,
  content_md text not null default '',
  content_draft_md text,
  content_json jsonb,
  visibility text not null default 'org_members',
  is_published boolean not null default true,
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_pages_visibility_check check (visibility in ('org_members', 'admins_only')),
  constraint material_pages_slug_unique unique (org_id, slug)
);

create index if not exists material_pages_org_parent_idx on public.material_pages (org_id, parent_id, position);
create index if not exists material_pages_org_visibility_idx on public.material_pages (org_id, visibility, is_published);

create table if not exists public.material_page_history (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.material_pages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null,
  content_md text not null,
  editor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  meta jsonb,
  constraint material_page_history_version_unique unique (page_id, version)
);

create table if not exists public.material_page_locks (
  page_id uuid primary key references public.material_pages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  locked_by uuid references auth.users(id) on delete cascade,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint material_page_locks_future_expiry check (expires_at > locked_at)
);

create table if not exists public.material_search_index (
  page_id uuid primary key references public.material_pages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  content_ts tsvector not null
);

create or replace function public.material_pages_set_position()
returns trigger as $$
begin
  if new.position = 0 then
    select coalesce(max(position), 0) + 1 into new.position
    from public.material_pages
    where org_id = new.org_id
      and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(new.parent_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.material_pages_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.material_search_index_refresh()
returns trigger as $$
declare
  new_content text;
begin
  if tg_op = 'DELETE' then
    delete from public.material_search_index where page_id = old.id;
    return old;
  end if;

  new_content := coalesce(new.content_md, '');

  insert into public.material_search_index (page_id, org_id, title, content_ts)
  values (new.id, new.org_id, new.title, to_tsvector('russian', coalesce(new.title, '') || ' ' || new_content))
  on conflict (page_id) do update
    set title = excluded.title,
        content_ts = excluded.content_ts;

  return new;
end;
$$ language plpgsql;

drop trigger if exists material_pages_position_trigger on public.material_pages;
create trigger material_pages_position_trigger
before insert on public.material_pages
for each row execute function public.material_pages_set_position();

drop trigger if exists material_pages_touch_trigger on public.material_pages;
create trigger material_pages_touch_trigger
before update on public.material_pages
for each row execute function public.material_pages_touch_updated_at();

drop trigger if exists material_search_index_trigger on public.material_pages;
create trigger material_search_index_trigger
after insert or update or delete on public.material_pages
for each row execute function public.material_search_index_refresh();

-- seed root page
insert into public.material_pages (org_id, parent_id, title, slug, content_md, is_published, position)
select o.id,
       null,
       'Как начать работу',
       'getting-started',
       '# Как начать работу\n\nДобро пожаловать! Заполните это руководство, чтобы объяснить команде, как пользоваться разделом «Материалы».',
       true,
       1
from public.organizations o
where not exists (
  select 1 from public.material_pages mp where mp.org_id = o.id and mp.parent_id is null
);

