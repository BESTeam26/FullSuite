-- Rule 1 audit finding (Dee's hardening sweep, 2026-09-09): the Upload
-- button on the partner Files tab is gated on `partners.files.upload`, but
-- the DATABASE accepted a partner file from any staff member who could see
-- the partner. Hiding a button is presentation, not protection — the insert
-- policy now asks the same question the button does. Every other branch of
-- files_insert is unchanged.
drop policy files_insert on public.files;
create policy files_insert on public.files
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and case
      when entity_type = 'company_document' then
        ((organization_id is not null and member_can(organization_id, 'settings.manage'))
         or (organization_id is null and is_staff_of(agency_id) and agency_can('hub.files.manage')))
      when entity_type = 'funding_file' and is_borrower_of_file(entity_id::uuid) then true
      when entity_type = 'activity_event' then
        ((is_staff_of(agency_id) or (organization_id is not null and is_org_member(organization_id)))
         and exists (select 1 from activity_events ae where ae.id = try_bigint(files.entity_id)))
      /* A partner file needs the named permission, not just staff sight of
         the partner (0247's tab always said so; now the database agrees). */
      when entity_type = 'partner' then
        (is_staff_of(agency_id) and agency_can('partners.files.upload')
         and entity_visible(entity_type, entity_id))
      else
        ((is_staff_of(agency_id) or (organization_id is not null and is_org_member(organization_id)))
         and entity_visible(entity_type, entity_id))
    end
  );
