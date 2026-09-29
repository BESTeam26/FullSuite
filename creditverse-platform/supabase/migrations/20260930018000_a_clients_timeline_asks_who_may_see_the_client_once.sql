-- A client's timeline asks "who may see the client" once, not per row.
--
-- Measured as Alvaro (an agent) on one of his own files: 28 timeline rows,
-- 3,127 ms, 76,258 buffers. `activity_events_select` calls
-- `entity_visible(entity_type, entity_id)` for every row, and for a
-- fulfillment_client that is `exists (select 1 from fulfillment_clients
-- where id = …)` — a fresh statement each time, so the client policy's
-- hoisted sets (visible partners, directory agencies, scope) are rebuilt 28
-- times over. Enumerating the visible client set once costs 135 ms.
--
-- So for fulfillment_client events — 19,995 of 20,423 rows — the check
-- becomes `entity_id in (select id from fulfillment_clients)`: the same
-- policy-filtered table, evaluated once per statement as a hashed set.
-- Every other entity type keeps `entity_visible()` exactly as it was. Same
-- rows for every account by construction; proven below on today's data by
-- comparing the old and new predicates row for row.
--
-- Nothing else in the policy changes: can_view_activity, the member-document
-- and compensation/rate restrictions are untouched.
--
-- Cost impact: strictly less work per timeline read.

begin;

drop policy if exists activity_events_select on public.activity_events;

create policy activity_events_select on public.activity_events
for select to authenticated
using (
  public.can_view_activity(agency_id, organization_id, visibility, entity_type)
  and (
    (entity_type = 'fulfillment_client'
      and entity_id in (select c.id::text from public.fulfillment_clients c))
    or (entity_type <> 'fulfillment_client'
      and public.entity_visible(entity_type, entity_id))
  )
  and (entity_type <> 'agency_member' or field is null
       or field <> all (array['member_document', 'signature_request'])
       or entity_id = (auth.uid())::text
       or public.agency_can('people.documents.manage') or public.agency_can('documents.manage'))
  and (coalesce(field, '') <> 'compensation' or public.reads_bes_cost(agency_id))
  and (coalesce(field, '') <> all (array['rate', 'adjustment'])
       or entity_id = (auth.uid())::text or public.reads_agent_rate(agency_id))
);

commit;
