-- 0345 — `client_id` meant the wrong table's column.
--
-- ---------------------------------------------------------------------------
-- AMBIGUOUS COLUMN CAPTURE, INSIDE A POLICY
--
-- 0344's admin branch read:
--
--     exists (select 1 from public.fulfillment_clients c
--              where c.id = client_id and public.is_admin_of(c.agency_id))
--
-- `fulfillment_clients` HAS ITS OWN COLUMN CALLED `client_id` — the link to
-- the canonical `clients` record. So inside that subquery, the unqualified
-- `client_id` bound to `c.client_id`, not to the outer
-- `client_department_statuses.client_id`. The condition became
-- `c.id = c.client_id`, which is never true, so the admin branch silently
-- never fired.
--
-- It parsed, it deployed, and every administrator's department queues went to
-- zero while agents in a department still saw theirs — which is exactly the
-- shape of bug that looks like an authorization decision rather than a typo.
--
-- Both references are qualified now. The rule is unchanged from 0344.
-- ---------------------------------------------------------------------------
drop policy if exists client_department_statuses_select on public.client_department_statuses;
create policy client_department_statuses_select on public.client_department_statuses
  for select to authenticated
  using (
    /* You must still be able to see the client at all. */
    public.client_department_writable(client_department_statuses.client_id)
    and (
      /* Running the operation means seeing the work in it. */
      exists (select 1 from public.fulfillment_clients c
               where c.id = client_department_statuses.client_id
                 and public.is_admin_of(c.agency_id))
      /* The department you are in. */
      or client_department_statuses.department in (select public.my_creditops_departments())
      /* Work handed to you personally stays visible wherever it sits — the
         same rule `in_scope` applies to every other record. */
      or client_department_statuses.assignee_id = auth.uid()
      /* A lead sees the work of the team that holds the client. A queue row
         carries no team of its own; the client does. */
      or exists (select 1 from public.fulfillment_clients c
                  where c.id = client_department_statuses.client_id
                    and c.team_id is not null
                    and public.is_team_lead_of(c.team_id))
    )
  );

comment on policy client_department_statuses_select on public.client_department_statuses is
  'Read a department queue row: you can see the client AND the row is your department''s, yours personally, or your team''s as its lead. Deliberately narrower than the shared directory — seeing a client and working their queue are different permissions (Dee, 2026-09-13).';
