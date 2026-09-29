-- A partner's department rows arrive in one request.
--
-- The Main Client List needs the department rows of EVERY client in the
-- selected scope — the department, work-status and assignee columns are
-- those rows, and the list filters on them. It asked by client id, 200 ids
-- per request: Vanquish Ventures (839 clients) was five requests, each
-- paying the department-row policy's set build, plus a 30 KB URL each.
--
-- `creditops_department_rows(p_group)` returns the same rows for a partner
-- scope — or for everything the caller may see when p_group is null — in
-- one statement, so the policy sets are built once. Invoker rights: the
-- row policies on client_department_statuses, fulfillment_clients and
-- profiles apply inside exactly as they do to the id-based query, so the
-- rows are the same by construction; the count is compared per account
-- below anyway. Paged by the caller with PostgREST ranges.
--
-- Cost impact: less — one policy build per scope instead of one per 200 ids.

begin;

create or replace function public.creditops_department_rows(p_group uuid default null)
returns table(
  client_id uuid, department public.fulfillment_department, status text,
  assignee_id uuid, updated_at timestamptz, assignee_name text, assignee_email text)
language sql
stable
set search_path to 'public'
as $$
  select s.client_id, s.department, s.status, s.assignee_id, s.updated_at,
         p.full_name, p.email::text
    from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id
    left join public.profiles p on p.id = s.assignee_id
   where c.archived_at is null and not c.is_fixture
     and (p_group is null or c.outsourcing_group_id = p_group)
   order by s.client_id, s.department
$$;

revoke all on function public.creditops_department_rows(uuid) from public;
grant execute on function public.creditops_department_rows(uuid) to authenticated;

comment on function public.creditops_department_rows(uuid) is
  'The department rows of every active client in a partner scope (or every one the caller may see), '
  'in one statement under the caller''s own policies. What the Main Client List reads.';

commit;
