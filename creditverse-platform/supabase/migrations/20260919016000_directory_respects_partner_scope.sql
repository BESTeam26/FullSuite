-- The Main Client List respects Partner scope — Dee, 2026-09-19.
--
-- Supersedes the 2026-09-13 rule ("do NOT require Partner assignment for Main
-- Client List visibility"). Dee, after seeing a Complaints & Mailing agent
-- offered every CreditOps client: "creditops.clients.view may allow the
-- CreditOps client-directory EXPERIENCE. It must NOT mean all CreditOps
-- clients. Keep directory permission separate from record scope… An Agent can
-- see a client only when that client's Partner is visible through direct
-- partner assignment OR partner assignment inherited through one of the
-- user's active teams."
--
-- So the directory branch now intersects with can_see_partner(), which
-- already encodes exactly that (direct · team · managed department; admin by
-- role) and is NOT broadened here. A client held for a SaaS organization
-- (model 2) keeps the bes_may_fulfil ∩ in_scope branch; a client with no
-- partner at all is reachable only through in_scope (assignment / team).
-- Because department queues, checklists and production writes all check the
-- client row under RLS, they inherit the intersection with no change of their
-- own. Proof: complaints-agent-matrix-probe.mjs (before: 8/11 · after: 11/11).

drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients
  for select to authenticated
  using (
    /* The client's own portal user. */
    client_id in (select public.my_client_ids())
    /* Partner-held (model 3): BES holds the partner, the caller may see THAT partner, and the record is in scope
       or the caller has the CreditOps directory. */
    or (outsourcing_group_id is not null
        and public.bes_holds_partner(outsourcing_group_id)
        and public.can_see_partner(outsourcing_group_id)
        and (public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by)
             or (public.agency_can('partners.view') and public.creditops_directory_visible(agency_id))))
    /* Organization-held (model 2): a live engagement, and the record in scope. */
    or (outsourcing_group_id is null and organization_id is not null
        and public.bes_may_fulfil(organization_id, null, 'creditops'::public.fulfillment_service)
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))
    /* Held by nobody: assignment or team only. */
    or (outsourcing_group_id is null and organization_id is null
        and public.is_staff_of(agency_id)
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))
  );
