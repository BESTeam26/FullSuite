-- Qualify `client_id` in the department write policy.
--
-- 20260922027000 closed a real hole — writes reaching further than reads — but
-- its subqueries said `where c.id = client_id`, and `fulfillment_clients` has
-- a `client_id` column OF ITS OWN (the canonical client identity, read by
-- `fulfillment_clients_select` as `client_id in (select my_client_ids())`).
-- So the unqualified name bound to the INNER table, and the condition read
-- `c.id = c.client_id` — false for every row. The effect was that nobody could
-- write a department status at all, including the managers and agents who
-- should.
--
-- Caught immediately by measuring instead of assuming: every agent went to
-- UPDATE 0, including a division manager whose three gate conditions all
-- evaluated true when selected individually. Conditions that are true in a
-- SELECT and false in a policy are a name-resolution problem, not an
-- authorization one.
--
-- Same rule as 027000, references qualified: the client must be visible to the
-- caller, and the caller must work that department or be inside the owning
-- organization.
--
-- Cost impact: no material increase.

drop policy if exists client_department_statuses_update on public.client_department_statuses;
create policy client_department_statuses_update on public.client_department_statuses
  for update to authenticated
  using (
    public.client_department_writable(client_department_statuses.client_id)
    and exists (select 1 from public.fulfillment_clients c
                 where c.id = client_department_statuses.client_id)
    and (public.creditops_may_work(client_department_statuses.department)
         or public.is_org_member((select c.organization_id from public.fulfillment_clients c
                                   where c.id = client_department_statuses.client_id)))
  )
  with check (
    public.client_department_writable(client_department_statuses.client_id)
    and exists (select 1 from public.fulfillment_clients c
                 where c.id = client_department_statuses.client_id)
    and (public.creditops_may_work(client_department_statuses.department)
         or public.is_org_member((select c.organization_id from public.fulfillment_clients c
                                   where c.id = client_department_statuses.client_id)))
  );

drop policy if exists client_department_statuses_insert on public.client_department_statuses;
create policy client_department_statuses_insert on public.client_department_statuses
  for insert to authenticated
  with check (
    public.client_department_writable(client_department_statuses.client_id)
    and exists (select 1 from public.fulfillment_clients c
                 where c.id = client_department_statuses.client_id)
    and (public.creditops_may_work(client_department_statuses.department)
         or public.is_org_member((select c.organization_id from public.fulfillment_clients c
                                   where c.id = client_department_statuses.client_id)))
  );

comment on policy client_department_statuses_update on public.client_department_statuses is
  'Write. The client must be visible to the caller AND the caller must work that '
  'department (or be inside the owning organization) — the same two conditions '
  'set_client_department_status applies, so the direct-table route is not a way '
  'around it. A write must never reach further than a read. Every reference to '
  'client_id is table-qualified: fulfillment_clients has a client_id of its own '
  '(2026-09-22).';
