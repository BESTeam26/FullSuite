-- 0165 — a partner's own client could not be created. Live defect.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG
--
-- Adding an end client to a BES Partner failed with "new row violates
-- row-level security policy for table fulfillment_clients". The insert policy
-- required `bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')`
-- — a live `fulfillment_engagements` row — for EVERY client, whoever owns it.
--
-- WHY THAT IS THE WRONG TEST FOR A PARTNER'S CLIENT
--
-- A `fulfillment_engagement` is an AUTHORIZATION: it is what allows BES staff
-- to reach a CUSTOMER'S OWN operational data (rule 16's critical access rule).
-- That is exactly right for a client owned by an organization — a SaaS tenant
-- whose records belong to them, and which BES may not touch without one.
--
-- It is the wrong test for a client owned by an outsourcing group. Rule 16,
-- model 3: "agency-managed records may exist INDEPENDENTLY, because the
-- external customer system is not a BES canonical source and cannot be one."
-- BES creates that record, BES holds it, and there is no customer tenant whose
-- privacy the engagement was protecting. Requiring one there guards nothing
-- and blocks the product — a partner BES is demonstrably working for cannot be
-- given the clients BES is working on.
--
-- THE CORRECTION, STATED PRECISELY
--
--   organization-owned client  →  bes_may_fulfil, unchanged. A customer's data
--                                 still needs an engagement, always.
--   partner-owned client       →  agency staff, with the partner capability,
--                                 on a partner that is not archived, and still
--                                 narrowed by in_scope.
--
-- This is a deliberate widening of exactly one branch, and it does not touch
-- the organization branch at all. `in_scope` still applies to both, so an
-- agent sees their own assignments and no more.
-- ---------------------------------------------------------------------------

/**
 * May the caller work on this partner's own records?
 *
 * Staff of the partner's agency, and the partner is not archived. Deliberately
 * NOT an engagement check: for an outsourcing group BES is the source of the
 * record, not a visitor to somebody else's system.
 */
create or replace function public.bes_holds_partner(p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_group is not null and exists (
    select 1 from public.outsourcing_groups g
     where g.id = p_group
       and public.is_staff_of(g.agency_id)
       and g.lifecycle <> 'archived'
  )
$function$;
revoke execute on function public.bes_holds_partner(uuid) from public, anon;
grant execute on function public.bes_holds_partner(uuid) to authenticated;

comment on function public.bes_holds_partner(uuid) is
  'Agency staff, on a partner that is not archived. The authorization for records BES itself owns on behalf of an outsourcing partner (rule 16, model 3) — not a substitute for bes_may_fulfil, which still gates every organization-owned record.';

-- ── Insert ──────────────────────────────────────────────────────────────
drop policy if exists fulfillment_clients_insert on public.fulfillment_clients;
create policy fulfillment_clients_insert on public.fulfillment_clients
  for insert to authenticated
  with check (
    (
      /* A partner BES holds records for. Capability, not engagement. */
      outsourcing_group_id is not null
      and organization_id is null
      and public.bes_holds_partner(outsourcing_group_id)
      and public.agency_can('partners.clients')
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, null, null)
    )
    or (
      /* A customer's own client. Unchanged: the engagement decides. */
      organization_id is not null
      and public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops'::public.fulfillment_service)
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, null, null)
    )
    /* A team named on the row must be a live team. Applies to both branches:
       assignment to an archived team is how work disappears. */
    and (
      team_id is null or exists (
        select 1 from public.teams t
         where t.id = fulfillment_clients.team_id and t.archived_at is null
      )
    )
  );

-- ── Select ──────────────────────────────────────────────────────────────
drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients
  for select to authenticated
  using (
    (
      outsourcing_group_id is not null
      and public.bes_holds_partner(outsourcing_group_id)
      and public.agency_can('partners.view')
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by)
    )
    or (
      public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops'::public.fulfillment_service)
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by)
    )
    or (
      /* The customer's own staff, in their own workspace. Untouched. */
      public.org_has_product(organization_id, 'creditOps'::public.product_key)
      and public.org_scope_allows(organization_id, assigned_agent_id)
    )
  );

-- ── Update ──────────────────────────────────────────────────────────────
drop policy if exists fulfillment_clients_update on public.fulfillment_clients;
create policy fulfillment_clients_update on public.fulfillment_clients
  for update to authenticated
  using (
    (
      outsourcing_group_id is not null
      and public.bes_holds_partner(outsourcing_group_id)
      and public.agency_can('partners.clients')
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by)
    )
    or (
      public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops'::public.fulfillment_service)
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by)
    )
  )
  with check (
    team_id is null or exists (
      select 1 from public.teams t
       where t.id = fulfillment_clients.team_id and t.archived_at is null
    )
  );
