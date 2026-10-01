-- Found 2026-10-01: no device had registered for anyone. push_subscriptions
-- had row policies but no table grant — this project revokes the default
-- grants, so a new table must say who may touch it at all. The row policies
-- still decide WHICH rows: a person's own device, an admin's own agency.
begin;

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.push_delivery_events to authenticated;

commit;
