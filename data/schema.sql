create table if not exists public.allowed_users (
  email text primary key
);

alter table public.allowed_users enable row level security;

create table if not exists public.properties (
  id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.properties enable row level security;
grant select, insert, update, delete on public.properties to authenticated;

create or replace function public.is_depas_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_depas_user() from public;
grant execute on function public.is_depas_user() to authenticated;

drop policy if exists "depas_users_can_access_properties" on public.properties;
create policy "depas_users_can_access_properties"
on public.properties
for all
to authenticated
using ((select public.is_depas_user()))
with check ((select public.is_depas_user()));

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
    from jsonb_array_elements(p_properties) as item
    where jsonb_typeof(item) is distinct from 'object'
       or item ->> 'id' is null
  ) then
    raise exception 'Every property must be an object with an id';
  end if;

  delete from public.properties;

  insert into public.properties (id, data, updated_at)
  select (item ->> 'id')::uuid, item, now()
  from jsonb_array_elements(p_properties) as item;
end;
$$;

revoke all on function public.replace_all_properties(jsonb) from public;
grant execute on function public.replace_all_properties(jsonb) to authenticated;
