-- The department queues stop re-running the client policy six times a row.
--
-- Dee, 2026-09-28: queue loading must be fast. It was not loading at all:
-- `select * from creditops_department_queue limit 200` ran for 226 SECONDS
-- and then hit the statement timeout, with the stack sitting inside
-- `can_see_partner` → `is_admin_of`.
--
-- ── WHY ──────────────────────────────────────────────────────────────────
--
-- `client_department_statuses_select` asks, FOR EVERY ROW:
--
--   client_department_writable(client_id)   -- queries fulfillment_clients
--   ... AND one of ...
--   EXISTS (fulfillment_clients c WHERE c.id = client_id AND is_admin_of(...))
--   EXISTS (... AND is_team_lead_of(c.team_id))
--   EXISTS (... AND management_reach(...))
--   EXISTS (... AND org_scope_allows(...))
--
-- Every one of those is a query against `fulfillment_clients`, which has its
-- own row-level policy — so reading one department row runs the client policy
-- up to six times, and reading a queue of 1,208 does it thousands of times.
-- RLS inside RLS, per row.
--
-- Measured over a fixed sample of 164 rows, before: 5.6s for an admin, 11-21s
-- for everyone else. Multiply to 1,208 and the timeout is explained.
--
-- ── THE SAME REWRITE AS THE CLIENT LIST ──────────────────────────────────
--
-- `EXISTS (SELECT 1 FROM t WHERE t.id = row.col AND P(t))` and
-- `row.col IN (SELECT id FROM t WHERE P(t))` are the same statement. Postgres
-- evaluates the second ONCE and hashes it. Four EXISTS branches over the same
-- row collapse into one set, because a disjunction of predicates over one row
-- is one predicate.
--
-- ── WHY THESE ARE *NOT* SECURITY DEFINER ─────────────────────────────────
--
-- This is the part that would quietly widen access if it were got wrong.
-- Inside a policy, a subquery against `fulfillment_clients` still has that
-- table's OWN policy applied — so the original EXISTS required the client to
-- be visible to this viewer, not merely to exist. A SECURITY DEFINER helper
-- would bypass that and admit department rows for clients the viewer cannot
-- see.
--
-- So both helpers are left as INVOKER, deliberately, and the client policy
-- keeps applying inside them exactly as it did inside the EXISTS. They are
-- faster because they run once, not because they check less.
--
-- No recursion: the `fulfillment_clients` policy does not reference
-- `client_department_statuses`.
--
-- Verify by checksum over a fixed 164-row sample, per account, before and
-- after — the set of (client, department) pairs each person can see must be
-- identical. Do not accept this on a count alone.
--
-- Cost impact: strictly less work per read. It removes load rather than
-- adding any.

begin;

/* Clients whose department rows this viewer may read at all — exactly
   `client_department_writable`, hoisted out of the per-row position. */
create or replace function public.creditops_department_readable_client_ids()
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select c.id
    from public.fulfillment_clients c
   where public.is_staff_of(c.agency_id)
      or public.is_org_member(c.organization_id)
$$;

comment on function public.creditops_department_readable_client_ids() is
  'client_department_writable() as a set, computed once instead of per row. '
  'INVOKER on purpose: the fulfillment_clients policy must still apply inside.';

/* The four EXISTS branches, as one set. A disjunction of predicates over the
   same row is one predicate. */
create or replace function public.creditops_department_scope_client_ids()
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select c.id
    from public.fulfillment_clients c
   where public.is_admin_of(c.agency_id)
      or (c.team_id is not null and public.is_team_lead_of(c.team_id))
      or public.management_reach(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id)
      or (c.organization_id is not null
          and public.org_scope_allows(c.organization_id, c.assigned_agent_id))
$$;

comment on function public.creditops_department_scope_client_ids() is
  'Clients reachable by admin, team lead, management placement or org scope. '
  'INVOKER on purpose, as above.';

revoke all on function public.creditops_department_readable_client_ids() from public;
revoke all on function public.creditops_department_scope_client_ids() from public;
grant execute on function public.creditops_department_readable_client_ids() to authenticated;
grant execute on function public.creditops_department_scope_client_ids() to authenticated;

drop policy if exists client_department_statuses_select on public.client_department_statuses;

create policy client_department_statuses_select on public.client_department_statuses
for select
using (
  client_id in (select public.creditops_department_readable_client_ids())
  and (
    /* Cheapest first, and true for most agents: the queue they work. */
    department in (select public.my_creditops_departments())
    or assignee_id = (select auth.uid())
    or client_id in (select public.creditops_department_scope_client_ids())
  )
);

/* An index for the set-membership lookups the policy now does. */
create index if not exists client_department_statuses_client_department_idx
  on public.client_department_statuses (client_id, department);

commit;
