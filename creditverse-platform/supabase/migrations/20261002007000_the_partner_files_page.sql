-- The Partner Portal Files page (Dee, 2026-10-01 doctrine: "Files should be
-- shared files only: Partner uploads · BES shared docs · Agreements ·
-- Deliverables · Reports · Client-related shared documents").
--
-- 1. my_partner_files() — the partner's own partner-level files that are
--    visible to them (shared by BES, or uploaded by one of their contacts),
--    saying which side added each one. Never a file BES kept private.
-- 2. my_partner_shared_client_files() — every client document BES shared
--    with this partner, across their clients, with the client's name and
--    portal id. Only files the partner can actually open (the 20261002006000
--    storage rule asks the same question).
-- 3. Partner uploads. A partner contact may put a file ONLY in
--    agency/partner/<their own partner>/uploads/… (storage insert rule), and
--    records it through my_partner_record_upload(), which checks the path is
--    theirs and the object exists, writes the file row as shared with them
--    (it is theirs), and writes an audited activity entry on the partner so
--    BES sees it arrive. No widening of the files insert policy.

create or replace function public.my_partner_files()
returns table(id uuid, name text, path text, mime_type text, size_bytes bigint,
              created_at timestamptz, shared_at timestamptz, from_partner boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, f.path, f.mime_type, f.size_bytes, f.created_at, f.shared_at,
         exists (select 1 from public.partner_contacts pc
                  where pc.group_id = f.entity_id::uuid and pc.user_id = f.uploaded_by)
    from public.files f
   where f.entity_type = 'partner'
     and f.entity_id = public.partner_group_of_user()::text
     and f.shared_with_partner
     and f.path like 'agency/partner/%'
   order by coalesce(f.shared_at, f.created_at) desc
   limit 300
$$;

create or replace function public.my_partner_shared_client_files()
returns table(id uuid, name text, path text, mime_type text, size_bytes bigint,
              shared_at timestamptz, client_name text, client_public_id text)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, f.path, f.mime_type, f.size_bytes, coalesce(f.shared_at, f.created_at),
         c.name, c.public_id
    from public.files f
    join public.fulfillment_clients c on c.id = public.try_uuid(f.entity_id)
   where f.entity_type = 'fulfillment_client'
     and f.shared_with_partner
     and f.path like 'clients/' || c.id::text || '/%'
     and c.outsourcing_group_id is not null
     and c.outsourcing_group_id = public.partner_group_of_user()
   order by coalesce(f.shared_at, f.created_at) desc
   limit 300
$$;

/* Storage: a partner contact may write only into their own uploads folder. */
drop policy if exists bes_files_partner_upload on storage.objects;
create policy bes_files_partner_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    and (storage.foldername(objects.name))[1] = 'agency'
    and (storage.foldername(objects.name))[2] = 'partner'
    and (storage.foldername(objects.name))[3] = public.partner_group_of_user()::text
    and (storage.foldername(objects.name))[4] = 'uploads'
  );

create or replace function public.my_partner_record_upload(
  p_path text, p_name text, p_mime text, p_size bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := public.partner_group_of_user();
  v_agency uuid;
  v_id uuid;
  v_actor text;
begin
  if v_group is null then
    raise exception 'Only a partner contact can upload here' using errcode = '42501';
  end if;
  if p_path not like 'agency/partner/' || v_group::text || '/uploads/%' then
    raise exception 'Uploads go in your own folder' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'bes-files' and o.name = p_path and o.owner = auth.uid()) then
    raise exception 'The file has not finished uploading' using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A file needs a name' using errcode = '22023';
  end if;

  select agency_id into v_agency from public.outsourcing_groups where id = v_group;

  insert into public.files (agency_id, entity_type, entity_id, bucket, path, name, mime_type,
                            size_bytes, uploaded_by, shared_with_partner, shared_at)
  values (v_agency, 'partner', v_group::text, 'bes-files', p_path, left(btrim(p_name), 200),
          nullif(p_mime, ''), p_size, auth.uid(), true, now())
  returning id into v_id;

  select coalesce(nullif(btrim(pc.full_name), ''), pc.email::text) into v_actor
    from public.partner_contacts pc where pc.group_id = v_group and pc.user_id = auth.uid() limit 1;

  /* So BES sees it arrive (rule 10): on the partner record, BES-internal. */
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, new_value, visibility)
  values (v_agency, 'partner', v_group::text, auth.uid(), coalesce(v_actor, 'Partner contact'),
          'Partner uploaded a file', 'file: ' || left(btrim(p_name), 200), 'uploaded', 'bes_internal');
  return v_id;
end $$;

revoke execute on function public.my_partner_files() from anon, public;
revoke execute on function public.my_partner_shared_client_files() from anon, public;
revoke execute on function public.my_partner_record_upload(text, text, text, bigint) from anon, public;
grant execute on function public.my_partner_files() to authenticated;
grant execute on function public.my_partner_shared_client_files() to authenticated;
grant execute on function public.my_partner_record_upload(text, text, text, bigint) to authenticated;
