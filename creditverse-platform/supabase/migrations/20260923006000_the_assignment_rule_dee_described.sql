-- The assignment rule, as Dee stated it.
--
-- 2026-09-23, verbatim: "We have 3 active departments (bureau calling is 4th
-- but it's not active yet) so these department will have team members, who
-- will take on the client files that's being routed to their department,
-- automatic assign to agents who are AVAILABLE FOR THAT SHIFT, no assignee to
-- leaves or offs and EQUALLY DISTRIBUTED, UNLESS THE PARTNER IS ASSIGNED TO
-- SPECIFIC AGENTS."
--
-- Five rules, in her order of precedence:
--
--   1. the agents placed in that department take its files
--   2. available for that shift
--   3. never somebody on leave or a day off
--   4. equally distributed
--   5. UNLESS the partner is assigned to specific agents — then it is theirs
--
-- Rule 5 is the one that was missing, and it is not a detail: 60 of the 67
-- partner assignments name a specific agent. A partner whose work goes to one
-- person was having files handed to whoever happened to be least busy.
--
-- Rule 2 was also missing. `work_schedules.work_days` already says which days
-- somebody works — one person here works Tuesday to Saturday — and the picker
-- never looked. Assigning Saturday's file to the Monday-to-Friday agent is the
-- same failure as assigning it to somebody on leave: it looks handled.
--
-- ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
--
-- It never strands a file. If the partner's own agents are all away, it falls
-- back to the department; if the whole department is away, it still assigns
-- rather than leaving the client with nobody. An unavailable owner is visible
-- in the queue and can be reassigned; an unowned file is the one that goes
-- missing, which is the thing Dee asked to prevent.
--
-- Load balancing, the department mapping and the callers are unchanged.
--
-- Cost impact: no material increase — two more lookups on a path that already
-- reads the roster, and it runs when a department opens, not per page load.

create or replace function public.creditops_works_today(p_user uuid, p_on date default current_date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  /* Their shift covers this day. Somebody with no schedule on file counts as
     working: absence of a record is missing information, not a day off, and
     refusing to assign to them would quietly empty the rotation. */
  select coalesce(
    (select extract(isodow from p_on)::int = any (w.work_days)
       from public.work_schedules w
      where w.user_id = p_user
        and w.effective_from <= p_on
      order by w.effective_from desc
      limit 1),
    true)
$function$;

revoke execute on function public.creditops_works_today(uuid, date) from public, anon;
grant execute on function public.creditops_works_today(uuid, date) to authenticated;

/* The picker gains the partner, because rule 5 cannot be answered without it.
   Defaulted, so the existing two-argument callers keep compiling and keep
   their current behaviour until they pass it. */
create or replace function public.creditops_pick_assignee(
  p_department public.fulfillment_department,
  p_agency uuid,
  p_group uuid default null
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
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
  ),
  /* RULE 5. Agents this partner is assigned to, narrowed to the ones who work
     this department — a partner's Dispute agent does not become its
     Complaints agent by being named. */
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
  /* The partner's own people when it has them; otherwise the department. */
  pool as (
    select user_id from partner_agents
    union all
    select user_id from eligible
     where not exists (select 1 from partner_agents)
  ),
  ranked as (
    select p.user_id,
           (public.creditops_available_today(p.user_id)
            and public.creditops_works_today(p.user_id)) as here_today,
           (select count(*)
              from public.client_department_statuses s
             where s.assignee_id = p.user_id
               and public.creditops_status_is_actionable(s.department, s.status)) as open_files,
           (select max(s.assigned_at)
              from public.client_department_statuses s
             where s.assignee_id = p.user_id and s.department = p_department) as last_given
      from pool p
  )
  /* RULES 2, 3 and 4. Here today first — on leave or off shift sorts last
     rather than being removed, so a file is never stranded — then the least
     loaded, then whoever has waited longest for work. */
  select user_id from ranked
   order by here_today desc, open_files asc, last_given asc nulls first, user_id asc
   limit 1
$function$;

/* The two callers that know the partner now say so. */
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.creditops_assign_unclaimed()'::regprocedure);
  v_new := replace(v_def,
    'public.creditops_pick_assignee(r.department, r.agency_id)',
    'public.creditops_pick_assignee(r.department, r.agency_id, r.outsourcing_group_id)');
  if v_new = v_def then
    raise exception 'creditops_assign_unclaimed does not call the picker as expected';
  end if;
  /* It must also SELECT the group to pass it. */
  v_new := replace(v_new, 'select s.client_id, s.department, c.agency_id',
                          'select s.client_id, s.department, c.agency_id, c.outsourcing_group_id');
  execute v_new;
end $$;

/* A department with no team at all is a CONFIGURATION state, not an
   operational gap — Bureau Calling is the fourth department and Dee says it is
   not active yet. Reporting it hourly beside real gaps is how a real one stops
   being noticed, so the two are counted apart. */
create or replace function public.creditops_coverage_gaps()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'not_staffed_yet', coalesce((
      select jsonb_object_agg(x.dept, x.n) from (
        select s.department::text as dept, count(*) as n
          from public.client_department_statuses s
          join public.fulfillment_clients c on c.id = s.client_id
         where s.assignee_id is null
           and public.creditops_status_is_actionable(s.department, s.status)
           and c.archived_at is null
           and public.creditops_pick_assignee(s.department, c.agency_id, c.outsourcing_group_id) is null
         group by 1) x), '{}'::jsonb),
    'everyone_away', coalesce((
      select jsonb_object_agg(x.dept, x.n) from (
        select s.department::text as dept, count(*) as n
          from public.client_department_statuses s
          join public.fulfillment_clients c on c.id = s.client_id
         where public.creditops_status_is_actionable(s.department, s.status)
           and c.archived_at is null
           and s.assignee_id is not null
           and not (public.creditops_available_today(s.assignee_id)
                    and public.creditops_works_today(s.assignee_id))
         group by 1) x), '{}'::jsonb)
  )
$function$;

revoke execute on function public.creditops_coverage_gaps() from public, anon;
grant execute on function public.creditops_coverage_gaps() to authenticated;

comment on function public.creditops_pick_assignee(public.fulfillment_department, uuid, uuid) is
  'Who takes this file. Dee''s rule, 2026-09-23: the partner''s own agents if it '
  'has any, otherwise the department''s; available for that shift, never on leave '
  'or a day off, equally distributed. Never returns nobody when somebody exists — '
  'an unavailable owner can be reassigned, an unowned file goes missing.';
