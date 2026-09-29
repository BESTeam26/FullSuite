-- The BES OUTSOURCING CLIENTS folder is ready to receive its clients.
--
-- Dee, 2026-09-29: "Can you work on the FOLDER LIST import. I need every
-- client on these per partner list." Folder 901816224013 holds fourteen
-- lists, one per partner. Kenneth Winfield was imported on 2026-09-28; this
-- readies the other thirteen.
--
-- The same pre-flight every partner has had before a card is read, because
-- discovering after the import that nobody can see the clients is the
-- expensive order:
--
--   Active, not suspended          all fourteen already are
--   a LIVE CreditOps engagement    all fourteen already have one
--   the ClickUp list recorded      set here, one list id per partner
--   teams that can see the partner topped up to Dispute, Support and
--                                  Complaints where a partner had fewer
--
-- Wavy One's link was a VIEW ref (`clickup:view:rk9kb-6358`) recorded when
-- Dee said his own list would come later. The list is in this folder; the
-- ref becomes the list id, which is what the importer records against.
--
-- Bureau Calling is not assigned: it has no members and no clients (Dee,
-- 2026-09-26), and a visibility row for an empty team grants nothing.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_agency uuid; v_owner uuid; v_group uuid; v_added int := 0; v_linked int := 0;
  p record; t record;
begin
  select id into v_agency from public.agencies limit 1;
  select user_id into v_owner from public.agency_memberships m
   where m.agency_id = v_agency and m.is_owner and m.status = 'active'
     and exists (select 1 from public.profiles pr where pr.id = m.user_id
                  and coalesce(pr.is_fixture, false) = false)
   limit 1;

  for p in
    select * from (values
      ('Fundare Capital',        '901817740734'),
      ('Big On Credit',          '901820007586'),
      ('Romeo Credit Repair',    '901820006537'),
      ('Serenity Solutions',     '901805338372'),
      ('Jensen',                 '901806778187'),
      ('Jay Consulting',         '901817516651'),
      ('Prime Capital Group',    '901816885109'),
      ('Wavy One Solutions',     '901805338356'),
      ('Credify',                '901817636881'),
      ('No Limit Empire, LLC.',  '901807726217'),
      ('Shawn Mcmanus LLC',      '901815577409'),
      ('ZackCredit',             '901817962084'),
      ('Mikia Edwards',          '901808965123')
    ) as x(partner, list_id)
  loop
    select g.id into v_group
      from public.outsourcing_groups g
     where g.name = p.partner and g.archived_at is null and not g.is_fixture;
    if v_group is null then
      raise exception 'no live partner named "%"', p.partner;
    end if;

    /* The engagement is the authorization. Refuse rather than import into a
       partner BES is not contracted to fulfil (rule 16). */
    if not exists (
      select 1 from public.fulfillment_engagements e
       where e.outsourcing_group_id = v_group and e.service = 'creditops'
         and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
    ) then
      raise exception '"%" has no LIVE CreditOps engagement — nothing may be imported', p.partner;
    end if;

    update public.outsourcing_groups
       set source_list_ref = 'clickup:list:' || p.list_id, updated_at = now()
     where id = v_group
       and source_list_ref is distinct from ('clickup:list:' || p.list_id);
    if found then v_linked := v_linked + 1; end if;

    for t in
      select tm.id from public.teams tm
        join public.departments d on d.id = tm.department_id
       where tm.agency_id = v_agency and tm.archived_at is null and not tm.is_fixture
         and d.division = 'creditops' and d.archived_at is null
         and d.key in ('dispute', 'support', 'complaints')
    loop
      if not exists (select 1 from public.partner_assignments a
                      where a.group_id = v_group and a.team_id = t.id and a.ended_on is null) then
        insert into public.partner_assignments
          (agency_id, group_id, team_id, assignment_role, started_on, created_by, notes)
        values (v_agency, v_group, t.id, 'assigned', current_date, v_owner,
                'Visibility for the division, before the folder import (Dee, 2026-09-29).');
        v_added := v_added + 1;
      end if;
    end loop;
  end loop;

  raise notice 'linked % list(s), added % team assignment(s)', v_linked, v_added;
end $$;

/* The check that matters: every one of the thirteen is reachable by a real
   CreditOps agent. A partner with an engagement and no reachable staff
   imports into a folder that opens empty. */
do $$
declare p record; v_staff int;
begin
  for p in
    select g.id, g.name from public.outsourcing_groups g
     where g.archived_at is null and not g.is_fixture
       and g.source_list_ref in (
         'clickup:list:901817740734','clickup:list:901820007586','clickup:list:901820006537',
         'clickup:list:901805338372','clickup:list:901806778187','clickup:list:901817516651',
         'clickup:list:901816885109','clickup:list:901805338356','clickup:list:901817636881',
         'clickup:list:901807726217','clickup:list:901815577409','clickup:list:901817962084',
         'clickup:list:901808965123')
  loop
    select count(distinct m.user_id) into v_staff
      from public.partner_assignments a
      join public.team_memberships tm on tm.team_id = a.team_id
      join public.agency_memberships m on m.user_id = tm.user_id and m.status = 'active'
      join public.profiles pr on pr.id = m.user_id and coalesce(pr.is_fixture, false) = false
     where a.group_id = p.id and a.ended_on is null;
    if v_staff = 0 then
      raise exception 'no CreditOps staff can reach "%" — do not import into it', p.name;
    end if;
  end loop;
  raise notice 'all thirteen partners are reachable by CreditOps staff';
end $$;

commit;
