-- Is every client being taken care of? One question, one answer.
--
-- Dee, 2026-09-23: "we don't have capacity, let's just ensure every client is
-- being taken cared off and they're being assigned to the team, they have SLA
-- to follow to complete all the works."
--
-- So capacity scoring is dropped, and this is what replaces it: the four
-- numbers that say whether anything is falling through, per department.
--
-- ── WHY THIS DOES NOT LIVE IN THE ATTENTION CENTER ────────────────────────
--
-- Because the Attention Center reads `work_attention`, a view over
-- `work_items` — and a CreditOps client file is a row in
-- `client_department_statuses`, not a work item. So no CreditOps file has ever
-- appeared there, whatever state it was in. Bending one into the other would
-- mean inventing work-item columns for a thing that is not one.
--
-- ── WHAT IT FOUND ON THE FIRST RUN ────────────────────────────────────────
--
--     actionable files      25
--     unassigned             2   (Bureau Calling — no team attached yet)
--     overdue               13
--     assignee away today    0
--
-- Thirteen of twenty-five past their SLA. Assignment is working — those files
-- HAVE an owner — and they are still not being finished on time. That is the
-- thing Dee is asking to see, and no screen was showing it.
--
-- ── ASSIGNED IS NOT THE SAME AS COVERED ───────────────────────────────────
--
-- Three different failures, counted apart, because they need different
-- actions: nobody holds it (staff the department), the owner is away today
-- (reassign it), or somebody holds it and it is late (the SLA question). A
-- single "problem files" number would hide which.
--
-- SECURITY INVOKER: the counts are bounded by the caller's own row policies,
-- so an agent sees their own corner and a manager sees their division. Nobody
-- learns from a total that work exists which they cannot open.
--
-- Cost impact: no material increase — one grouped read of a table the queue
-- screens already load, called once per dashboard rather than per row.

create or replace function public.creditops_coverage()
returns table (
  department      text,
  actionable      int,
  unassigned      int,
  overdue         int,
  assignee_away   int,
  no_agent_at_all boolean
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    s.department::text,
    count(*)::int,
    count(*) filter (where s.assignee_id is null)::int,
    count(*) filter (where coalesce(s.manual_due_at, s.system_due_at) < now())::int,
    count(*) filter (
      where s.assignee_id is not null
        and not (public.creditops_available_today(s.assignee_id)
                 and public.creditops_works_today(s.assignee_id))
    )::int,
    /* True when the queue has work and the picker can find nobody for it —
       a department to STAFF, not a file to chase. Bureau Calling today. */
    bool_and(
      public.creditops_pick_assignee(s.department, c.agency_id, c.outsourcing_group_id) is null
    )
  from public.client_department_statuses s
  join public.fulfillment_clients c on c.id = s.client_id
 where public.creditops_status_is_actionable(s.department, s.status)
   and c.archived_at is null
 group by s.department::text
 order by 4 desc, 3 desc, 1
$function$;

revoke execute on function public.creditops_coverage() from public, anon;
grant execute on function public.creditops_coverage() to authenticated;

comment on function public.creditops_coverage() is
  'Per department: how much actionable work there is, how much nobody holds, '
  'how much is past SLA, and how much sits with somebody who is away today. '
  'Answers "is every client being taken care of" (Dee, 2026-09-23). SECURITY '
  'INVOKER, so it counts only what the caller may already see.';
