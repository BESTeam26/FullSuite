-- Custom column values ask "who may see the client" once, not per row.
--
-- `custom_field_values_select` tests `exists (select 1 from
-- fulfillment_clients c where c.id = entity_id)` per row — the same per-row
-- client-policy rebuild the timeline and files policies had (20260930018000,
-- 20260930023000). No client column exists yet, so nobody has paid for it;
-- the first column somebody defines would put every list load on it. Same
-- rows, one hashed set per statement; the work_item branch is untouched.
-- Proven per account with a planted column and value on every client.
--
-- Cost impact: none today; strictly less the day a client column exists.

begin;

drop policy if exists custom_field_values_select on public.custom_field_values;
create policy custom_field_values_select on public.custom_field_values
for select to authenticated
using (
  (entity_type = 'work_item'
     and exists (select 1 from public.work_items wi where wi.id = custom_field_values.entity_id))
  or (entity_type = 'fulfillment_client'
     and entity_id in (select c.id from public.fulfillment_clients c))
);

commit;
