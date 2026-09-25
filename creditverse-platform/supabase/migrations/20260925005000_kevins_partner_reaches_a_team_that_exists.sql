-- Kevin Hernandez's partner reaches a team that exists.
--
-- His 27 clients are imported, his engagement is live and his suspension was
-- lifted — and Jet and Ivan could still see none of them. `can_see_partner()`
-- needs a partner ASSIGNMENT, and his are:
--
--   Team Daniel   ARCHIVED, no members   ×2
--   Bryan Breva   an administrator, who sees everything anyway
--   JM Navales    TalentOps
--
-- So the only route to those files was being an admin. The same gap Approve
-- with Tiff had, in a different shape: there the assignments were missing,
-- here they point at a team that no longer exists.
--
-- Assigned to the three staffed CreditOps teams, exactly as Tiffany's was on
-- 2026-09-24. Dee names individual partner owners where she wants them and
-- has not named one here; which client each person gets is still the
-- assignment engine's answer.
--
-- The Team Daniel rows are LEFT ALONE. They are a record of who used to own
-- this partner, they grant nothing now the team is archived, and rewriting
-- history to tidy a report is not this migration's business. Ending them is
-- one UPDATE whenever somebody decides that is right.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_agency uuid; v_group uuid; v_owner uuid; t record; v_added int := 0;
begin
  select id, agency_id into v_group, v_agency
    from public.outsourcing_groups where name = 'Kevin Hernandez';
  if v_group is null then raise exception 'no partner called Kevin Hernandez'; end if;

  select user_id into v_owner from public.agency_memberships
   where agency_id = v_agency and is_owner and status = 'active'
     and exists (select 1 from public.profiles p
                  where p.id = user_id and coalesce(p.is_fixture, false) = false)
   limit 1;

  for t in
    select tm.id, tm.name from public.teams tm
     join public.departments d on d.id = tm.department_id
    where tm.agency_id = v_agency and tm.archived_at is null
      and d.division = 'creditops' and d.archived_at is null
      and d.key in ('dispute', 'support', 'complaints')
  loop
    if not exists (
      select 1 from public.partner_assignments a
       where a.group_id = v_group and a.team_id = t.id and a.ended_on is null
    ) then
      insert into public.partner_assignments
        (agency_id, group_id, team_id, assignment_role, started_on, created_by, notes)
      values (v_agency, v_group, t.id, 'assigned', current_date, v_owner,
              'Division-wide while no individual owner is named (2026-09-25).');
      v_added := v_added + 1;
    end if;
  end loop;
  raise notice 'assigned the partner to % CreditOps team(s)', v_added;
end $$;

/* The people who work these files can see them. Asserted as the agents
   themselves — a count taken as the owner proves nothing (rule 20b). */
do $$
declare v_group uuid; r record; v_seen int;
begin
  select id into v_group from public.outsourcing_groups where name = 'Kevin Hernandez';
  for r in
    select m.user_id, p.full_name
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
      join public.team_memberships tm on tm.user_id = m.user_id
      join public.teams t on t.id = tm.team_id and t.archived_at is null
      join public.departments d on d.id = t.department_id and d.division = 'creditops'
     where m.status = 'active' and coalesce(p.is_fixture, false) = false
     group by m.user_id, p.full_name
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    if not public.can_see_partner(v_group) then
      raise exception '% still cannot see the partner', r.full_name;
    end if;
  end loop;
  perform set_config('request.jwt.claims', null, true);
end $$;

commit;
