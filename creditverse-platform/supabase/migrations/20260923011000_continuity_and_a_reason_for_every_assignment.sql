-- Continuity with the client, and a reason recorded for every assignment.
--
-- From the CreditOps auto-assignment spec, 2026-09-23, which names its own
-- starting point: "For BES specifically, I would start with only three smart
-- factors in V1: PARTNER SCOPE + CURRENT WORKLOAD + CONTINUITY WITH THE
-- CLIENT. That is enough to make it genuinely smart without creating an
-- algorithm nobody understands."
--
-- Partner scope and workload are already in. This is continuity, and the thing
-- the spec asks for beside it:
--
--   "Why was this assigned to me? … That transparency will make the team trust
--    the auto-assignment rather than feel like the system is randomly dumping
--    work on them."
--
-- ── CONTINUITY IS MEASURED FROM WORK DONE, NOT FROM WHO HELD THE FILE ─────
--
-- The spec says "if the same agent handled the prior round successfully,
-- prefer keeping the client with that agent." Previous ASSIGNMENT is the
-- weaker signal — a file can be assigned to somebody who never touched it.
-- `production_logs` records who actually completed work on this client in this
-- department, which is what "handled it" means. Ten clients already carry that
-- history.
--
-- ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
--
-- Continuity sits BELOW availability and below partner scope. A previous
-- handler who is on leave does not get the file, and continuity can never pull
-- somebody into a partner they are not authorized for — the pool is decided
-- first and continuity only reorders within it. The spec's hard rule:
-- "auto-assignment may optimize WHO RECEIVES authorized work. It must NEVER
-- decide who is authorized."
--
-- Capacity is NOT implemented here, so continuity currently outranks workload
-- rather than yielding to it. The spec wants it overridden "if near/over
-- capacity", and capacity points do not exist yet — inventing a threshold now
-- would be a number nobody could justify. Recorded as the next step rather
-- than guessed at.
--
-- Cost impact: no material increase. One additional lookup per candidate, on a
-- path that runs when a department opens or once an hour.

alter table public.client_department_statuses
  add column if not exists assignment_reason text;

comment on column public.client_department_statuses.assignment_reason is
  'Why this person got this file, in words the agent can read: continuity, '
  'partner_agent, same_partner_batch, workload, or only_eligible. Written by '
  'the picker so "why was this assigned to me?" has a real answer (2026-09-23).';

/* One function decides, and it explains itself. `creditops_pick_assignee`
   below delegates to this, so the choice and the reason can never disagree —
   a second function recomputing the reason would drift from the first the day
   somebody edits one of them. */
create or replace function public.creditops_pick_assignee_explained(
  p_department public.fulfillment_department,
  p_agency uuid,
  p_group uuid default null,
  p_client uuid default null
)
returns table (user_id uuid, reason text)
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
                     when 'Onboarding'     then 'support'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
       and coalesce(am.status, 'active') = 'active'
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
           /* CONTINUITY — they have actually completed work on this client in
              this department before. */
           exists (
             select 1 from public.production_logs pl
              where pl.client_id = p_client
                and pl.employee_id = p.user_id
                and not pl.is_voided
                and (pl.department_key = p_department::text
                     or pl.department::text = p_department::text)
           ) as handled_before,
           /* One DisputeFox and one SOP before the next company (Dee). */
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
         /* The most specific true thing, so the sentence an agent reads is the
            reason that actually decided it. */
         case
           when c.handled_before  then 'continuity'
           when c.named           then 'partner_agent'
           when c.on_this_partner then 'same_partner_batch'
           when (select count(*) from ranked) = 1 then 'only_eligible'
           else 'workload'
         end
    from chosen c
$function$;

/* The existing signature keeps working and keeps its meaning, by asking the
   one above. No second copy of the logic. */
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
  select user_id from public.creditops_pick_assignee_explained(p_department, p_agency, p_group, null)
$function$;

/* The sweep records the reason it chose, and passes the client so continuity
   can be seen at all. */
create or replace function public.creditops_assign_unclaimed()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_pick record;
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
       (c.status::text = 'Prio Processing') desc,
       coalesce(s.manual_due_at, s.system_due_at) asc nulls last,
       s.opened_at asc
  loop
    select * into v_pick
      from public.creditops_pick_assignee_explained(
             r.department, r.agency_id, r.outsourcing_group_id, r.client_id);

    if v_pick.user_id is null then
      v_gaps := jsonb_set(v_gaps, array[r.department::text],
                          to_jsonb(coalesce((v_gaps ->> r.department::text)::int, 0) + 1));
      continue;
    end if;

    update public.client_department_statuses
       set assignee_id = v_pick.user_id,
           assigned_at = now(),
           assignment_method = 'automatic',
           assignment_reason = v_pick.reason
     where client_id = r.client_id and department = r.department
       and assignee_id is null;

    v_assigned := v_assigned + 1;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'unstaffed_departments', v_gaps);
end $function$;

revoke execute on function public.creditops_assign_unclaimed() from public, anon, authenticated;
revoke execute on function public.creditops_pick_assignee_explained(public.fulfillment_department, uuid, uuid, uuid) from public, anon;
grant execute on function public.creditops_pick_assignee_explained(public.fulfillment_department, uuid, uuid, uuid) to authenticated;
