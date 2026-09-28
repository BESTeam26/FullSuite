-- The last three per-row lookups in the CreditOps queue.
--
-- Dee, 2026-09-28: queue loading, partner switching and filters must be fast.
--
-- After the client list, the department policy and the partner lookup were
-- fixed, the department queue was 7.7s (from a 226s timeout). The plan showed
-- where the rest sat — these are PER-LOOP figures, so multiply by 115 rows:
--
--   creditops_department_scope_client_ids   2,884ms   once
--   Seq Scan on organizations                  16ms × 115  ≈ 1.8s
--   Seq Scan on profiles                       15ms × 115  ≈ 1.7s
--   Seq Scan on outsourcing_groups             ~9ms × 115  ≈ 1.0s
--
-- Three different tables, one shape: a policy that calls a function per row,
-- re-answering a question whose answer depends only on the viewer.
--
-- ── 1. THE SCOPE SET WAS ASKING PER CLIENT WHAT ONLY VARIES PER TEAM ─────
--
-- `creditops_department_scope_client_ids` called `is_team_lead_of` and
-- `management_reach` once per CLIENT — 1,864 times — when both depend only on
-- the team. There are a handful of teams. It now resolves the in-scope TEAMS
-- first and then selects clients by team.
--
-- The `team_id IS NULL` case is kept explicitly: `management_reach(agency,
-- service, NULL)` was reachable in the original and still is, so a client with
-- no team is treated exactly as before rather than quietly dropped.
--
-- ── 2 AND 3. THE PROFILE AND ORGANIZATION LOOKUPS ────────────────────────
--
-- `profiles_select` is `shares_scope_with(id)` and `organizations_select` is
-- `is_org_member(id) OR bes_may_see_organization(id)`. Both are hoisted into
-- a set, so the queue asks once per viewer instead of once per queue row.
--
-- Both helpers are SECURITY DEFINER for the same reason as
-- `my_visible_partner_ids`: they read the table whose policy calls them, so an
-- INVOKER helper would recurse. Not a widening — each set is defined by the
-- SAME predicate the policy applies, and those predicates are already
-- SECURITY DEFINER functions used in these policies today.
--
-- `profiles` is the one to be most careful with: it backs People, EOD,
-- assignment pickers and every avatar in the app. The checksum below covers
-- it for all 25 accounts.
--
-- Cost impact: strictly less work per read, on the three tables the whole app
-- joins to most.

begin;

/* ── 1. Teams first, then clients ────────────────────────────────────── */
create or replace function public.creditops_department_scope_client_ids()
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  with scope_teams as (
    /* The handful of teams this viewer leads or manages. Asked once per
       team instead of once per client. */
    select t.id, t.agency_id
      from public.teams t
     where t.archived_at is null
       and (public.is_team_lead_of(t.id)
            or public.management_reach(t.agency_id,
                                       'creditops'::public.fulfillment_service, t.id))
  ),
  /* `management_reach(agency, service, NULL)` was reachable in the original
     expression for a client with no team. Preserved deliberately. */
  teamless as (
    select a.id as agency_id
      from public.agencies a
     where public.management_reach(a.id, 'creditops'::public.fulfillment_service, null)
  )
  select c.id
    from public.fulfillment_clients c
   where public.is_admin_of(c.agency_id)
      or (c.team_id is not null
          and exists (select 1 from scope_teams s
                       where s.id = c.team_id and s.agency_id = c.agency_id))
      or (c.team_id is null
          and exists (select 1 from teamless t where t.agency_id = c.agency_id))
      or (c.organization_id is not null
          and public.org_scope_allows(c.organization_id, c.assigned_agent_id))
$$;

/* ── 2. Profiles ─────────────────────────────────────────────────────── */
create or replace function public.my_visible_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id from public.profiles p where public.shares_scope_with(p.id)
$$;

comment on function public.my_visible_profile_ids() is
  'Profile ids admitted by shares_scope_with() for the caller, computed once. '
  'SECURITY DEFINER because it reads the table whose policy calls it.';

revoke all on function public.my_visible_profile_ids() from public;
grant execute on function public.my_visible_profile_ids() to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
using (id in (select public.my_visible_profile_ids()));

/* ── 3. Organizations ────────────────────────────────────────────────── */
create or replace function public.my_visible_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id from public.organizations o
   where public.is_org_member(o.id) or public.bes_may_see_organization(o.id)
$$;

comment on function public.my_visible_organization_ids() is
  'Organization ids admitted by is_org_member() OR bes_may_see_organization() '
  'for the caller, computed once. SECURITY DEFINER to avoid recursing into '
  'the policy that calls it.';

revoke all on function public.my_visible_organization_ids() from public;
grant execute on function public.my_visible_organization_ids() to authenticated;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
for select
using (id in (select public.my_visible_organization_ids()));

commit;
