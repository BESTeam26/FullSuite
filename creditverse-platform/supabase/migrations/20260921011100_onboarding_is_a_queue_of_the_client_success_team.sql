-- Dee, 2026-09-21, correcting this morning's change: "onboarding queue is
-- supposed to route to the support team still, they basically have 2 queues."
--
-- Two different things were collapsed into one. Onboarding is not an
-- organizational DEPARTMENT any more — that part was right, and the org
-- department stays archived (AD-011). But it is still a WORK QUEUE, and the
-- Client Success / Support team works BOTH of them: onboarding files in the
-- Onboarding queue, everything else in the Support queue. Routing every
-- onboarding status into Support threw away that distinction, and with it the
-- ability to see how many new clients are waiting to be onboarded.
--
-- So: the statuses route back to the Onboarding queue, and the queue is
-- STAFFED by the Client Success department. The mapping layer is where the
-- two vocabularies already meet (`my_creditops_departments`,
-- `creditops_pick_assignee`), so that is where the change belongs — not in a
-- resurrected department row.

-- ── 1. The onboarding statuses open the Onboarding queue again ────────────
update public.creditops_status_routing
   set department = 'Onboarding', kind = 'actionable', entry_status = 'OB NOT STARTED',
       note = 'Onboarding queue, worked by the Client Success team (Dee, 2026-09-21).'
 where status::text in ('New Client', 'NEW ONBOARDING');

update public.creditops_status_routing
   set department = 'Onboarding', kind = 'actionable', entry_status = 'OB IN REVIEW',
       note = 'Onboarding queue, worked by the Client Success team (Dee, 2026-09-21).'
 where status::text = 'Onboarding';

update public.creditops_status_routing
   set department = 'Onboarding', kind = 'actionable', entry_status = 'OB INCOMPLETE',
       note = 'Onboarding queue, worked by the Client Success team (Dee, 2026-09-21).'
 where status::text in ('Incomplete Onboarding', 'INCOMPLETE ONBOARDING');

-- ── 2. The Onboarding queue is staffed by Client Success ──────────────────
/* `key = 'support'` IS the Client Success Department (its name changed, its
   key did not). Its people now answer for two work departments, so the
   function returns both — a set, which is what it was always built to be. */
create or replace function public.my_creditops_departments()
returns setof public.fulfillment_department
language sql stable security definer set search_path = public as $function$
  select dep from public.departments d
  cross join lateral (
    select unnest(case d.key
             when 'onboarding'     then array['Onboarding']::public.fulfillment_department[]
             when 'dispute'        then array['Dispute']::public.fulfillment_department[]
             /* Client Success works the Support queue AND the Onboarding
                queue: onboarding is a stage of their work, not somebody
                else's department (Dee, 2026-09-21). */
             when 'support'        then array['Support', 'Onboarding']::public.fulfillment_department[]
             when 'client_success' then array['Support', 'Onboarding']::public.fulfillment_department[]
             when 'complaints'     then array['Complaints']::public.fulfillment_department[]
             when 'bureau_calling' then array['Bureau Calling']::public.fulfillment_department[]
           end) as dep
  ) x
   where d.id in (select public.my_departments())
     and d.key in ('onboarding', 'dispute', 'support', 'client_success',
                   'complaints', 'bureau_calling')
     and dep is not null
$function$;
revoke execute on function public.my_creditops_departments() from public, anon;
grant execute on function public.my_creditops_departments() to authenticated;
comment on function public.my_creditops_departments() is
  'The CreditOps WORK departments this person answers for, from the organization departments they belong to. Client Success maps to two: Support and Onboarding (Dee, 2026-09-21).';

/* Fair distribution has to find the same people. Onboarding work is picked
   from the Client Success team, because that is who works it. */
create or replace function public.creditops_pick_assignee(
  p_department public.fulfillment_department,
  p_agency uuid
) returns uuid
language sql stable security definer set search_path = public as $function$
  with eligible as (
    select distinct m.user_id
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null
      join public.departments d on d.id = t.department_id
      join public.agency_memberships am
        on am.user_id = m.user_id and am.agency_id = p_agency
     where t.agency_id = p_agency
       and d.division = 'creditops'
       and d.archived_at is null
       and d.key = case p_department
                     /* The Onboarding queue is the Client Success team's. */
                     when 'Onboarding'     then 'support'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
       and coalesce(am.status, 'active') = 'active'
  ), load as (
    select e.user_id,
           (select count(*)
              from public.client_department_statuses s
             where s.assignee_id = e.user_id
               and public.creditops_status_is_actionable(s.department, s.status)) as open_files,
           (select max(s.assigned_at)
              from public.client_department_statuses s
             where s.assignee_id = e.user_id and s.department = p_department) as last_given
      from eligible e
  )
  select user_id from load
   order by open_files asc, last_given asc nulls first, user_id asc
   limit 1
$function$;
revoke execute on function public.creditops_pick_assignee(public.fulfillment_department, uuid) from public, anon;
grant execute on function public.creditops_pick_assignee(public.fulfillment_department, uuid) to authenticated;

-- ── 3. Put this morning's five files back in the queue they belong to ─────
/* The Support rows my earlier migration created for onboarding-stage clients
   were never worked — unassigned, untouched, made at 15:00 today. They go,
   and the client is re-routed, which reopens the Onboarding row at the right
   entry status through the canonical engine rather than by hand. */
delete from public.client_department_statuses d
 using public.fulfillment_clients c
 where c.id = d.client_id
   and d.department = 'Support'
   and d.assignee_id is null
   and d.updated_at::date = current_date
   and d.status in ('SUPPORT NEW', 'ONBOARDING FOLLOWUP')
   and c.status::text in ('New Client', 'NEW ONBOARDING', 'Onboarding',
                          'Incomplete Onboarding', 'INCOMPLETE ONBOARDING');

/* The Onboarding rows closed as "Complete" this morning are reopened by the
   same re-route where the client is still an onboarding-stage file. */
update public.client_department_statuses d
   set status = 'OB IN REVIEW', updated_at = now()
  from public.fulfillment_clients c
 where c.id = d.client_id
   and d.department = 'Onboarding'
   and d.status = 'Complete'
   and d.updated_at::date = current_date
   and c.status::text in ('New Client', 'NEW ONBOARDING', 'Onboarding',
                          'Incomplete Onboarding', 'INCOMPLETE ONBOARDING');

do $$
declare r record;
begin
  for r in select c.id from public.fulfillment_clients c
            where c.archived_at is null
              and coalesce(c.lifecycle, 'active') = 'active'
              and c.status::text in ('New Client', 'NEW ONBOARDING', 'Onboarding',
                                     'Incomplete Onboarding', 'INCOMPLETE ONBOARDING')
  loop
    perform public.creditops_route_client(r.id, null);
  end loop;
end $$;
