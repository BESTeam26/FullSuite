-- A fixture is never given real work.
--
-- Found auditing the folder import, 2026-09-30: 177 live Dispute files are
-- assigned to "[TEST] Dev Lead" and "[TEST] Eli Credit" — the security
-- matrix's fixture accounts, which sit on "[TEST] Team A" under the Dispute
-- Department so the RLS probes have a team to test. `creditops_pick_
-- assignee_explained` built its eligible pool from team membership and
-- never asked whether the member, or the team, was a fixture. From the
-- picker's point of view Eli was the least-loaded Dispute agent — so Eli
-- got the next file, 177 times.
--
-- Fixtures coexist with real data by design (rule 20); what they may never
-- do is receive it. The pool now excludes fixture profiles and fixture
-- teams, and the 177 files are re-routed through the same router every
-- other file uses, so the real Dispute agents receive them by the same
-- rule (continuity, partner batch, workload). Nothing about who did what
-- before changes: no production was ever written under a fixture name.
--
-- Cost impact: none.

begin;

create or replace function public.creditops_pick_assignee_explained(
  p_department public.fulfillment_department, p_agency uuid,
  p_group uuid default null, p_client uuid default null)
returns table(user_id uuid, reason text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with eligible as (
    select distinct m.user_id
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null
      join public.departments d on d.id = t.department_id
      join public.agency_memberships am
        on am.user_id = m.user_id and am.agency_id = p_agency
      /* A fixture account, or a fixture team, is scaffolding for the
         security probes. It is never a person who can be handed a file. */
      join public.profiles pr on pr.id = m.user_id and coalesce(pr.is_fixture, false) = false
     where t.agency_id = p_agency
       and not t.is_fixture
       and d.division = 'creditops'
       and d.archived_at is null
       and d.key = case p_department
                     when 'Onboarding'     then 'support'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
       and coalesce(am.status, 'active') = 'active'
       /* Seeing the queue is not being given files from it. */
       and am.can_receive_production_work
  ),
  partner_agents as (
    select e.user_id
      from eligible e
      join public.partner_assignments pa
        on pa.user_id = e.user_id
       and pa.group_id = p_group
       and pa.agency_id = p_agency
       and pa.ended_on is null
     where p_group is not null
  ),
  /* AUTHORIZATION FIRST. The pool is the partner's named agents when it has
     any, otherwise the department. Nothing below reaches outside it. */
  pool as (
    select user_id, true as named from partner_agents
    union all
    select user_id, false from eligible
     where not exists (select 1 from partner_agents)
  ),
  ranked as (
    select p.user_id,
           p.named,
           (public.creditops_available_today(p.user_id)
            and public.creditops_works_today(p.user_id)) as here_today,
           exists (
             select 1 from public.production_logs pl
              where pl.client_id = p_client
                and pl.employee_id = p.user_id
                and not pl.is_voided
                and (pl.department_key = p_department::text
                     or pl.department::text = p_department::text)
           ) as handled_before,
           exists (
             select 1
               from public.client_department_statuses s
               join public.fulfillment_clients c on c.id = s.client_id
              where s.assignee_id = p.user_id
                and c.outsourcing_group_id = p_group
                and p_group is not null
                and public.creditops_status_is_actionable(s.department, s.status)
           ) as on_this_partner,
           (select count(*)
              from public.client_department_statuses s
             where s.assignee_id = p.user_id
               and public.creditops_status_is_actionable(s.department, s.status)) as open_files,
           (select max(s.assigned_at)
              from public.client_department_statuses s
             where s.assignee_id = p.user_id and s.department = p_department) as last_given
      from pool p
  ),
  chosen as (
    select * from ranked
     order by here_today desc,
              handled_before desc,
              on_this_partner desc,
              open_files asc,
              last_given asc nulls first,
              user_id asc
     limit 1
  )
  select c.user_id,
         case
           when c.handled_before  then 'continuity'
           when c.named           then 'partner_agent'
           when c.on_this_partner then 'same_partner_batch'
           when (select count(*) from ranked) = 1 then 'only_eligible'
           else 'workload'
         end
    from chosen c
$$;

/* The picker can no longer answer with a fixture, for any department. */
do $$
declare v_dept public.fulfillment_department; v_pick uuid; v_agency uuid;
begin
  select id into v_agency from public.agencies limit 1;
  foreach v_dept in array array['Onboarding','Dispute','Support','Complaints','Bureau Calling']::public.fulfillment_department[] loop
    v_pick := public.creditops_pick_assignee(v_dept, v_agency, null);
    if v_pick is not null and exists (select 1 from public.profiles p where p.id = v_pick and coalesce(p.is_fixture,false)) then
      raise exception 'the picker still chose a fixture for %', v_dept;
    end if;
  end loop;
end $$;

/* Re-route every live file a fixture holds, through the ordinary router. */
do $$
declare r record; v_n int := 0; v_left int;
begin
  for r in
    select distinct fc.id
      from public.fulfillment_clients fc
      left join public.client_department_statuses d on d.client_id = fc.id
      left join public.profiles pd on pd.id = d.assignee_id
      left join public.profiles pf on pf.id = fc.assigned_agent_id
     where fc.archived_at is null and not fc.is_fixture
       and (coalesce(pd.is_fixture,false) or coalesce(pf.is_fixture,false))
  loop
    update public.client_department_statuses d
       set assignee_id = null, assignment_method = null, assigned_at = now(), updated_at = now()
     where d.client_id = r.id
       and d.assignee_id in (select p.id from public.profiles p where coalesce(p.is_fixture,false));
    update public.fulfillment_clients fc
       set assigned_agent_id = null, updated_at = now()
     where fc.id = r.id
       and fc.assigned_agent_id in (select p.id from public.profiles p where coalesce(p.is_fixture,false));
    perform public.creditops_route_client(r.id, null);
    v_n := v_n + 1;
  end loop;

  select count(*) into v_left
    from public.client_department_statuses d
    join public.fulfillment_clients fc on fc.id = d.client_id and fc.archived_at is null
    join public.profiles p on p.id = d.assignee_id
   /* Fixture clients held by fixture agents are the probes' own scaffolding. */
   where coalesce(p.is_fixture,false) and not fc.is_fixture;
  if v_left > 0 then raise exception '% files still held by a fixture', v_left; end if;
  raise notice '% files re-routed away from fixture accounts', v_n;
end $$;

commit;
