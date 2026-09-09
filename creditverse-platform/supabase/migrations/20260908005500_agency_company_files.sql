----------------------------------------------------------------------
-- 0232  BES's own company files, and a storage guard put back.
--
-- TWO FINDINGS FROM WALKING /app/files AS THE AGENCY:
--
-- 1. The screen renders at BES HQ and says "Your administrator has not added
--    any yet" — to the administrator. It could not be otherwise:
--    `save_company_document` requires an organization and `member_can`, and
--    the storage policy explicitly excluded the agency folder from company
--    uploads. The Hub doctrine (rule 18) says BES HQ's company hub and a
--    customer's are the SAME ENGINE with different owners — the agency owner
--    was simply never built. This builds it: same table, same entity type,
--    same screen; `organization_id` NULL and `agency_id` set is what says
--    whose it is.
--
-- 2. A regression: 0218's rewrite of `bes_files_insert` (channel attachments)
--    dropped 0057's `[2] is distinct from 'company'` guard. Storage policies
--    are permissive-OR, so since then ANY member could put an object into
--    their organization's company folder — the `files` row still required
--    `member_can`, so nothing appeared in the app, but the object landed.
--    The guard is restored; company paths go only through the company policy.
--
-- WHO MAY MANAGE BES'S OWN FILES
--
-- A new capability, `hub.files.manage`, resolved by `agency_can` like every
-- other: owner and admin always, everyone below only if granted. The org side
-- keeps `member_can(org, 'settings.manage')`, unchanged.
--
-- Rule 16 check: an agency company document has `organization_id` NULL, so no
-- organization-membership branch can ever reach it — customer users cannot
-- read BES's internal handbook, and BES staff reach a customer's documents
-- exactly as before.
----------------------------------------------------------------------

insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('hub.files.manage', 'hub', 'Manage BES company files',
   'Add and remove the documents in BES''s own company hub — handbooks, price lists, forms. Reading them needs only being BES staff.', false, 10)
on conflict (key) do nothing;

----------------------------------------------------------------------
-- Storage: restore the company guard, and open the agency company path.
----------------------------------------------------------------------
drop policy if exists bes_files_insert on storage.objects;
create policy bes_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    /* Company folders go ONLY through bes_files_company_insert. 0218 lost
       this line and with it the member_can gate on company uploads. */
    and (storage.foldername(name))[2] is distinct from 'company'
    and case
      when public.storage_channel_of(name) is not null
        then public.channel_writable(public.storage_channel_of(name))
      when (storage.foldername(name))[1] = 'agency'
        then public.is_agency_staff()
      else
        public.is_agency_staff()
        or public.is_org_member(((storage.foldername(name))[1])::uuid)
    end
  );

drop policy if exists bes_files_company_insert on storage.objects;
create policy bes_files_company_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    and (storage.foldername(name))[2] = 'company'
    and case
      when (storage.foldername(name))[1] = 'agency'
        then public.is_agency_staff() and public.agency_can('hub.files.manage')
      else public.member_can(((storage.foldername(name))[1])::uuid, 'settings.manage')
    end
  );

----------------------------------------------------------------------
-- The files row: the agency case beside the organization case.
----------------------------------------------------------------------
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and case
      when entity_type = 'company_document' then
        (organization_id is not null and public.member_can(organization_id, 'settings.manage'))
        or (organization_id is null
            and public.is_staff_of(agency_id)
            and public.agency_can('hub.files.manage'))
      when entity_type = 'funding_file' and public.is_borrower_of_file(entity_id::uuid) then true
      when entity_type = 'activity_event' then
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(public.files.entity_id))
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

drop policy if exists files_company_delete on public.files;
create policy files_company_delete on public.files for delete to authenticated
  using (
    entity_type = 'company_document'
    and (
      (organization_id is not null and public.member_can(organization_id, 'settings.manage'))
      or (organization_id is null
          and public.is_staff_of(agency_id)
          and public.agency_can('hub.files.manage'))
    )
  );

----------------------------------------------------------------------
-- The writer and remover learn the agency tenancy.
----------------------------------------------------------------------
create or replace function public.save_company_document(
  p_org uuid, p_path text, p_name text, p_mime text, p_size bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_agency uuid;
begin
  if p_org is not null then
    if not public.member_can(p_org, 'settings.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
    if p_path is null or p_path not like (p_org::text || '/company/%') then
      raise exception 'a company document must live in this organization''s company folder' using errcode = '42501';
    end if;
    insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by)
    values (p_org, public.org_agency(p_org), 'company_document', p_org::text, 'bes-files', p_path, p_name,
            nullif(p_mime, ''), p_size, auth.uid())
    returning id into v_id;
    perform public.log_audit('company_document.added', 'file', v_id::text, p_org, null,
                             jsonb_build_object('name', p_name, 'size_bytes', p_size));
  else
    /* BES's own hub. NULL organization is what keeps it out of every
       organization-membership read path (rule 16). */
    v_agency := public.my_agency_id();
    if v_agency is null or not public.agency_can('hub.files.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
    if p_path is null or p_path not like 'agency/company/%' then
      raise exception 'a BES company document must live in the agency company folder' using errcode = '42501';
    end if;
    insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by)
    values (null, v_agency, 'company_document', v_agency::text, 'bes-files', p_path, p_name,
            nullif(p_mime, ''), p_size, auth.uid())
    returning id into v_id;
    perform public.log_audit('company_document.added', 'file', v_id::text, null, null,
                             jsonb_build_object('name', p_name, 'size_bytes', p_size, 'agency', true));
  end if;
  return v_id;
end $$;

create or replace function public.delete_company_document(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_row public.files;
begin
  select * into v_row from public.files where id = p_id and entity_type = 'company_document';
  if v_row.id is null then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if v_row.organization_id is not null then
    if not public.member_can(v_row.organization_id, 'settings.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    if not (public.is_staff_of(v_row.agency_id) and public.agency_can('hub.files.manage')) then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;
  delete from public.files where id = p_id;
  perform public.log_audit('company_document.removed', 'file', p_id::text, v_row.organization_id, to_jsonb(v_row), null);
  return v_row.path;
end $$;

----------------------------------------------------------------------
-- entity_visible learns that a company document can belong to the agency.
-- The case widens from "the id is an organization" to "the id is the owning
-- organization or the owning agency"; everything else in the function is
-- exactly 0207's text.
----------------------------------------------------------------------
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    /* Added 0223. Its own policy decides, so a project out of somebody's
       scope is invisible here exactly as it is everywhere else. */
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    /* Keyed to the OWNER (0059: entity_id is the org id — and since 0232 an
       agency company document carries the agency id instead). Widened, not
       loosened: reading the row still needs the files policy, where an
       agency document has no organization branch at all (rule 16). */
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    -- An attachment on a note is visible exactly when the note is.
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    else false
  end
$function$;
revoke all on function public.entity_visible(text, text) from public, anon;
grant execute on function public.entity_visible(text, text) to authenticated;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone — and an activity row about an unknown type is REFUSED, which aborts whatever wrote it. Add the case, with a real check and never `true`, in the same migration that starts writing the type. `channel_message` 0199, `announcement` 0218, `crm_project` 0223, `company_document` widened to the agency owner 0232.';
