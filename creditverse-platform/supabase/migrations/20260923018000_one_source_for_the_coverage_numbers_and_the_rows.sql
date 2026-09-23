-- Coverage, per client, so a card that says 13 filters to thirteen rows.
--
-- The coverage design, 2026-09-23: a strip at the top of CreditOps — Active
-- Work, Unassigned, Owner Away, Overdue, On Track — with each card clickable:
-- "Click 13 Overdue → filters the workspace to only overdue actionable files."
--
-- `creditops_coverage()` already returns the per-department TOTALS. It cannot
-- drive the filtering, because a total is a number and a filter needs to know
-- WHICH rows. Computing the number on the server and the filter in the browser
-- is how a card reading 13 comes to show twelve rows — the same trap the quick
-- view tabs avoid by counting with the predicate that filters.
--
-- So this returns the STATE OF EVERY ACTIONABLE FILE, once. The strip adds
-- them up and the list filters on them, from one answer. They cannot disagree.
--
-- ── THE FOUR STATES, IN THE ORDER THE DESIGN DEFINES THEM ─────────────────
--
--   unassigned   actionable, nobody holds it            → assign or staff
--   owner_away   held by somebody on leave or off shift → reassign
--   overdue      held by an available owner, SLA passed → the lead follows up
--   on_track     everything else
--
-- Exactly one state each, tested in that order, because they need different
-- actions and a file that is both unowned and late is an OWNERSHIP problem
-- first — chasing an owner who does not exist is not a follow-up.
--
-- SECURITY INVOKER: an agent sees their own corner, a manager their division.
-- The strip cannot become a way to learn that work exists which you cannot
-- open.
--
-- Cost impact: no material increase. One read of a table the queue screens
-- already load, replacing the separate per-department aggregate rather than
-- adding to it.

create or replace function public.creditops_coverage_states()
returns table (
  client_id  uuid,
  department text,
  state      text,
  due_at     timestamptz,
  assignee   uuid
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    s.client_id,
    s.department::text,
    case
      when s.assignee_id is null then 'unassigned'
      when not (public.creditops_available_today(s.assignee_id)
                and public.creditops_works_today(s.assignee_id)) then 'owner_away'
      when coalesce(s.manual_due_at, s.system_due_at) < now() then 'overdue'
      else 'on_track'
    end,
    coalesce(s.manual_due_at, s.system_due_at),
    s.assignee_id
  from public.client_department_statuses s
  join public.fulfillment_clients c on c.id = s.client_id
 where public.creditops_status_is_actionable(s.department, s.status)
   and c.archived_at is null
   and not c.is_fixture
$function$;

revoke execute on function public.creditops_coverage_states() from public, anon;
grant execute on function public.creditops_coverage_states() to authenticated;

comment on function public.creditops_coverage_states() is
  'One row per actionable CreditOps file with its coverage state: unassigned, '
  'owner_away, overdue or on_track. The strip totals these and the list filters '
  'on them, so a card reading 13 always filters to thirteen rows (2026-09-23).';
