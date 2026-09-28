-- The CreditOps client list stops asking the same question 1,864 times.
--
-- Dee's team, 2026-09-28: "LATENCY is the main error, not loading properly
-- the app, esp the CreditOps."
--
-- ── MEASURED, NOT GUESSED ────────────────────────────────────────────────
--
-- The Main Client List, run AS each person with RLS on:
--
--   Dee Gallardo      agency_admin    2,280ms
--   Jet Manugas       agency_user     7,407ms
--   Allyssa Mores     agency_user    10,499ms
--   Ivan L. Olympia   agency_user    12,927ms
--
-- The plan is a sequential scan over 1,864 rows with the whole policy
-- expression evaluated PER ROW. Per-call costs, measured over 200 calls each:
--
--   in_scope                       4.20ms   (management_reach 2.37ms inside)
--   creditops_directory_visible    3.57ms
--   can_see_partner                2.17ms
--   agency_can                     0.75ms
--   bes_holds_partner              0.27ms
--   everything else               <0.05ms
--
-- Multiply by 1,864 rows and the twelve seconds are fully accounted for.
--
-- ── WHAT IS ACTUALLY WASTEFUL ────────────────────────────────────────────
--
-- None of those answers vary the way the loop implies. There are 27 partners
-- and one agency, so `can_see_partner` has 27 possible answers and
-- `creditops_directory_visible` has ONE — each recomputed for every row,
-- re-deriving the viewer's departments, services and management scope every
-- time. Rule 14 states it for the application ("resolve tenant, user, role,
-- permissions, scope and assignments ONCE, then reuse"); it applies just as
-- much inside a policy.
--
-- ── THE REWRITE IS A TAUTOLOGY ───────────────────────────────────────────
--
-- For a column that is a foreign key, `pred(row.col)` and
-- `row.col IN (SELECT id FROM t WHERE pred(id))` are the same statement: the
-- row's value is always in `t`, so the set answers for exactly the values that
-- occur. Postgres evaluates that subquery ONCE and hashes it — the same
-- mechanism already visible in this policy, where `my_client_ids()` costs
-- 2.2ms for the whole scan.
--
-- So 1,864 calls become 27, and 1,864 become 1. Nothing about WHO MAY SEE
-- WHAT is touched: the sets are defined by calling the same predicates, and
-- every branch of the policy is reproduced exactly (§22 — never weaken RLS to
-- gain speed).
--
-- ── AND THE ORDER MATTERS ────────────────────────────────────────────────
--
-- 14 of the 18 staff already satisfy `creditops_directory_visible`, which is
-- Dee's rule that every authorized CreditOps member can read the shared
-- directory. It sat LAST in an OR, so the expensive `in_scope` was evaluated
-- on every row first and its answer then discarded. OR is commutative; the
-- cheap once-computed check goes first and the expensive per-row one is
-- reached only by the people who actually need it.
--
-- Verify by checksum before and after: the exact set of client ids visible to
-- each of the 22 accounts, including the security fixtures, must be
-- unchanged. Any single row moving in either direction shows up as a
-- different md5. Do not accept this migration on a count alone.
--
-- Cost impact: no material increase — strictly less database work per read.
-- It REDUCES compute pressure, which is the lever §22 asks for before capacity.

begin;

/* ── The partner ids this viewer may work, computed once ──────────────────
   Exactly `bes_holds_partner(id) AND can_see_partner(id)`, which is what
   branch 3 asks per row. SECURITY DEFINER for the same reason those are:
   they read assignment and engagement tables the caller cannot. It returns
   only ids the policy would already have admitted. */
create or replace function public.creditops_visible_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.id
    from public.outsourcing_groups g
   where public.bes_holds_partner(g.id)
     and public.can_see_partner(g.id)
$$;

comment on function public.creditops_visible_group_ids() is
  'Partner ids satisfying bes_holds_partner AND can_see_partner for the caller. '
  'Exists so the client-list policy asks 27 times instead of once per row.';

/* ── The agencies whose CreditOps directory this viewer may read ──────────
   One row today. The point is that it is computed once rather than 1,864
   times at 3.57ms each. */
create or replace function public.creditops_directory_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id from public.agencies a
   where public.creditops_directory_visible(a.id)
$$;

comment on function public.creditops_directory_agency_ids() is
  'Agency ids where creditops_directory_visible() holds for the caller.';

revoke all on function public.creditops_visible_group_ids() from public;
revoke all on function public.creditops_directory_agency_ids() from public;
grant execute on function public.creditops_visible_group_ids() to authenticated;
grant execute on function public.creditops_directory_agency_ids() to authenticated;

/* ── The policy: every branch preserved, branch 3 hoisted and reordered ── */
drop policy if exists fulfillment_clients_select on public.fulfillment_clients;

create policy fulfillment_clients_select on public.fulfillment_clients
for select
using (
  /* 1 — the client's own portal identity (already hoisted, 2.2ms/scan). */
  client_id in (select public.my_client_ids())

  /* 2 — the file is assigned to me. `(select auth.uid())` rather than a bare
         call so it becomes an InitPlan instead of a per-row evaluation. */
  or ((assigned_agent_id = (select auth.uid())) and public.is_staff_of(agency_id))

  /* 3 — a partner file. THE branch that matters: every client in the system
         sits under a partner, so this is the one evaluated 1,864 times. */
  or (
    outsourcing_group_id is not null
    and outsourcing_group_id in (select public.creditops_visible_group_ids())
    and (
      /* Cheap and computed once — and true for most staff, so the expensive
         alternative below is usually never reached. */
      agency_id in (select public.creditops_directory_agency_ids())
      or (
        (select public.agency_can('partners.view'))
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service,
                            team_id, assigned_agent_id, created_by)
      )
    )
  )

  /* 4, 5, 6 — organization-owned and agency-owned files. Left exactly as they
     were: no client in the system matches them today, so they cost nothing
     and changing them would be risk without benefit. */
  or (
    outsourcing_group_id is null
    and organization_id is not null
    and public.bes_may_fulfil(organization_id, null::uuid, 'creditops'::public.fulfillment_service)
    and public.in_scope(agency_id, 'creditops'::public.fulfillment_service,
                        team_id, assigned_agent_id, created_by)
  )
  or (
    outsourcing_group_id is null
    and organization_id is null
    and public.is_staff_of(agency_id)
    and public.in_scope(agency_id, 'creditops'::public.fulfillment_service,
                        team_id, assigned_agent_id, created_by)
  )
  or (
    organization_id is not null
    and public.org_has_product(organization_id, 'creditOps'::public.product_key)
    and public.org_scope_allows(organization_id, assigned_agent_id)
  )
);

commit;
