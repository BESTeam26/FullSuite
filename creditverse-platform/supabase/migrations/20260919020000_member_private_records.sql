-- Private HR record for a staff member (Dee, 2026-09-19): "internally we keep
-- their year of date of birth, we need to know if our agents are under age or
-- overage."
--
-- This supersedes the 0073 decision to hold month and day only. The full date
-- is an identity element, so it does NOT live on `profiles` (readable by every
-- colleague for names and photos). It lives here, on a row only the person and
-- management in scope may read, and only management may set. Team leads are
-- not management: they see the person's work, not their papers.
--
-- The same protected row carries the other roster facts with the same
-- sensitivity — home address, working location, WhatsApp, emergency contact.
-- They are nullable and unused until filled; one table, not one per field.
--
-- Age is never stored. It is derived from the date at the moment it is asked
-- (lib/people/age.ts), so it cannot go stale.
--
-- profiles.birth_month / birth_day remain the greeting fields (the person may
-- hide them). Once a date of birth exists they are a PROJECTION of it, kept in
-- step by trigger — one truth, two shapes.

create table if not exists public.member_private_records (
  user_id                         uuid primary key references public.profiles(id) on delete cascade,
  agency_id                       uuid not null references public.agencies(id) on delete cascade,
  date_of_birth                   date,
  home_address                    text,
  working_location                text,
  whatsapp_phone                  text,
  emergency_contact_name          text,
  emergency_contact_relationship  text,
  emergency_contact_phone         text,
  updated_at                      timestamptz not null default now(),
  updated_by                      uuid references public.profiles(id) on delete set null
);
comment on table public.member_private_records is
  'Private HR facts about a staff member: full date of birth (for age verification), address, WhatsApp, emergency contact. Self and management in scope read; management sets the date of birth.';

alter table public.member_private_records enable row level security;
revoke all on public.member_private_records from public, anon;
grant select, insert, update on public.member_private_records to authenticated;

-- Management in scope of the person, and not merely a lead: is_manager_of AND
-- may_view_workforce_record. Self is excluded here on purpose — a person may
-- read their record but not certify their own date of birth.
create or replace function public.manages_private_record_of(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.agency_memberships m
     where m.user_id = p_user and m.status in ('active', 'inactive')
       and public.is_manager_of(m.agency_id)
       and public.may_view_workforce_record(m.agency_id, p_user))
$function$;
revoke all on function public.manages_private_record_of(uuid) from public, anon;
grant execute on function public.manages_private_record_of(uuid) to authenticated;

drop policy if exists member_private_records_select on public.member_private_records;
create policy member_private_records_select on public.member_private_records
  for select to authenticated
  using (user_id = auth.uid() or public.manages_private_record_of(user_id));

-- The person may keep their own address, WhatsApp and emergency contact
-- current; management may write everything. The trigger below is what keeps
-- the date of birth out of the person's own hands.
drop policy if exists member_private_records_insert on public.member_private_records;
create policy member_private_records_insert on public.member_private_records
  for insert to authenticated
  with check ((user_id = auth.uid() or public.manages_private_record_of(user_id))
              and public.is_staff_of(agency_id));
drop policy if exists member_private_records_update on public.member_private_records;
create policy member_private_records_update on public.member_private_records
  for update to authenticated
  using (user_id = auth.uid() or public.manages_private_record_of(user_id))
  with check (user_id = auth.uid() or public.manages_private_record_of(user_id));

create or replace function public.member_private_records_guard() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text; v_old date;
begin
  v_old := case when tg_op = 'UPDATE' then old.date_of_birth else null end;
  if new.date_of_birth is distinct from v_old then
    if not public.manages_private_record_of(new.user_id) then
      raise exception 'The date of birth is recorded by management, not by the person' using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (new.agency_id, 'profile', new.user_id::text, auth.uid(), v_actor, 'Date of birth recorded', 'date_of_birth',
            v_old::text, new.date_of_birth::text, 'bes_internal');
    -- The greeting fields follow the date: one truth.
    update public.profiles
       set birth_month = extract(month from new.date_of_birth)::smallint,
           birth_day   = extract(day from new.date_of_birth)::smallint
     where id = new.user_id and new.date_of_birth is not null;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $function$;
drop trigger if exists member_private_records_guard on public.member_private_records;
create trigger member_private_records_guard before insert or update on public.member_private_records
  for each row execute function public.member_private_records_guard();

-- A profile edit by the person must not quietly contradict a recorded date.
create or replace function public.profiles_birthday_follows_record() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_dob date;
begin
  select date_of_birth into v_dob from public.member_private_records where user_id = new.id;
  if v_dob is not null then
    new.birth_month := extract(month from v_dob)::smallint;
    new.birth_day   := extract(day from v_dob)::smallint;
  end if;
  return new;
end $function$;
drop trigger if exists profiles_birthday_follows_record on public.profiles;
create trigger profiles_birthday_follows_record before update of birth_month, birth_day on public.profiles
  for each row execute function public.profiles_birthday_follows_record();
