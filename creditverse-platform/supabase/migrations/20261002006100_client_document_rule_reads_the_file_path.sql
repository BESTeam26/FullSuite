-- Hotfix to 20261002006000, applied minutes after it (2026-10-02).
--
-- Inside the client lookups, an unqualified `name` resolved to the CLIENT'S
-- name column (fulfillment_clients.name, clients.name), not the storage
-- object's path — so no client ever matched and every person, staff
-- included, was refused every client document. The path is now named
-- explicitly as objects.name. Nothing else changes.

drop policy if exists bes_files_select on storage.objects;
create policy bes_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bes-files' and
    case
      when public.storage_channel_of(objects.name) is not null
        then public.channel_auditable(public.storage_channel_of(objects.name))
      /* Client documents follow the client: the caller's own view of the
         client decides, through the client tables' own row rules. */
      when (storage.foldername(objects.name))[1] = 'clients'
        then exists (select 1 from public.fulfillment_clients c
                      where c.id = public.try_uuid((storage.foldername(objects.name))[2]))
          or exists (select 1 from public.clients cl
                      where cl.id = public.try_uuid((storage.foldername(objects.name))[2]))
          or public.partner_shared_client_object(objects.name)
      when (storage.foldername(objects.name))[1] = 'agency' and (storage.foldername(objects.name))[2] = 'member'
        then (public.is_agency_staff()
              and (public.agency_can('people.documents.manage')
                   or exists (select 1 from public.files f
                                join public.member_documents md on md.file_id = f.id
                               where f.bucket = 'bes-files' and f.path = objects.name
                                 and md.user_id = auth.uid() and md.visible_to_member)))
      when (storage.foldername(objects.name))[1] = 'agency'
        then public.is_agency_staff()
      else (public.is_agency_staff()
            or public.is_org_member(public.try_uuid((storage.foldername(objects.name))[1])))
    end
  );
