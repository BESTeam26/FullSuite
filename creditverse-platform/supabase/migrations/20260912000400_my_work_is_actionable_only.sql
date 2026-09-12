-- =============================================================================
-- My Work means work I can do today. Plus a leak I left in the last migration.
--
-- ── THE SECURITY FIX FIRST ──────────────────────────────────────────────────
--
-- `creditops_assignment_required` was created without `security_invoker`, so
-- it ran as its owner and Row Level Security on the tables underneath it did
-- not apply. Any authenticated caller could have read every partner's
-- unassigned files — names, departments, statuses, deadlines — including
-- partners they are not authorized for. Narrow, and real: a view is a
-- privilege boundary unless it is told not to be (rule 1).
--
-- `work_attention` had it right; this one was written from memory rather than
-- from that example.
--
-- ── AND MY WORK ─────────────────────────────────────────────────────────────
--
-- Dee, 2026-09-11: "Waiting clients should not inflate active assigned
-- workload… My Work = currently actionable work actually assigned to that
-- employee."
--
-- One definition of actionable, `creditops_status_is_actionable`, already used
-- by the fair-distribution engine and the Assignment Required view. Reusing it
-- is the whole point: the number an agent sees in My Work is the number the
-- engine used when deciding they were busy. Two definitions would show an
-- agent five files while the engine believed they had eight.
--
-- Partner-owned work is excluded twice over — the engine clears the assignee
-- on `For Partner Confirmation`, and the routing kind is checked here anyway,
-- because a row that somehow kept an owner must still not read as that
-- person's to do.
-- =============================================================================

alter view public.creditops_assignment_required set (security_invoker = true);

create or replace view public.creditops_my_work as
  select s.client_id,
         c.name as client_name,
         c.public_id as client_public_id,
         c.organization_id,
         c.outsourcing_group_id,
         coalesce(o.name, g.name) as partner_name,
         c.round,
         c.status as credit_status,
         s.department,
         s.status as work_status,
         s.assignee_id,
         s.assignment_method,
         coalesce(s.manual_due_at, s.system_due_at) as due_at,
         s.updated_at,
         c.next_action
    from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
    left join public.creditops_status_routing r on r.status = c.status
   where s.assignee_id is not null
     and coalesce(c.lifecycle, 'active') = 'active'
     and c.archived_at is null
     /* Open, and not waiting on a bureau, a partner or the client. */
     and public.creditops_status_is_actionable(s.department, s.status)
     /* The file is not sitting with the partner. */
     and coalesce(r.kind, 'actionable') <> 'partner_action';

alter view public.creditops_my_work set (security_invoker = true);

comment on view public.creditops_my_work is
  'Actionable CreditOps department work, with its assignee. Callers filter to themselves; RLS decides which clients exist for them at all. Shares `creditops_status_is_actionable` with the assignment engine so My Work and the engine''s workload count can never disagree (Dee, 2026-09-11).';

grant select on public.creditops_my_work to authenticated;
