-- Queue counts read the queue once.
--
-- `creditops_queue_counts()` joined `fulfillment_clients` a second time —
-- only to exclude fixture files — and so paid the client policy's hoisted
-- sets twice: 643 ms as an agent, of which the second pass was ~140 ms.
-- The queue view already joins the client; it now carries `is_fixture`
-- (appended, so every existing reader sees the same columns in the same
-- order) and the counts read it from there. Same rows, one policy pass.
--
-- Cost impact: less, on a query the sidebar runs for every user.

begin;

create or replace view public.creditops_department_queue as
 select s.client_id,
    s.department,
    s.status as work_status,
    c.status as credit_status,
    c.name as client_name,
    c.email as client_email,
    c.phone as client_phone,
    c.public_id as client_public_id,
    c.round,
    c.agency_id,
    c.organization_id,
    c.outsourcing_group_id,
    coalesce(o.name, g.name) as partner_name,
    coalesce(c.organization_id, c.outsourcing_group_id) as partner_scope_id,
    s.assignee_id,
    coalesce(p.full_name, p.email::text) as assignee_name,
    s.assignment_method,
    coalesce(s.manual_due_at, s.system_due_at) as due_at,
    s.blocked_reason,
    s.updated_at,
    public.creditops_status_is_actionable(s.department, s.status) as actionable,
    not public.creditops_status_is_actionable(s.department, s.status) as waiting,
    coalesce(c.is_fixture, false) as is_fixture
   from public.client_department_statuses s
     join public.fulfillment_clients c on c.id = s.client_id
     left join public.organizations o on o.id = c.organization_id
     left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
     left join public.profiles p on p.id = s.assignee_id
  where coalesce(c.lifecycle, 'active'::public.client_lifecycle) = 'active'::public.client_lifecycle
    and c.archived_at is null
    and upper(btrim(s.status)) <> all (array['BUREAU CALLING NOT NEEDED','BUREAU CALLING COMPLETED','COMPLAINT NOT NEEDED','COMPLAINT COMPLETED','SUPPORT RESOLVED','OB READY FOR R1','PARTNER ENDORSED','COMPLETED','ARCHIVED / INACTIVE'])
    and not public.partner_is_suspended(c.outsourcing_group_id);

create or replace function public.creditops_queue_counts()
returns table(department text, actionable integer, waiting integer)
language sql
stable
set search_path to 'public'
as $$
  select q.department::text,
         count(*) filter (where q.actionable)::int,
         count(*) filter (where q.waiting)::int
    from public.creditops_department_queue q
   where not q.is_fixture
   group by q.department
$$;

commit;
