-- Credit by Nainoa is ready to receive its clients.
--
-- Dee's next list: https://app.clickup.com/25798251/v/l/rk9kb-20798 —
-- "Credit by Nainoa - Nainoa Shin", list 901820297456, 637 cards (194 live,
-- 443 archived).
--
-- Active, unsuspended, CreditOps engagement live. Two things needed: the list
-- link, and team visibility.
--
-- ── THE NAMED AGENTS STAY NAMED ───────────────────────────────────────────
--
-- Dee, 2026-09-23: "Credit by Nainoa is with Allyssa and Jet Support." They
-- are already named on this partner, and that is deliberately NOT replaced.
--
-- The two kinds of assignment do different jobs. A USER assignment makes
-- somebody a named agent for the partner, and `creditops_pick_assignee`
-- narrows the pool to named agents whenever there are any — so Allyssa and
-- Jet keep first claim on the Support work, which is what Dee said. A TEAM
-- assignment grants VISIBILITY, and without it nobody outside those two
-- names can open a file at all.
--
-- Neither Allyssa nor Jet works Dispute or Complaints, so for those
-- departments the named pool is empty and the picker falls back to the
-- department — which is the right answer and only reachable if the teams can
-- see the partner in the first place.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_agency uuid; v_group uuid; v_owner uuid; t record; v_added int := 0;
begin
  select id, agency_id into v_group, v_agency
    from public.outsourcing_groups where name = 'Credit by Nainoa';
  if v_group is null then raise exception 'no partner called Credit by Nainoa'; end if;

  update public.outsourcing_groups
     set source_list_ref = 'clickup:list:901820297456', updated_at = now()
   where id = v_group;

  select user_id into v_owner from public.agency_memberships m
   where m.agency_id = v_agency and m.is_owner and m.status = 'active'
     and exists (select 1 from public.profiles p where p.id = m.user_id
                  and coalesce(p.is_fixture, false) = false)
   limit 1;

  for t in
    select tm.id from public.teams tm
     join public.departments d on d.id = tm.department_id
    where tm.agency_id = v_agency and tm.archived_at is null
      and d.division = 'creditops' and d.archived_at is null
      and d.key in ('dispute', 'support', 'complaints')
  loop
    if not exists (select 1 from public.partner_assignments a
                    where a.group_id = v_group and a.team_id = t.id and a.ended_on is null) then
      insert into public.partner_assignments
        (agency_id, group_id, team_id, assignment_role, started_on, created_by, notes)
      values (v_agency, v_group, t.id, 'assigned', current_date, v_owner,
              'Visibility for the division. Allyssa and Jet remain the named agents (Dee, 2026-09-23).');
      v_added := v_added + 1;
    end if;
  end loop;
  raise notice 'linked the list and added % team assignment(s)', v_added;
end $$;

/* Every CreditOps agent can see the partner, and the named agents are still
   named — the second half matters, because replacing them with a team would
   have quietly undone "Credit by Nainoa is with Allyssa and Jet". */
do $$
declare v_group uuid; r record; v_named text;
begin
  select id into v_group from public.outsourcing_groups where name = 'Credit by Nainoa';

  select string_agg(p.full_name, ', ') into v_named
    from public.partner_assignments a
    join public.profiles p on p.id = a.user_id
   where a.group_id = v_group and a.ended_on is null;
  if v_named is null or v_named not like '%Allyssa%' or v_named not like '%Jet%' then
    raise exception 'the named agents were lost: %', coalesce(v_named, 'none');
  end if;

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
      raise exception '% would not be able to see the imported clients', r.full_name;
    end if;
  end loop;
  perform set_config('request.jwt.claims', null, true);
end $$;

commit;
