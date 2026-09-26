-- Vanquish Ventures is ready to receive its clients.
--
-- Dee's next list: https://app.clickup.com/25798251/v/l/rk9kb-13478 —
-- "Vanquish Ventures - Lloyd Argame", list 901817372224, 786 cards. Five
-- times the size of anything imported so far.
--
-- The partner is Active, unsuspended and its CreditOps engagement is already
-- live. Two things were missing and are done BEFORE the import, as they now
-- are for every list: the ClickUp list link, and a live team assignment —
-- without which `can_see_partner()` leaves the files open to administrators
-- only.
--
-- Dee, 2026-09-23, on this partner: "Vanquish is with Jet for support." That
-- is a SUPPORT ownership note, not the whole partner, so it does not replace
-- the division-wide assignment — the Dispute and Complaints work still has to
-- reach those teams. Naming Jet as the individual owner for Support is an
-- ordinary partner assignment whenever she wants it.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_agency uuid; v_group uuid; v_owner uuid; t record; v_added int := 0;
begin
  select id, agency_id into v_group, v_agency
    from public.outsourcing_groups where name = 'Vanquish Ventures';
  if v_group is null then raise exception 'no partner called Vanquish Ventures'; end if;

  update public.outsourcing_groups
     set source_list_ref = 'clickup:list:901817372224', updated_at = now()
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
              'Division-wide while no individual owner is named (2026-09-26).');
      v_added := v_added + 1;
    end if;
  end loop;
  raise notice 'linked the list and assigned % CreditOps team(s)', v_added;
end $$;

/* Every CreditOps agent can see the partner BEFORE a single client lands. */
do $$
declare v_group uuid; r record;
begin
  select id into v_group from public.outsourcing_groups where name = 'Vanquish Ventures';
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
