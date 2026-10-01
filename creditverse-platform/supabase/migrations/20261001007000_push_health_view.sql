-- The management push health view (Dee, 2026-10-01): registered devices,
-- who, which browser, last successful push, last failure, removed devices.
-- A device remembers its own last success and failure (written by the
-- sender as they happen — nothing polls); admins may read every device in
-- their agency, everybody else only their own.
begin;

alter table public.push_subscriptions
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_failure    text;

drop policy if exists push_subscriptions_admin_read on public.push_subscriptions;
create policy push_subscriptions_admin_read on public.push_subscriptions
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.is_agency_admin());

commit;
