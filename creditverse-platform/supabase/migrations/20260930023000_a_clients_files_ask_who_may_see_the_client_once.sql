-- A client's files ask "who may see the client" once, not per row.
--
-- Measured as an agent: counting the files on one of her own clients took
-- 330 ms idle and 2,051 ms under load, for two rows. `files_select` falls
-- to its ELSE branch for a fulfillment_client file and calls
-- `entity_visible()` per row — the same per-row client-policy rebuild the
-- timeline had (20260930018000). 29,612 of 29,653 files are client files.
--
-- A dedicated branch for fulfillment_client files: the same staff / org
-- test, and the client check as one hashed set per statement. Every other
-- entity type is untouched. Proven per account on a sample of client files,
-- old policy against new, inside one transaction.
--
-- Cost impact: strictly less work on every file read.

begin;

drop policy if exists files_select on public.files;

create policy files_select on public.files
for select to authenticated
using (
  case
    when entity_type = 'activity_event' then
      exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(files.entity_id))
    when entity_type = 'funding_file' and uploaded_by = auth.uid() and public.is_borrower_of_file(entity_id::uuid) then true
    when entity_type = 'client' then public.client_visible(entity_id::uuid)
    when entity_type = 'funding_file' then
      (public.is_staff_of(agency_id)
       or (organization_id is not null and public.is_org_member(organization_id))
       or exists (select 1 from public.funding_files ff join public.funding_clients fc on fc.id = ff.client_id
                   where ff.id = files.entity_id::uuid and fc.client_id in (select public.my_client_ids())))
      and public.entity_visible(entity_type, entity_id)
    when entity_type = 'agency_member' then
      public.is_staff_of(agency_id)
      and (public.agency_can('people.documents.manage')
           or exists (select 1 from public.member_documents md
                       where md.file_id = files.id and md.user_id = auth.uid() and md.visible_to_member))
    /* The CreditOps file: the client check is one set per statement. */
    when entity_type = 'fulfillment_client' then
      (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
      and entity_id in (select c.id::text from public.fulfillment_clients c)
    else
      (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
      and public.entity_visible(entity_type, entity_id)
  end
);

commit;
