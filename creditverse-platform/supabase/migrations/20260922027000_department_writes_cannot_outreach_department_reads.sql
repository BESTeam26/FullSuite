-- SECURITY: an agent could UPDATE department rows they were not allowed to READ.
--
-- Measured on live data, 2026-09-22:
--
--   bes.restricted   can SELECT  2 of 32 rows,  can blind-UPDATE 4
--   bes.credit       can SELECT  5 of 32 rows,  can blind-UPDATE 7
--
-- Write reach exceeding read reach is the wrong way round in every case, and
-- here it also bypassed the gate this morning's 20260922003000 installed.
-- That migration moved the department restriction out of React and into
-- `set_client_department_status` and `handoff_client_departments` — but the
-- TABLE policies still said only `client_department_writable(client_id)`,
-- which is `is_staff_of(agency) or is_org_member(org)` and nothing else. So
-- the RPC asked "do you work this queue" and a direct PostgREST update on the
-- same table asked nothing at all.
--
-- That is precisely rule 1: authorization is enforced in DATA access, not only
-- in the interface or the API in front of it. Closing it in the function and
-- leaving the table open is the same mistake one layer down.
--
-- ── THE RULE, MATCHING THE WRITERS EXACTLY ────────────────────────────────
--
--   1. the client must be VISIBLE to the caller — an EXISTS against
--      fulfillment_clients, which is itself row-filtered, so a write can never
--      again reach further than a read;
--   2. and the caller must work that department, OR be acting inside the
--      organization that owns the file (20260922024000).
--
-- Both are the conditions the RPCs already apply, so a legitimate caller sees
-- no change and the direct-table route stops being a way around them.
--
-- Routing is unaffected: `creditops_route_client` and the sweep are
-- SECURITY DEFINER or run as cron, so they do not read these policies.
--
-- Cost impact: no material increase. Two EXISTS on a write path that already
-- resolves the client row.

drop policy if exists client_department_statuses_update on public.client_department_statuses;
create policy client_department_statuses_update on public.client_department_statuses
  for update to authenticated
  using (
    public.client_department_writable(client_id)
    and exists (select 1 from public.fulfillment_clients c where c.id = client_id)
    and (public.creditops_may_work(department)
         or public.is_org_member((select c.organization_id from public.fulfillment_clients c where c.id = client_id)))
  )
  with check (
    public.client_department_writable(client_id)
    and exists (select 1 from public.fulfillment_clients c where c.id = client_id)
    and (public.creditops_may_work(department)
         or public.is_org_member((select c.organization_id from public.fulfillment_clients c where c.id = client_id)))
  );

drop policy if exists client_department_statuses_insert on public.client_department_statuses;
create policy client_department_statuses_insert on public.client_department_statuses
  for insert to authenticated
  with check (
    public.client_department_writable(client_id)
    and exists (select 1 from public.fulfillment_clients c where c.id = client_id)
    and (public.creditops_may_work(department)
         or public.is_org_member((select c.organization_id from public.fulfillment_clients c where c.id = client_id)))
  );

comment on policy client_department_statuses_update on public.client_department_statuses is
  'Write. The client must be visible to the caller AND the caller must work that '
  'department (or be inside the owning organization) — the same two conditions '
  'set_client_department_status applies, so the direct-table route is not a way '
  'around it. A write must never reach further than a read (2026-09-22).';
