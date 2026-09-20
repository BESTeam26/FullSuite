-- AGENT ID, the canonical format (Dee, 2026-09-20, permanent before launch):
--
--     [FIRST INITIAL][LAST INITIAL][MMDDYY]-[SEQUENCE]        DG010116-001
--
-- Two things change from the 092026 format.
--
-- 1. The date is the exact HIRE DATE, MMDDYY — not the month and year.
-- 2. The sequence is a PERMANENT agent number, held in its own column. It is
--    allocated once, never recalculated from roster order, and never reused —
--    not even after somebody leaves. The old sequence was a live count of who
--    came before you, so correcting one person's hire date renumbered others.
--    That is exactly what an identifier must not do.
--
-- Nothing else moves it: name, team, department, position, manager, rehiring.
-- Only the canonical owner may override it, still audited (000100/017000).
-- No hire date means NO invented one: the code is null and the person is a
-- setup exception until Dee supplies the real date.

alter table public.agency_memberships add column if not exists agent_number integer;
comment on column public.agency_memberships.agent_number is
  'The permanent agent number in the Agent ID. Allocated once, never reused, never recalculated. Real people from 1; fixtures from 900.';
create unique index if not exists agency_memberships_agent_number_idx
  on public.agency_memberships (agency_id, agent_number) where agent_number is not null;

/** The next free number: real people from 1, fixtures out of their way. */
create or replace function public.next_agent_number(p_agency uuid, p_fixture boolean) returns integer
language sql stable security definer set search_path = public as $function$
  select coalesce(max(m.agent_number), case when p_fixture then 899 else 0 end) + 1
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.agency_id = p_agency
     and coalesce(p.is_fixture, false) = p_fixture
     and m.agent_number is not null
$function$;
revoke all on function public.next_agent_number(uuid, boolean) from public, anon, authenticated;

/** Initials from the canonical name: first letter of the first and last word. */
create or replace function public.agent_initials(p_user uuid) returns text
language sql stable security definer set search_path = public as $function$
  with person as (
    select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
           coalesce(p.is_fixture, false) as fixture
      from public.profiles p where p.id = p_user
  ), words as (
    select regexp_split_to_array(trim(regexp_replace(regexp_replace(name, '[^[:alpha:] ]', '', 'g'), '\s+', ' ', 'g')), ' ') as w, fixture from person
  )
  select case when fixture then 'FX'
              else coalesce(nullif(upper(left(w[1], 1)) || upper(left(w[array_length(w, 1)], 1)), ''), 'XX') end
    from words
$function$;
revoke all on function public.agent_initials(uuid) from public, anon, authenticated;

/** The whole identifier, from the three things that make it. Null with no hire date. */
create or replace function public.agent_id_for(p_user uuid, p_hired_on date, p_number integer) returns text
language sql stable security definer set search_path = public as $function$
  select case when p_hired_on is null or p_number is null then null
              else public.agent_initials(p_user) || to_char(p_hired_on, 'MMDDYY') || '-' || lpad(p_number::text, 3, '0') end
$function$;
revoke all on function public.agent_id_for(uuid, date, integer) from public, anon, authenticated;

/**
 * On insert: allocate the permanent number and write the code.
 * On a hire-date correction: rewrite the DATE part, keeping the number — the
 * person is the same person, and their number is theirs for good.
 */
create or replace function public.agency_memberships_assign_employee_code() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_fixture boolean;
begin
  new.created_at := coalesce(new.created_at, now());
  if new.agent_number is null then
    select coalesce(p.is_fixture, false) into v_fixture from public.profiles p where p.id = new.user_id;
    new.agent_number := public.next_agent_number(new.agency_id, coalesce(v_fixture, false));
  end if;
  if new.employee_code is null or (tg_op = 'UPDATE' and new.hired_on is distinct from old.hired_on) then
    new.employee_code := public.agent_id_for(new.user_id, new.hired_on, new.agent_number);
  end if;
  return new;
end $function$;
drop trigger if exists agency_memberships_assign_employee_code on public.agency_memberships;
create trigger agency_memberships_assign_employee_code before insert or update of hired_on on public.agency_memberships
  for each row execute function public.agency_memberships_assign_employee_code();

/* The agency-wide renumbering is gone: a number belongs to a person now, so
   nobody else's identifier moves when one hire date is corrected. */
drop trigger if exists agency_memberships_hired_on_changed on public.agency_memberships;

/** Kept for the owner's manual override path, which stays audited. */
create or replace function public.recompute_employee_codes(p_agency uuid) returns integer
language plpgsql security definer set search_path = public as $function$
declare v_n integer;
begin
  if not public.is_admin_of(p_agency) then
    raise exception 'Only an administrator recomputes Agent IDs' using errcode = '42501';
  end if;
  perform set_config('bes.employee_code_recompute', 'on', true);
  update public.agency_memberships m
     set employee_code = public.agent_id_for(m.user_id, m.hired_on, m.agent_number)
   where m.agency_id = p_agency
     and m.employee_code is distinct from public.agent_id_for(m.user_id, m.hired_on, m.agent_number);
  get diagnostics v_n = row_count;
  perform set_config('bes.employee_code_recompute', 'off', true);
  return v_n;
end $function$;
