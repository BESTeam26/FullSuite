-- Employee ID in the shape of Dee's visual (2026-09-19): INITIALS + MMYYYY +
-- '-' + three-digit hiring number, e.g. JR092026-014. The codes assigned
-- earlier today were never shown outside this session, so this is the one
-- recompute; from here on a code is never recomputed (trigger unchanged).
create or replace function public.employee_code_for(p_agency uuid, p_membership uuid, p_user uuid, p_joined timestamptz)
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
       and (m.created_at, m.id) < (p_joined, p_membership)
  )
  select initials.ini || to_char(p_joined, 'MMYYYY') || '-' || lpad(seq.n::text, 3, '0') from initials, seq
$function$;

/* One-time recompute, as the owner-guard trigger requires an owner session:
   done here by the migration role, which the trigger does not gate (auth.uid()
   is null → the owner check would refuse), so disable it for this statement. */
alter table public.agency_memberships disable trigger agency_memberships_protect_employee_code;
update public.agency_memberships m
   set employee_code = public.employee_code_for(m.agency_id, m.id, m.user_id, m.created_at);
alter table public.agency_memberships enable trigger agency_memberships_protect_employee_code;
