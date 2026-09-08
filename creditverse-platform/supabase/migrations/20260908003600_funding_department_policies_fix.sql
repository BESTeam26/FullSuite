-- 0213 — Correcting 0211's FundingOps half, which made it WIDER not narrower.
--
-- ---------------------------------------------------------------------------
-- WHAT I DID WRONG, AN HOUR AGO
--
-- 0211 fixed `client_department_statuses` and then tried to fix its FundingOps
-- twin the same way. It dropped policies named `funding_department_statuses_*`
-- and created three new ones asking `funding_department_writable`.
--
-- Those names did not exist. The real ones are `funding_dept_select`,
-- `funding_dept_insert`, `funding_dept_update` and `funding_dept_delete`. So
-- the drops were no-ops and the three new policies were added BESIDE the four
-- originals — and permissive policies are OR-ed.
--
-- The result was the opposite of the intention: `funding_department_statuses`
-- ended up with SEVEN permissive policies, and access became the union of the
-- old organization-only rule and the new one. Nothing was closed. Something
-- was opened.
--
-- This is the third time this project has been bitten by OR-ed permissive
-- policies — `agency_memberships_write`, `outsourcing_groups_write`, and now
-- my own. The lesson each time is the same and I did not apply it: LIST THE
-- POLICIES THAT ACTUALLY EXIST BEFORE DROPPING ANY BY NAME. A probe caught
-- it, which is the only reason it is being corrected in the same session
-- rather than found later.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES
--
-- Removes all seven and states the rule once, three times — the same shape
-- `client_department_statuses` now has. `funding_dept_delete` was
-- `is_agency_admin()`; it goes, because a department that was worked is not
-- un-worked (rule 11), and nothing in the product calls it.
-- ---------------------------------------------------------------------------

drop policy if exists funding_department_statuses_select on public.funding_department_statuses;
drop policy if exists funding_department_statuses_insert on public.funding_department_statuses;
drop policy if exists funding_department_statuses_update on public.funding_department_statuses;
drop policy if exists funding_dept_select on public.funding_department_statuses;
drop policy if exists funding_dept_insert on public.funding_department_statuses;
drop policy if exists funding_dept_update on public.funding_department_statuses;
drop policy if exists funding_dept_delete on public.funding_department_statuses;

revoke delete on public.funding_department_statuses from authenticated;

create policy funding_department_statuses_select on public.funding_department_statuses
  for select to authenticated using (public.funding_department_writable(client_id));
create policy funding_department_statuses_insert on public.funding_department_statuses
  for insert to authenticated with check (public.funding_department_writable(client_id));
create policy funding_department_statuses_update on public.funding_department_statuses
  for update to authenticated
  using (public.funding_department_writable(client_id))
  with check (public.funding_department_writable(client_id));

comment on function public.funding_department_writable(uuid) is
  'A funding department status is reachable exactly when its file is workable. The same shape as client_department_writable, and stated ONCE across three policies — 0211 left the four originals in place beside it and made access the union of both, which 0213 corrects.';
