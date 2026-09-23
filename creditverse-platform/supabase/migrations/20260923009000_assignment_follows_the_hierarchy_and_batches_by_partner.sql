-- Assignment works down a hierarchy, and hands an agent a partner at a time.
--
-- Dee, 2026-09-23: "the logic for assignment is not per file only, let's follow
-- logic hierarchy, GIVE FILES PER PARTNER GROUP so agent will work only on one
-- dispute fox and one SOP before they jump on the next company. Whoever is
-- priority, SLA, and Priority status. Once set to Prio, and credit status is
-- Prio Processing, they will be prioritized in agent assignment."
--
-- ── WHY BATCHING BY PARTNER IS THE REAL RULE ──────────────────────────────
--
-- Every partner has its own DisputeFox login and its own SOP. An agent handed
-- one file each from six partners signs in six times and reads six procedures
-- to do six files. The same six from one partner is one login and one
-- procedure. Load balancing alone actively CAUSES that scattering, because the
-- least-loaded agent changes after every single assignment — so a round of six
-- files lands on six different people, each on a different partner.
--
-- So affinity outranks load: a candidate already holding open work for this
-- partner takes the next one. Load still decides between candidates who are
-- equal on affinity, which is what keeps it fair over a day rather than a file.
--
-- ── AND THE ORDER THE WORK IS HANDED OUT ──────────────────────────────────
--
-- Priority first. `Prio Processing` is a real status the system already
-- escalates into after five unresolved days, and Dee confirms it is also set
-- deliberately. Either way it means "this one first", so the sweep now works
-- through the backlog in her order — priority, then what is closest to
-- breaching its SLA, then oldest — instead of plain oldest-first. Handing out
-- work in arrival order while something is five days overdue is how the
-- overdue thing stays overdue.
--
-- Dee's precedence, top to bottom, as implemented:
--
--   WHICH FILE GOES OUT NEXT   Prio Processing → nearest/most overdue SLA → oldest
--   WHO GETS IT                the partner's named agents, if it has any
--                              → already working that partner (one login, one SOP)
--                              → available for that shift, not on leave
--                              → fewest open files
--                              → waited longest for work
--
-- Cost impact: no material increase. One extra EXISTS per candidate, on a path
-- that runs when a department opens or once an hour.

/* ── Who gets it ──────────────────────────────────────────────────────── */
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
  /* The partner's own agents, narrowed to the ones who work this department —
     a partner's Support agent does not become its Dispute agent by being
     named. Dee: "Only support has dedicated members." */
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
           /* ALREADY ON THIS PARTNER — one DisputeFox, one SOP. */
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
  )
  select user_id from ranked
   order by here_today desc,          -- never somebody on leave or off shift
            on_this_partner desc,     -- keep them on one company
            open_files asc,           -- then share it out evenly
            last_given asc nulls first,
            user_id asc
   limit 1
$function$;

/* ── Which file goes out next ─────────────────────────────────────────── */
create or replace function public.creditops_assign_unclaimed()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_agent uuid;
  v_assigned int := 0;
  v_gaps jsonb := '{}'::jsonb;
begin
  for r in
    select s.client_id, s.department, c.agency_id, c.outsourcing_group_id
      from public.client_department_statuses s
      join public.fulfillment_clients c on c.id = s.client_id
     where s.assignee_id is null
       and public.creditops_status_is_actionable(s.department, s.status)
       and c.archived_at is null
     order by
       /* Dee's order: priority, then SLA, then oldest. Nulls last on the due
          date so a file with no deadline never jumps one that has one. */
       (c.status::text = 'Prio Processing') desc,
       coalesce(s.manual_due_at, s.system_due_at) asc nulls last,
       s.opened_at asc
  loop
    v_agent := public.creditops_pick_assignee(r.department, r.agency_id, r.outsourcing_group_id);

    if v_agent is null then
      v_gaps := jsonb_set(v_gaps, array[r.department::text],
                          to_jsonb(coalesce((v_gaps ->> r.department::text)::int, 0) + 1));
      continue;
    end if;

    update public.client_department_statuses
       set assignee_id = v_agent,
           assigned_at = now(),
           assignment_method = 'automatic'
     where client_id = r.client_id and department = r.department
       and assignee_id is null;

    v_assigned := v_assigned + 1;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'unstaffed_departments', v_gaps);
end $function$;

revoke execute on function public.creditops_assign_unclaimed() from public, anon, authenticated;

comment on function public.creditops_pick_assignee(public.fulfillment_department, uuid, uuid) is
  'Who takes this file (Dee, 2026-09-23): the partner''s named agents if it has '
  'any; then whoever is already working that partner, so an agent finishes one '
  'DisputeFox and one SOP before moving on; never somebody on leave or off '
  'shift; then the least loaded. Never returns nobody when somebody exists.';
