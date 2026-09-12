-- =============================================================================
-- The exceptions a human has to resolve, in one place.
--
-- Dee, 2026-09-11 §6: the Attention Center should surface "Assignment
-- Required, Routing Review Required, inactive/deactivated assignee with active
-- work, overdue actionable work, failed routing/assignment exceptions… Do not
-- treat Support Unassigned as an error."
--
-- Each of these is something the ENGINE cannot fix by itself:
--
--   assignment_required   an auto-distributed department with nobody eligible.
--                         Support is absent by construction — its unassigned
--                         files are waiting for a Team Lead, which is the
--                         normal course of business, not a failure.
--   inactive_assignee     somebody deactivated still holds actionable work.
--                         Dee, §11: never silently redistribute it — surface
--                         it so a lead reassigns deliberately, with an audit
--                         trail.
--   overdue               actionable work past its deadline. Waiting files are
--                         excluded: a round in the post is not late.
--
-- Invoker-rights, so a lead sees their scope and an agent sees theirs. The
-- same policies that decide which clients exist for them decide this.
-- =============================================================================

create or replace view public.creditops_exceptions as
  with base as (
    select s.client_id, c.name as client_name, c.agency_id, c.organization_id,
           c.outsourcing_group_id, s.department, s.status, s.assignee_id,
           coalesce(s.manual_due_at, s.system_due_at) as due_at, s.updated_at,
           d.assignment_mode
      from public.client_department_statuses s
      join public.fulfillment_clients c on c.id = s.client_id
      join public.departments d
        on d.agency_id = c.agency_id and d.division = 'creditops' and d.archived_at is null
       and d.key = case s.department
                     when 'Onboarding'     then 'onboarding'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
     where coalesce(c.lifecycle, 'active') = 'active'
       and c.archived_at is null
       and c.is_fixture = false
       and public.creditops_status_is_actionable(s.department, s.status)
  )
  select 'assignment_required'::text as kind, b.client_id, b.client_name, b.agency_id,
         b.organization_id, b.outsourcing_group_id, b.department, b.status,
         b.assignee_id, b.due_at, b.updated_at
    from base b
   where b.assignee_id is null and b.assignment_mode = 'auto_equal'
  union all
  select 'inactive_assignee', b.client_id, b.client_name, b.agency_id,
         b.organization_id, b.outsourcing_group_id, b.department, b.status,
         b.assignee_id, b.due_at, b.updated_at
    from base b
    join public.agency_memberships am
      on am.user_id = b.assignee_id and am.agency_id = b.agency_id
   where b.assignee_id is not null and coalesce(am.status, 'active') <> 'active'
  union all
  select 'overdue', b.client_id, b.client_name, b.agency_id,
         b.organization_id, b.outsourcing_group_id, b.department, b.status,
         b.assignee_id, b.due_at, b.updated_at
    from base b
   where b.due_at is not null and b.due_at < now();

alter view public.creditops_exceptions set (security_invoker = true);

comment on view public.creditops_exceptions is
  'CreditOps exceptions needing a person: an auto department that could not place a file, a deactivated employee still holding actionable work, and actionable work past its deadline. Support''s unassigned files are deliberately absent — there they are normal (Dee, 2026-09-11).';

grant select on public.creditops_exceptions to authenticated;
