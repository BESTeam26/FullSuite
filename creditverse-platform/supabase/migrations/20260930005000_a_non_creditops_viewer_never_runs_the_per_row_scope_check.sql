-- A non-CreditOps viewer never runs the per-row scope check.
--
-- Dee, 2026-09-30: "inspect why JM's path is ~2.7 seconds. If the system is
-- doing unnecessary CreditOps work for someone who is not even a CreditOps
-- member, eliminate that unnecessary query path rather than compensating
-- with data."
--
-- JM Navales is an executive assistant; James Ivan Lazo and Mark Angelo
-- Alano are CRM; Bryan and Roniel are not CreditOps. For each of them the
-- client-list policy still reached its expensive alternative —
-- `in_scope(...)` per row, 4.2ms a call over 1,864 rows — because the cheap
-- once-computed branch (`creditops_directory_visible`) is false for them and
-- the OR falls through. Every row was checked to conclude, every time, that
-- none of them is visible. JM: 2,714ms to see zero clients.
--
-- ── THE GUARD, AND WHY IT IS A TAUTOLOGY ─────────────────────────────────
--
-- `in_scope(agency, 'creditops', team, assignee, creator)` can be true only
-- when one of these holds for the viewer:
--
--   is_admin_of(agency)                      viewer-only
--   assignee = auth.uid()                    already ADMITTED by branch 2 of
--                                            the policy, which is unchanged
--   a team branch (member / lead / dept)     requires a CreditOps team
--   management_reach(agency, creditops, …)   requires a live seat reaching
--                                            CreditOps, or agency scope
--
-- So `creditops_any_reach()` — computed ONCE — asks exactly "could any of
-- those be true for this viewer at all". When it is false, `in_scope` could
-- only have admitted rows via `assignee = auth.uid()`, and branch 2 already
-- admits those. The visible set is therefore identical; the difference is
-- that 1,864 function calls are replaced by one boolean.
--
-- Verified by checksum of every account's visible client ids before and
-- after, the six security fixtures included.
--
-- Cost impact: strictly less work per read, for exactly the people who
-- should cost the least.

begin;

create or replace function public.creditops_any_reach()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.agency_memberships m
     where m.user_id = auth.uid() and m.status = 'active'
       and (
         m.role = 'agency_admin'
         or (public.agency_can('ops.manage') and m.scope = 'agency')
         /* On any live CreditOps team, in any capacity. */
         or exists (
           select 1 from public.team_memberships tm
             join public.teams t on t.id = tm.team_id and t.archived_at is null
             join public.departments d on d.id = t.department_id
            where tm.user_id = m.user_id and d.division = 'creditops' and d.archived_at is null)
         /* Or a live seat that reaches CreditOps: its division, one of its
            departments, or the agency. */
         or exists (
           select 1 from public.management_seats s
             left join public.divisions dv on dv.id = s.division_id
             left join public.departments sd on sd.id = s.department_id
            where s.user_id = m.user_id and public.seat_is_live(s.effective_from, s.effective_to)
              and (dv.service = 'creditops' or sd.division = 'creditops'
                   or (s.division_id is null and s.department_id is null)))
       )
  )
$$;

comment on function public.creditops_any_reach() is
  'Could in_scope() for creditops be true for the caller through anything other '
  'than being the assignee? Computed once so the per-row check is skipped for '
  'people who are not CreditOps at all.';

revoke all on function public.creditops_any_reach() from public;
grant execute on function public.creditops_any_reach() to authenticated;

drop policy if exists fulfillment_clients_select on public.fulfillment_clients;

create policy fulfillment_clients_select on public.fulfillment_clients
for select
using (
  client_id in (select public.my_client_ids())
  or ((assigned_agent_id = (select auth.uid())) and public.is_staff_of(agency_id))
  or (
    outsourcing_group_id is not null
    and outsourcing_group_id in (select public.creditops_visible_group_ids())
    and (
      agency_id in (select public.creditops_directory_agency_ids())
      or (
        (select public.agency_can('partners.view'))
        /* THE GUARD: one boolean before 1,864 function calls. */
        and (select public.creditops_any_reach())
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service,
                            team_id, assigned_agent_id, created_by)
      )
    )
  )
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
