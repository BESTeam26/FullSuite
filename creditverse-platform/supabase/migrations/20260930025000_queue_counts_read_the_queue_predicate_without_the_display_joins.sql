-- Queue counts read the queue predicate without the display joins.
--
-- After the queue view became security_invoker (20260930021000), the
-- counts function paid for: the department-row policy, the client policy,
-- AND the policies of three display joins it never reads (organizations,
-- outsourcing_groups, profiles) — and then a second client policy pass
-- through its own join. Measured as an agent: 511 ms for two numbers.
--
-- The queue predicate now lives ONCE, in `creditops_queue_base`: which
-- (department row, client) pairs are open work. The display view selects
-- from it and adds the names; the counts function reads the base and adds
-- nothing. Same predicate, one definition, no drift (rule 2). Both views
-- read as the caller. The counts function's extra join is gone because the
-- base view already applies the client policy through security_invoker —
-- proven per account, same transaction, before this shipped.
--
-- Cost impact: less, on the query every CreditOps screen runs.

begin;

create or replace view public.creditops_queue_base
with (security_invoker = true) as
 select s.client_id,
        s.department,
        s.status        as work_status,
        s.assignee_id,
        s.assignment_method,
        coalesce(s.manual_due_at, s.system_due_at) as due_at,
        s.blocked_reason,
        s.updated_at,
        c.status        as credit_status,
        c.name          as client_name,
        c.email         as client_email,
        c.phone         as client_phone,
        c.public_id     as client_public_id,
        c.round,
        c.agency_id,
        c.organization_id,
        c.outsourcing_group_id,
        coalesce(c.is_fixture, false) as is_fixture,
        public.creditops_status_is_actionable(s.department, s.status)     as actionable,
        not public.creditops_status_is_actionable(s.department, s.status) as waiting
   from public.client_department_statuses s
   join public.fulfillment_clients c on c.id = s.client_id
  where coalesce(c.lifecycle, 'active'::public.client_lifecycle) = 'active'::public.client_lifecycle
    and c.archived_at is null
    and upper(btrim(s.status)) <> all (array['BUREAU CALLING NOT NEEDED','BUREAU CALLING COMPLETED','COMPLAINT NOT NEEDED','COMPLAINT COMPLETED','SUPPORT RESOLVED','OB READY FOR R1','PARTNER ENDORSED','COMPLETED','ARCHIVED / INACTIVE'])
    and not public.partner_is_suspended(c.outsourcing_group_id);

comment on view public.creditops_queue_base is
  'The queue predicate, defined once: open department work on active, unsuspended clients. '
  'creditops_department_queue adds the display names; creditops_queue_counts reads this directly.';

/* The display view: the same columns in the same order as before, from the base. */
create or replace view public.creditops_department_queue
with (security_invoker = true) as
 select b.client_id,
    b.department,
    b.work_status,
    b.credit_status,
    b.client_name,
    b.client_email,
    b.client_phone,
    b.client_public_id,
    b.round,
    b.agency_id,
    b.organization_id,
    b.outsourcing_group_id,
    coalesce(o.name, g.name) as partner_name,
    coalesce(b.organization_id, b.outsourcing_group_id) as partner_scope_id,
    b.assignee_id,
    coalesce(p.full_name, p.email::text) as assignee_name,
    b.assignment_method,
    b.due_at,
    b.blocked_reason,
    b.updated_at,
    b.actionable,
    b.waiting,
    b.is_fixture
   from public.creditops_queue_base b
     left join public.organizations o on o.id = b.organization_id
     left join public.outsourcing_groups g on g.id = b.outsourcing_group_id
     left join public.profiles p on p.id = b.assignee_id;

grant select on public.creditops_queue_base to authenticated;

create or replace function public.creditops_queue_counts()
returns table(department text, actionable integer, waiting integer)
language sql
stable
set search_path to 'public'
as $$
  /* The base view reads as the caller: the department-row and client
     policies apply inside it. Nothing here adds a join it does not read. */
  select b.department::text,
         count(*) filter (where b.actionable)::int,
         count(*) filter (where b.waiting)::int
    from public.creditops_queue_base b
   where not b.is_fixture
   group by b.department
$$;

commit;
