-- Opening a department is the handoff rule, not the writing rule.
--
-- 20260922027000/028000 required `creditops_may_work(department)` to INSERT a
-- department row. That is right for an UPDATE and wrong for an INSERT, because
-- a handoff exists precisely to open a department the caller does NOT work:
-- a Dispute agent passing a file to Complaints is the normal flow, and
-- `handoff_client_departments` says so in as many words — scope is checked on
-- the department the file is LEAVING, and "the destinations open as they
-- always did". Twelve handoff checks failed as 42501.
--
-- The rule the table should enforce is the same one the RPC enforces, stated
-- as a row condition: YOU MAY PASS ON WORK YOU HOLD. So a department may be
-- opened on a file where the caller already works one of its departments —
-- or, as ever, where they are acting inside the organization that owns it.
--
-- An agent who works nothing on this file still opens nothing, which is the
-- hole 027000 was closing; and UPDATE keeps the stricter test, because
-- CHANGING or closing a queue is not passing work to it.
--
-- Cost impact: no material increase. One EXISTS against a row already indexed
-- by client.

drop policy if exists client_department_statuses_insert on public.client_department_statuses;
create policy client_department_statuses_insert on public.client_department_statuses
  for insert to authenticated
  with check (
    public.client_department_writable(client_department_statuses.client_id)
    and exists (select 1 from public.fulfillment_clients c
                 where c.id = client_department_statuses.client_id)
    and (
      /* A department you work yourself. */
      public.creditops_may_work(client_department_statuses.department)
      /* …or one you are handing this file to, from a queue you DO work on it. */
      or exists (select 1 from public.client_department_statuses s2
                  where s2.client_id = client_department_statuses.client_id
                    and public.creditops_may_work(s2.department))
      /* …or it is your own organization's file. */
      or public.is_org_member((select c.organization_id from public.fulfillment_clients c
                                where c.id = client_department_statuses.client_id))
    )
  );

comment on policy client_department_statuses_insert on public.client_department_statuses is
  'Open a department. The client must be visible, and the caller must either work '
  'that department, already work another department ON THIS FILE (which is what a '
  'handoff is), or be inside the owning organization. Deliberately looser than the '
  'UPDATE policy: passing work to a queue is not the same act as changing it '
  '(2026-09-22).';
