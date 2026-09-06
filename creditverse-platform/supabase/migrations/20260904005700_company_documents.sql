-- 0079 — Company documents (the Hub Core "Files" module)
--
-- Shared company documents: the handbook, the price list, the SOP everyone
-- needs. They are canonical `files` rows with `entity_type = 'company_document'`
-- and objects at `<organization_id>/company/<uuid>.<ext>` — no new table, no
-- second storage bucket (rules 2 and 6).
--
-- Who may do what:
--   read    every member of the organization (and BES staff of its agency,
--           through the existing tenancy policy)
--   publish a member with `settings.manage`
--   remove  the same, and the row is deleted with its object
--
-- The general tenancy policy would let *any* member upload into the
-- organization's folder, which is not what "the company's documents" means.
-- The `company` second segment is therefore carved out of it and governed on
-- its own, exactly as `activity` already is — permissive policies OR together,
-- so a carve-out is the only way to make the stricter rule the one that counts.

drop policy if exists bes_files_insert on storage.objects;
create policy bes_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    and (storage.foldername(name))[2] is distinct from 'company'
    and (
      (storage.foldername(name))[1] = 'agency' and public.is_agency_staff()
      or (
        (storage.foldername(name))[1] <> 'agency'
        and (
          public.is_agency_staff()
          or public.is_org_member(((storage.foldername(name))[1])::uuid)
        )
      )
    )
  );

create policy bes_files_company_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    and (storage.foldername(name))[2] = 'company'
    and (storage.foldername(name))[1] <> 'agency'
    and public.member_can(((storage.foldername(name))[1])::uuid, 'settings.manage')
  );

-- The `files` row for a company document follows the same rule. Every other
-- entity type keeps the policy it had.
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and case
      when entity_type = 'company_document' then
        organization_id is not null and public.member_can(organization_id, 'settings.manage')
      when entity_type = 'funding_file' and public.is_borrower_of_file(entity_id::uuid) then true
      when entity_type = 'activity_event' then
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(public.files.entity_id))
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

-- Removing a company document is a deliberate act by an administrator, and it
-- takes the object with it. Nothing else may delete a `files` row.
create policy files_company_delete on public.files for delete to authenticated
  using (
    entity_type = 'company_document'
    and organization_id is not null
    and public.member_can(organization_id, 'settings.manage')
  );

grant delete on public.files to authenticated;

-- The module now has a screen.
update public.hub_modules
   set status = 'available',
       backed_by = 'files + storage (entity_type company_document)',
       description = 'Shared company documents: handbooks, price lists, the forms everyone needs.'
 where key = 'files';

-- The writer. The client knows the organization; the agency comes from the
-- organization, not from the browser (rule 16: never trust a supplied
-- tenancy). Publishing and removing both check `settings.manage` here as well
-- as in the policies above, so neither path can be the loose one.
create or replace function public.save_company_document(
  p_org uuid, p_path text, p_name text, p_mime text, p_size bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
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
  return v_id;
end $$;
revoke all on function public.save_company_document(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.save_company_document(uuid, text, text, text, bigint) to authenticated;

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
  if not public.member_can(v_row.organization_id, 'settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.files where id = p_id;
  perform public.log_audit('company_document.removed', 'file', p_id::text, v_row.organization_id, to_jsonb(v_row), null);
  return v_row.path;
end $$;
revoke all on function public.delete_company_document(uuid) from public, anon;
grant execute on function public.delete_company_document(uuid) to authenticated;
