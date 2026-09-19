-- Dee, 2026-09-19: "Dee should take the 001 agent id and Aaron the 002."
-- Both joined on the founding date, so the sequence needs a rule for a
-- same-day tie: the owner comes first, then row id. A rule, not a hand edit.

create or replace function public.employee_code_for(p_agency uuid, p_membership uuid, p_user uuid, p_joined timestamptz, p_is_owner boolean default false)
returns text language sql stable set search_path = public as $function$
  with person as (
    select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
           coalesce(p.is_fixture, false) as fixture
      from public.profiles p where p.id = p_user
  ), words as (
    select regexp_split_to_array(trim(regexp_replace(regexp_replace(name, '[^[:alpha:] ]', '', 'g'), '\s+', ' ', 'g')), ' ') as w, fixture from person
  ), initials as (
    select case when fixture then 'FX'
                else coalesce(nullif(upper(left(w[1], 1)) || upper(left(w[array_length(w, 1)], 1)), ''), 'XX') end as ini,
           fixture
      from words
  ), seq as (
    select count(*) + 1 as n
      from public.agency_memberships m join public.profiles mp on mp.id = m.user_id
     where m.agency_id = p_agency
       and coalesce(mp.is_fixture, false) = (select fixture from person)
       and (coalesce(m.hired_on::timestamptz, m.created_at), not m.is_owner, m.id)
           < (p_joined, not coalesce(p_is_owner, false), p_membership)
  )
  select initials.ini || to_char(p_joined, 'MMYYYY') || '-' || lpad(seq.n::text, 3, '0') from initials, seq
$function$;
drop function if exists public.employee_code_for(uuid, uuid, uuid, timestamptz);

create or replace function public.agency_memberships_assign_employee_code() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if new.employee_code is null then
    new.created_at := coalesce(new.created_at, now());
    new.employee_code := public.employee_code_for(new.agency_id, new.id, new.user_id, coalesce(new.hired_on::timestamptz, new.created_at), coalesce(new.is_owner, false));
  end if;
  return new;
end $function$;

create or replace function public.recompute_employee_codes_internal(p_agency uuid) returns integer
language plpgsql security definer set search_path = public as $function$
declare v_actor text; v_n integer;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  perform set_config('bes.employee_code_recompute', 'on', true);
  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  select m.agency_id, 'profile', m.user_id::text, auth.uid(), v_actor, 'Employee ID recomputed from hire date', 'employee_code',
         m.employee_code, public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at), m.is_owner), 'bes_internal'
    from public.agency_memberships m
   where m.agency_id = p_agency
     and m.employee_code is distinct from public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at), m.is_owner);
  get diagnostics v_n = row_count;
  update public.agency_memberships m set employee_code = null
   where m.agency_id = p_agency
     and m.employee_code is distinct from public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at), m.is_owner);
  update public.agency_memberships m
     set employee_code = public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at), m.is_owner)
   where m.agency_id = p_agency and m.employee_code is null;
  perform set_config('bes.employee_code_recompute', 'off', true);
  return v_n;
end $function$;
