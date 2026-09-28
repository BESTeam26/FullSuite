-- Kenneth Winfield (Upwork) is ready to receive his clients.
--
-- Dee, 2026-09-28, with the list link: "NEXT LIST … That is Kenneth Winfield."
--
-- The pre-flight every partner gets before a single card is imported, because
-- discovering that nobody can see 600 clients AFTER importing them is an
-- expensive way to learn it:
--
--   Active, not suspended            already true
--   a LIVE CreditOps engagement      already true, since 2026-09-09
--   the ClickUp list recorded        set here
--   teams that can see the partner   set here — this was missing
--
-- `partner_assignments` is what `in_scope()` narrows BES staff by. Without a
-- row, the engagement authorizes the agency and no actual agent is inside the
-- scope, so the folder imports into a partner nobody can open.
--
-- Dispute, Support and Complaints, matching every other imported partner. Not
-- Onboarding or Bureau Calling: Bureau Calling has no members and no clients
-- (Dee, 2026-09-26: "we dont have anyone in bureau calling and no task for
-- that too"), and a visibility row for an empty team grants nothing.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_group uuid; v_agency uuid; v_owner uuid; t record; v_added int := 0;
begin
  select id, agency_id into v_group, v_agency
    from public.outsourcing_groups
   where name = 'Kenneth Winfield (Upwork)' and archived_at is null and not is_fixture;
  if v_group is null then
    raise exception 'no live partner named "Kenneth Winfield (Upwork)"';
  end if;

  /* The engagement is what authorizes BES at all. Refuse rather than import
     into a partner BES is not contracted to fulfil (rule 16). */
  if not exists (
    select 1 from public.fulfillment_engagements e
     where e.outsourcing_group_id = v_group and e.service = 'creditops'
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
  ) then
    raise exception 'Kenneth Winfield has no LIVE CreditOps engagement — nothing may be imported';
  end if;

  update public.outsourcing_groups
     set source_list_ref = 'clickup:list:901815612685', updated_at = now()
   where id = v_group;

  select user_id into v_owner from public.agency_memberships m
   where m.agency_id = v_agency and m.is_owner and m.status = 'active'
     and exists (select 1 from public.profiles p where p.id = m.user_id
                  and coalesce(p.is_fixture, false) = false)
   limit 1;

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
              'Visibility for the division, before the ClickUp import (Dee, 2026-09-28).');
      v_added := v_added + 1;
    end if;
  end loop;
  raise notice 'linked the list and added % team assignment(s)', v_added;
end $$;

/* The check that matters: can a real CreditOps agent actually see him? A
   partner with an engagement and no reachable staff is the failure this
   pre-flight exists to catch, and it is invisible until somebody opens the
   folder and finds it empty. */
do $$
declare v_group uuid; v_staff int;
begin
  select id into v_group from public.outsourcing_groups
   where name = 'Kenneth Winfield (Upwork)' and archived_at is null;

  select count(distinct m.user_id) into v_staff
    from public.partner_assignments a
    join public.team_memberships tm on tm.team_id = a.team_id
    join public.agency_memberships m on m.user_id = tm.user_id and m.status = 'active'
    join public.profiles p on p.id = m.user_id and coalesce(p.is_fixture, false) = false
   where a.group_id = v_group and a.ended_on is null;

  if v_staff = 0 then
    raise exception 'no CreditOps staff can reach Kenneth Winfield — do not import into him yet';
  end if;
  raise notice '% CreditOps staff can see Kenneth Winfield', v_staff;
end $$;

commit;
