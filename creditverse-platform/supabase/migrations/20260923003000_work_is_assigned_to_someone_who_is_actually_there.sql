-- Automatic assignment skips people who are on leave, and nothing is left
-- with nobody on it.
--
-- Dee, 2026-09-23: "automatic assignment of client tasks based on AVAILABLE
-- agents on the queue per department, SLA, Priority handling — those are
-- normal project management capability." And, on what this workspace is for:
-- "this is where we document our work and assign tasks to agents ENSURING NO
-- MISSING CLIENTS."
--
-- ── WHAT ALREADY WORKED ───────────────────────────────────────────────────
--
-- `creditops_pick_assignee` already balances load properly: everyone placed in
-- that department by a live team, ordered by open actionable files ascending,
-- then by who was given work least recently. `creditops_route_client` calls it
-- when a department opens and `sla_sweep` calls it on expiry. That part is
-- sound and is not changed here.
--
-- ── THE THREE GAPS, MEASURED ──────────────────────────────────────────────
--
-- 1. IT COULD HAND WORK TO SOMEBODY ON LEAVE. The picker asked who is placed
--    in the department, never who is actually there today. A file assigned to
--    somebody on annual leave is worse than an unassigned one: it looks
--    handled, so nobody picks it up.
--
-- 2. WORK ALREADY OPEN WITH NOBODY ON IT WAS NEVER SWEPT UP. Assignment fired
--    only at the moment a department opened. Twelve actionable rows are
--    sitting unassigned right now — Complaints 4, Support 4, Dispute 2,
--    Bureau Calling 2 — because they were opened by paths that predate this,
--    or by `set_client_department_status`, which does not assign. Nothing ever
--    came back for them.
--
-- 3. WHEN NOBODY IS ELIGIBLE IT FAILED SILENTLY. `creditops_pick_assignee`
--    returns NULL for Bureau Calling, because no live team is attached to that
--    department. The caller wrote NULL and moved on. That is the exact shape
--    of a missing client: the system tried, could not, and told no one.
--
-- ── WHAT THIS ADDS ────────────────────────────────────────────────────────
--
-- Availability, a sweep, and a visible coverage gap. Load balancing, the
-- department mapping and the callers are untouched.
--
-- Cost impact: no material increase. The sweep runs on the existing hourly SLA
-- job rather than a new one, and does nothing when everything is assigned.

/* ── 1. Availability ──────────────────────────────────────────────────────
   Approved leave covering today takes somebody out of the rotation. Deliberately
   NOT clocked-in status: assignment happens at all hours, including from the
   overnight sweep, and refusing to assign tomorrow's work because nobody is
   clocked in at 3am would leave the queue empty every morning. Leave is a
   statement about the whole day; a punch is a statement about this minute. */
create or replace function public.creditops_available_today(p_user uuid, p_on date default current_date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select not exists (
    select 1 from public.leave_requests l
     where l.user_id = p_user
       and l.status = 'approved'
       and p_on between l.starts_on and l.ends_on
  )
$function$;

revoke execute on function public.creditops_available_today(uuid, date) from public, anon;
grant execute on function public.creditops_available_today(uuid, date) to authenticated;

/* ── 2. The picker prefers whoever is actually there ──────────────────────
   Verbatim replacement of the ordering, so the eligibility rules and the
   department mapping above it are provably unchanged. Availability sorts
   FIRST but does not exclude: if a whole department is on leave the work still
   lands on somebody rather than vanishing, and the queue shows it. */
do $$
declare
  v_def text := pg_get_functiondef('public.creditops_pick_assignee(public.fulfillment_department, uuid)'::regprocedure);
  v_old text := $q$  select user_id from load
   order by open_files asc, last_given asc nulls first, user_id asc
   limit 1$q$;
  v_new text := $q$  select user_id from load
   order by public.creditops_available_today(user_id) desc,
            open_files asc, last_given asc nulls first, user_id asc
   limit 1$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'creditops_pick_assignee no longer orders as expected — read it before replacing it';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

/* ── 3. Nothing actionable is left with nobody on it ──────────────────────
   Every actionable department row without an assignee, offered to the picker.
   Returns what it could not place, which is the coverage gap — a department
   with open work and nobody able to take it. */
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
    select s.client_id, s.department, c.agency_id
      from public.client_department_statuses s
      join public.fulfillment_clients c on c.id = s.client_id
     where s.assignee_id is null
       and public.creditops_status_is_actionable(s.department, s.status)
       and c.archived_at is null
     order by s.opened_at
  loop
    v_agent := public.creditops_pick_assignee(r.department, r.agency_id);

    if v_agent is null then
      /* Counted, not swallowed. A department with work and nobody to do it is
         the thing Dee means by a missing client, and it has to be visible. */
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

comment on function public.creditops_assign_unclaimed() is
  'Gives every actionable, unassigned CreditOps department row to the least-loaded '
  'available agent in that department, and REPORTS the ones it could not place. '
  'Cron''s, not a user''s (2026-09-23).';
