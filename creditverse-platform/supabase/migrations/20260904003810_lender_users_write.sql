-- 0058 gave lender_users a select policy only, so nobody could link a platform
-- user to a lender (found by the phase-22 matrix probe: 42501 on insert).
-- Whoever may edit the lender may add or remove its users. Rows are a link,
-- not history, so delete is the right verb here.
create policy lender_users_insert on public.lender_users for insert to authenticated
  with check (public.lender_editable(lender_id));
create policy lender_users_delete on public.lender_users for delete to authenticated
  using (public.lender_editable(lender_id));
grant insert, delete on public.lender_users to authenticated;
