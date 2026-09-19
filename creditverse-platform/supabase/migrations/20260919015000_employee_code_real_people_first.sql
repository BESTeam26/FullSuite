-- Employee IDs number real people among real people (2026-09-19, minutes after
-- 014000 assigned them and before anyone saw one). The RLS-matrix fixtures are
-- real memberships created early, so Dian read 09 and Archie 14 while seven
-- [TEST] personas held 02–08. Fixtures now take an FX prefix and their own
-- count; real people are numbered in real hiring order. One-time recompute of
-- codes nobody has used; from here on a code is never recomputed.

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
    /* Hiring order among people of the same kind — real among real, fixture
       among fixture — ties on the timestamp broken by id. */
    select count(*) + 1 as n
      from public.agency_memberships m join public.profiles mp on mp.id = m.user_id
     where m.agency_id = p_agency
       and coalesce(mp.is_fixture, false) = (select fixture from person)
       and (m.created_at, m.id) < (p_joined, p_membership)
  )
  select initials.ini || '-' || to_char(p_joined, 'MMYY') || '-' || lpad(seq.n::text, 2, '0') from initials, seq
$function$;

update public.agency_memberships m
   set employee_code = public.employee_code_for(m.agency_id, m.id, m.user_id, m.created_at);
