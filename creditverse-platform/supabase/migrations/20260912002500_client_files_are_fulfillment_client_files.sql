-- =============================================================================
-- 56 client documents were filed under the wrong entity type.
--
-- Found the moment the composer tried to write one: "new row violates
-- row-level security policy for table files".
--
-- The ClickUp importer wrote every client attachment as `entity_type =
-- 'client'` with a FULFILLMENT CLIENT id. But `entity_visible('client', id)`
-- looks in `public.clients` — the canonical person — so none of those ids
-- resolved. The import got away with it because it ran as the service role,
-- which bypasses RLS entirely; the first ordinary user to upload a file hit
-- the policy the import had been skipping.
--
-- `fulfillment_client` is already a valid entity type and already resolves
-- against the right table. All 56 rows carry fulfillment client ids, and none
-- carries a canonical client id, so re-labelling them is exact rather than a
-- guess: the ids do not change, only the word describing what they are.
--
-- Nothing is uploaded again, no storage object moves, and every file stays
-- attached to the same client.
-- =============================================================================

update public.files
   set entity_type = 'fulfillment_client'
 where entity_type = 'client'
   and exists (select 1 from public.fulfillment_clients fc where fc.id::text = files.entity_id);

do $$
declare v_agency uuid; v_moved int;
begin
  get diagnostics v_moved = row_count;
  select id into v_agency from public.agencies limit 1;
  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (v_agency, null, 'agency', v_agency::text, null, 'System',
     'Client documents re-filed under the correct entity type',
     'Imported ClickUp attachments were stored as `client` with fulfillment client ids, which no policy could resolve. Re-labelled `fulfillment_client`. Ids, storage objects and the client each file belongs to are unchanged.',
     'files.entity_type', 'client', 'fulfillment_client', 'bes_internal');
end $$;
