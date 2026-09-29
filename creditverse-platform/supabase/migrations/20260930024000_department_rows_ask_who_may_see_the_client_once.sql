-- Department rows ask "who may see the client" once, not twice.
--
-- `client_department_statuses_select` hoisted two sets —
-- creditops_department_readable_client_ids() and
-- creditops_department_scope_client_ids() — and EACH scanned
-- fulfillment_clients under the client policy: ~210 ms twice, on every
-- statement that touches a department row. Measured live: one client's
-- department rows 446 ms idle and 2,341 ms under load; a partner switch on
-- Vanquish paid it four times over.
--
-- One set-returning function now scans fulfillment_clients ONCE and returns
-- every (client, department) pair the viewer may read:
--   · readable clients × the viewer's own CreditOps departments
--   · scoped clients (team lead / manager / admin / org scope) × every department
--   · the rows assigned to the viewer (read as definer: only their own)
-- The policy is one hashed membership test on (client_id, department),
-- plus the assignee equality it always had. Same rows for every account —
-- proven old-policy against new, per account, inside one transaction.
--
-- Cost impact: less, on the most-hit table in CreditOps.

begin;

/* The viewer's own assigned pairs, without re-entering this table's policy
   (which would recurse). Definer, and strictly auth.uid()'s own rows. */
create or replace function public.creditops_my_assigned_pairs()
returns table(client_id uuid, department public.fulfillment_department)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.client_id, s.department
    from public.client_department_statuses s
   where s.assignee_id = auth.uid()
$$;
revoke all on function public.creditops_my_assigned_pairs() from public;
grant execute on function public.creditops_my_assigned_pairs() to authenticated;

create or replace function public.creditops_department_pairs_visible()
returns table(client_id uuid, department public.fulfillment_department)
language sql
stable
set search_path to 'public'
as $$
  with scope_teams as (
    select t.id, t.agency_id
      from public.teams t
     where t.archived_at is null
       and (public.is_team_lead_of(t.id)
            or public.management_reach(t.agency_id, 'creditops'::public.fulfillment_service, t.id))
  ),
  teamless as (
    select a.id as agency_id from public.agencies a
     where public.management_reach(a.id, 'creditops'::public.fulfillment_service, null)
  ),
  /* ONE pass over the clients the caller may see (this function is invoker:
     the client policy applies here, once). */
  clients as (
    select c.id,
           (public.is_staff_of(c.agency_id) or public.is_org_member(c.organization_id)) as readable,
           (public.is_admin_of(c.agency_id)
            or (c.team_id is not null and exists (select 1 from scope_teams s where s.id = c.team_id and s.agency_id = c.agency_id))
            or (c.team_id is null and exists (select 1 from teamless t where t.agency_id = c.agency_id))
            or (c.organization_id is not null and public.org_scope_allows(c.organization_id, c.assigned_agent_id))) as scoped
      from public.fulfillment_clients c
  ),
  my_depts as (select public.my_creditops_departments() as d)
  select c.id, d.d from clients c cross join my_depts d where c.readable
  union
  select c.id, x.d from clients c cross join unnest(enum_range(null::public.fulfillment_department)) x(d) where c.readable and c.scoped
  union
  select p.client_id, p.department from public.creditops_my_assigned_pairs() p
    join clients c on c.id = p.client_id and c.readable
$$;
revoke all on function public.creditops_department_pairs_visible() from public;
grant execute on function public.creditops_department_pairs_visible() to authenticated;

comment on function public.creditops_department_pairs_visible() is
  'Every (client, department) pair the caller may read, from one scan of the '
  'clients they may see. The set client_department_statuses_select hoists.';

drop policy if exists client_department_statuses_select on public.client_department_statuses;
create policy client_department_statuses_select on public.client_department_statuses
for select to authenticated
using (
  (client_id, department) in (select v.client_id, v.department from public.creditops_department_pairs_visible() v)
);

commit;
