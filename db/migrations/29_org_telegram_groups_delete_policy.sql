-- Add DELETE policy for org_telegram_groups
-- Allow admins/owners to delete (unlink) mappings for their org

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'org_telegram_groups'
      and policyname = 'org_telegram_groups_delete'
  ) then
    create policy org_telegram_groups_delete on public.org_telegram_groups
      for delete using (
        exists (
          select 1 from public.memberships m
          where m.org_id = org_telegram_groups.org_id
            and m.user_id = auth.uid()
            and m.role in ('owner','admin')
        )
      );
  end if;
end$$;

