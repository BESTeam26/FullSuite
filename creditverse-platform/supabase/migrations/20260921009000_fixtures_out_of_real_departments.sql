-- P-033: Dee could not archive the Onboarding department.
--
-- The screen said "0 teams"; the database said "Move [TEST] Team B to another
-- department before archiving this one." Both were right. `[TEST] Team B` is
-- a probe fixture (0170 / 20260907001100) that was parked inside Dee's REAL
-- Onboarding department; the structure page hides fixtures, the archive guard
-- counted it. A fixture must coexist with real data (rule 20), which means it
-- must never stand in the way of a real action.
--
-- Two things, so it cannot recur:
--   1. the fixture teams get a fixture department of their own, hidden from
--      the structure like every other fixture row;
--   2. the archive guard ignores fixture teams outright.

insert into public.departments (agency_id, division, division_id, key, name, description, is_fixture, show_on_chart, sort)
select a.id, 'creditops', d.id, 'fixture', '[TEST] Fixture Department',
       'Holds the RLS probe fixture teams. Never real people, never real work.', true, false, 9999
  from public.agencies a
  join public.divisions d on d.agency_id = a.id and d.service = 'creditops' and d.archived_at is null
 order by a.created_at limit 1
on conflict (agency_id, division, key) do nothing;

update public.teams t
   set department_id = f.id
  from public.departments f
 where f.is_fixture and f.key = 'fixture'
   and t.is_fixture
   and t.agency_id = f.agency_id;

create or replace function public.department_keeps_its_teams() returns trigger
language plpgsql set search_path = public as $function$
declare v_teams text;
begin
  if new.archived_at is not null and old.archived_at is null then
    /* Fixture teams are probe furniture: they never block the owner. */
    select string_agg(t.name, ', ' order by t.name) into v_teams
      from public.teams t
     where t.department_id = new.id and t.archived_at is null and not t.is_fixture;
    if v_teams is not null then
      raise exception 'Move % to another department before archiving this one.', v_teams
        using errcode = '22023';
    end if;
  end if;
  return new;
end $function$;
