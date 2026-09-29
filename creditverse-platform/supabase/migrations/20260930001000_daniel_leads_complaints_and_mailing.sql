-- Daniel leads Complaints & Mailing.
--
-- Dee, 2026-09-30: "The Team Lead / Department Lead for Complaints & Mailing
-- is Daniel. Correct the canonical team/department leadership assignment so
-- Paul Lojo's EOD and the department reporting hierarchy route properly. Do
-- not create another Complaints department or duplicate leadership
-- structure."
--
-- What was true: Daniel already held the `department_manager` seat for
-- Complaints & Mailing (staged on his invitation, 2025-06-15) and led the
-- Dispute Processing Team. The Complaints & Mailing TEAM had three members
-- and no lead, so Paul Lojo, Archie Carlos and Ivan Olympia's EODs routed
-- `no_lead` — nowhere.
--
-- What changes: one membership row. Daniel is added to the existing
-- Complaints & Mailing team as its lead. Nothing is created beyond that: the
-- team, the department and his seat all exist already. `eod_route_up_for`
-- then resolves the three to him without any change of its own.
--
-- Cost impact: none.

begin;

do $$
declare v_daniel uuid; v_team uuid; v_agency uuid;
begin
  select p.id into v_daniel from public.profiles p where p.full_name = 'Daniel Charles P. Macasiab';
  select t.id, t.agency_id into v_team, v_agency
    from public.teams t join public.departments d on d.id = t.department_id
   where t.archived_at is null and not t.is_fixture
     and d.division = 'creditops' and d.key = 'complaints';
  if v_daniel is null or v_team is null then
    raise exception 'could not resolve Daniel (%) or the Complaints & Mailing team (%)', v_daniel, v_team;
  end if;

  /* The seat he already holds is the department half; this is the team half. */
  if not exists (select 1 from public.management_seats s
                  where s.user_id = v_daniel and s.seat = 'department_manager'
                    and s.department_id = (select department_id from public.teams where id = v_team)
                    and public.seat_is_live(s.effective_from, s.effective_to)) then
    raise exception 'Daniel does not hold the Complaints & Mailing department seat — expected to already';
  end if;

  insert into public.team_memberships (team_id, user_id, is_lead)
  values (v_team, v_daniel, true)
  on conflict (team_id, user_id) do update set is_lead = true;

  raise notice 'Daniel leads the Complaints & Mailing team';
end $$;

/* The consequence that matters: the three members now route to him. */
do $$
declare v_bad text;
begin
  select string_agg(coalesce(p.full_name, p.email) || ' → ' || coalesce(r.reason, 'null'), ', ')
    into v_bad
    from public.profiles p
    cross join lateral public.eod_route_up_for(p.id) r
   where p.full_name in ('Paul Lojo', 'Archie Carlos', 'Ivan L. Olympia')
     and (r.reason <> 'team_lead'
          or r.lead_id <> (select id from public.profiles where full_name = 'Daniel Charles P. Macasiab'));
  if v_bad is not null then
    raise exception 'Complaints members still do not route to Daniel: %', v_bad;
  end if;
  raise notice 'Paul, Archie and Ivan route team_lead → Daniel';
end $$;

commit;
