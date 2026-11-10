create table if not exists public.properties (
  id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.properties enable row level security;

drop policy if exists "depas_users_can_access_properties" on public.properties;
drop policy if exists "public_access_properties" on public.properties;
drop function if exists public.is_depas_user();
drop table if exists public.allowed_users;

revoke all on public.properties from authenticated;
grant select, insert, update, delete on public.properties to anon;

create policy "public_access_properties"
on public.properties
for all
to anon
using (true)
with check (true);

create or replace function public.replace_all_properties(p_properties jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_properties) is distinct from 'array' then
    raise exception 'Properties must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_properties) as entries(item)
    where jsonb_typeof(item) is distinct from 'object'
       or item ->> 'id' is null
  ) then
    raise exception 'Every property must be an object with an id';
  end if;

  delete from public.properties;

  insert into public.properties (id, data, updated_at)
  select (item ->> 'id')::uuid, item, now()
  from jsonb_array_elements(p_properties) as entries(item);
end;
$$;

revoke all on function public.replace_all_properties(jsonb) from public;
revoke all on function public.replace_all_properties(jsonb) from authenticated;
grant execute on function public.replace_all_properties(jsonb) to anon;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'properties'
  ) then
    alter publication supabase_realtime add table public.properties;
  end if;
end;
$$;
