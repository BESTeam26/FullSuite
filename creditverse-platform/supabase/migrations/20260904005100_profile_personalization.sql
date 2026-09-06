-- 0073 — Personal profiles, avatars, and birthday greetings
--
-- Asked for by Dee: a person is a person, not a login. Preferred name, phone,
-- birthday and a photo; the same for clients so their portal can greet them;
-- and birthday greetings as an automation an organization switches on.
--
-- Privacy decisions taken deliberately:
--   * The birthday is stored as month and day only. A greeting needs no year,
--     and a year of birth is an identity element we will not hold for staff.
--   * Each person controls whether their birthday is shown at all
--     (`birthday_visible`); the default is off, so nobody is opted in by us.
--   * Avatars live in a private bucket. The application signs a short-lived
--     URL to display one; the object is never world-readable.
--   * A client's date of birth on `fulfillment_clients` is the operational one
--     already used on dispute letters, so it keeps its year; the greeting
--     reads month and day from it and nothing else.

-- ---------------------------------------------------------------------------
-- 1. profiles: how a person is known and reached
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists preferred_name   text,
  add column if not exists phone            text,
  add column if not exists title            text,
  add column if not exists birth_month      smallint,
  add column if not exists birth_day        smallint,
  add column if not exists birthday_visible boolean not null default false,
  add column if not exists avatar_path      text;

alter table public.profiles
  add constraint profiles_preferred_name_len check (preferred_name is null or length(preferred_name) <= 60),
  add constraint profiles_phone_len          check (phone is null or length(phone) <= 40),
  add constraint profiles_title_len          check (title is null or length(title) <= 80),
  add constraint profiles_birth_month_range  check (birth_month is null or birth_month between 1 and 12),
  add constraint profiles_birth_day_range    check (birth_day is null or birth_day between 1 and 31),
  -- Both halves of a date or neither: a lone month cannot be greeted.
  add constraint profiles_birthday_complete  check ((birth_month is null) = (birth_day is null));

comment on column public.profiles.preferred_name is 'What this person is called day to day; falls back to the first word of full_name.';
comment on column public.profiles.birth_month is 'Month only — no year is stored for staff.';
comment on column public.profiles.avatar_path is 'Object path inside the private avatars bucket; the application signs a URL to display it.';

-- ---------------------------------------------------------------------------
-- 2. clients: the birthday their portal greeting reads
-- ---------------------------------------------------------------------------
alter table public.fulfillment_clients
  add column if not exists date_of_birth date,
  add column if not exists preferred_name text;

alter table public.fulfillment_clients
  add constraint fulfillment_clients_preferred_name_len check (preferred_name is null or length(preferred_name) <= 60);

comment on column public.fulfillment_clients.date_of_birth is 'Operational date of birth (letters already ask for it). Greetings read month and day only.';

-- ---------------------------------------------------------------------------
-- 3. avatars bucket — private; each person owns the folder named by their id
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Read: the owner, and anyone who already shares a scope with them (the same
-- rule that lets them see the profile row at all). Not the world.
drop policy if exists avatars_scope_select on storage.objects;
create policy avatars_scope_select on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.shares_scope_with(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- 4. organization automations (birthday greetings, and room for more)
-- ---------------------------------------------------------------------------
create table public.organization_automations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null check (key in ('birthday_greeting_team', 'birthday_greeting_client')),
  enabled         boolean not null default false,
  config          jsonb not null default '{}'::jsonb,
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, key)
);
create trigger organization_automations_updated_at before update on public.organization_automations
  for each row execute function public.set_updated_at();

alter table public.organization_automations enable row level security;

create policy organization_automations_select on public.organization_automations for select to authenticated
  using (public.is_org_member(organization_id) or public.can_view_org(organization_id));

create or replace function public.set_organization_automation(
  p_org uuid, p_key text, p_enabled boolean, p_config jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.member_can(p_org, 'settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select to_jsonb(a) into v_before from public.organization_automations a
   where a.organization_id = p_org and a.key = p_key;
  insert into public.organization_automations (organization_id, key, enabled, config, updated_by)
  values (p_org, p_key, p_enabled, coalesce(p_config, '{}'::jsonb), auth.uid())
  on conflict (organization_id, key) do update
    set enabled = excluded.enabled, config = excluded.config, updated_by = excluded.updated_by;
  perform public.log_audit('organization_automation.set', 'organization_automation', p_org::text || ':' || p_key, p_org,
                           v_before, jsonb_build_object('key', p_key, 'enabled', p_enabled, 'config', coalesce(p_config, '{}'::jsonb)));
end $$;
revoke all on function public.set_organization_automation(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.set_organization_automation(uuid, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Whose birthday is it — one answer, computed in the database
-- ---------------------------------------------------------------------------
-- Teammates of the caller, who chose to show their birthday. Month/day only,
-- no year, and no email or phone: this feeds a greeting, not a directory.
create or replace function public.team_birthdays(p_org uuid, p_within_days integer default 14)
returns table (user_id uuid, name text, avatar_path text, birth_month smallint, birth_day smallint, days_away integer)
language sql stable security definer set search_path = public as $$
  with people as (
    select p.id, coalesce(nullif(p.preferred_name, ''), p.full_name, split_part(p.email::text, '@', 1)) as name,
           p.avatar_path, p.birth_month, p.birth_day
    from public.profiles p
    join public.org_memberships m on m.user_id = p.id and m.organization_id = p_org
    where p.birthday_visible and p.birth_month is not null
  ), dated as (
    select id, name, avatar_path, birth_month, birth_day,
           -- This year's occurrence, rolled to next year once it has passed.
           case
             when make_date(extract(year from current_date)::int, birth_month, least(birth_day, 28)) >= current_date
               then make_date(extract(year from current_date)::int, birth_month, least(birth_day, 28))
             else make_date(extract(year from current_date)::int + 1, birth_month, least(birth_day, 28))
           end as next_on
    from people
  )
  select id, name, avatar_path, birth_month, birth_day, (next_on - current_date)::int
  from dated
  where public.is_org_member(p_org)
    and (next_on - current_date) <= greatest(coalesce(p_within_days, 14), 0)
  order by (next_on - current_date), name
$$;
revoke all on function public.team_birthdays(uuid, integer) from public, anon;
grant execute on function public.team_birthdays(uuid, integer) to authenticated;

-- Clients with a birthday coming up, for the team that works them. The
-- client's own portal greeting reads their own record, not this function.
create or replace function public.client_birthdays(p_org uuid, p_within_days integer default 14)
returns table (client_id uuid, name text, birth_month smallint, birth_day smallint, days_away integer)
language sql stable security definer set search_path = public as $$
  with people as (
    select c.id, coalesce(nullif(c.preferred_name, ''), c.name) as name,
           extract(month from c.date_of_birth)::smallint as bm,
           extract(day from c.date_of_birth)::smallint as bd
    from public.fulfillment_clients c
    where c.organization_id = p_org and c.date_of_birth is not null
      and public.credit_client_visible(c.id)
  ), dated as (
    select id, name, bm, bd,
           case
             when make_date(extract(year from current_date)::int, bm, least(bd, 28)) >= current_date
               then make_date(extract(year from current_date)::int, bm, least(bd, 28))
             else make_date(extract(year from current_date)::int + 1, bm, least(bd, 28))
           end as next_on
    from people
  )
  select id, name, bm, bd, (next_on - current_date)::int
  from dated
  where (next_on - current_date) <= greatest(coalesce(p_within_days, 14), 0)
  order by (next_on - current_date), name
$$;
revoke all on function public.client_birthdays(uuid, integer) from public, anon;
grant execute on function public.client_birthdays(uuid, integer) to authenticated;

revoke all on public.organization_automations from anon;
