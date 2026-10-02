-- Client documents follow the client (Dee, 2026-10-02: "Fix the storage
-- first then the Files"; PARTNER_PORTAL_DOCTRINE.md: "Do not start Files
-- until the shared-client-document storage rule is fixed").
--
-- Client documents live under clients/<client id>/… (29,615 objects, almost
-- all ClickUp attachments: credit reports, IDs, progress reports). Before:
--
--   * any BES staff member could open ANY client's documents — bes_files_select
--     fell through to "is_agency_staff()" for the clients/ folder, whatever the
--     client rule said (JM, James, Mark and Roniel see no clients at all);
--   * a partner could open NONE — the partner rule covered agency/partner/ only,
--     and for a non-staff caller the fall-through cast 'clients' to a uuid;
--   * nothing could be shared — set_partner_file_shared() refused every file
--     that was not a partner-level file, so 0 of 29,615 had ever been shared.
--
-- Now one rule for the clients/ folder, evaluated with the caller's own
-- rights (a storage policy is not a definer):
--
--   * you may open it when you can see that client — asked of the client
--     tables' OWN row rules (fulfillment_clients, and the canonical clients
--     directory for the two files filed there), so there is no copy of the
--     client rule to drift;
--   * or, as a partner contact, when BES shared that exact file with you and
--     the client is yours (partner_shared_client_object, a narrow definer).
--
-- And the one sharing control, set_partner_file_shared(), also accepts a
-- client's file: only someone who holds the portal permission AND can see
-- the client, only a file stored under that client's own folder, only for a
-- client that belongs to a partner. Each share is an activity entry on the
-- client (rule 10).

create or replace function public.try_uuid(p text)
returns uuid language sql immutable set search_path = public as $$
  select case when p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then p::uuid end
$$;

/* A partner contact may open a client file only when BES shared that exact
   file and the client belongs to the contact's own partner. */
create or replace function public.partner_shared_client_object(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.files f
      join public.fulfillment_clients c on c.id = public.try_uuid(f.entity_id)
     where f.bucket = 'bes-files'
       and f.path = p_name
       and f.entity_type = 'fulfillment_client'
       and f.shared_with_partner
       and c.outsourcing_group_id is not null
       and c.outsourcing_group_id = public.partner_group_of_user())
$$;
revoke execute on function public.partner_shared_client_object(text) from anon, public;
grant execute on function public.partner_shared_client_object(text) to authenticated;

drop policy if exists bes_files_select on storage.objects;
create policy bes_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bes-files' and
    case
      when public.storage_channel_of(name) is not null
        then public.channel_auditable(public.storage_channel_of(name))
      /* Client documents follow the client: the caller's own view of the
         client decides, through the client tables' own row rules. */
      when (storage.foldername(name))[1] = 'clients'
        then exists (select 1 from public.fulfillment_clients c
                      where c.id = public.try_uuid((storage.foldername(name))[2]))
          or exists (select 1 from public.clients cl
                      where cl.id = public.try_uuid((storage.foldername(name))[2]))
          or public.partner_shared_client_object(name)
      when (storage.foldername(name))[1] = 'agency' and (storage.foldername(name))[2] = 'member'
        then (public.is_agency_staff()
              and (public.agency_can('people.documents.manage')
                   or exists (select 1 from public.files f
                                join public.member_documents md on md.file_id = f.id
                               where f.bucket = 'bes-files' and f.path = objects.name
                                 and md.user_id = auth.uid() and md.visible_to_member)))
      when (storage.foldername(name))[1] = 'agency'
        then public.is_agency_staff()
      else (public.is_agency_staff()
            or public.is_org_member(public.try_uuid((storage.foldername(name))[1])))
    end
  );

create or replace function public.set_partner_file_shared(p_file uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  f record;
  v_actor text;
  v_client public.fulfillment_clients%rowtype;
  v_log_type text;
  v_log_id text;
begin
  select id, agency_id, entity_type, entity_id, name, path, shared_with_partner
    into f
    from public.files
   where id = p_file and entity_type in ('partner', 'fulfillment_client');
  if not found then
    raise exception 'File not found, or not a file that can be shared with a partner';
  end if;
  if not public.is_staff_of(f.agency_id) or not public.agency_can('partners.portal') then
    raise exception 'Sharing to the partner portal needs the portal permission'
      using errcode = '42501';
  end if;

  if f.entity_type = 'partner' then
    -- The partner subtree only; a row pointing anywhere else is mis-pointed or forged.
    if f.path not like 'agency/partner/%' then
      raise exception 'Only files stored under the partner subtree can be shared'
        using errcode = '42501';
    end if;
    v_log_type := 'partner'; v_log_id := f.entity_id;
  else
    select * into v_client from public.fulfillment_clients where id = public.try_uuid(f.entity_id);
    if v_client.id is null or not public.fulfillment_client_readable(v_client.id) then
      raise exception 'That client is not yours to share from' using errcode = '42501';
    end if;
    if v_client.outsourcing_group_id is null then
      raise exception 'This client does not belong to a partner, so there is nobody to share it with'
        using errcode = '22023';
    end if;
    -- Only a file stored in THIS client's own folder: the storage rule serves
    -- the path, so the path and the record must agree.
    if f.path not like 'clients/' || v_client.id::text || '/%' then
      raise exception 'Only files stored under the client''s own folder can be shared'
        using errcode = '42501';
    end if;
    v_log_type := 'fulfillment_client'; v_log_id := v_client.id::text;
  end if;

  if f.shared_with_partner = p_shared then
    return; -- already in the asked-for state; no noise in the audit trail
  end if;

  update public.files
     set shared_with_partner = p_shared,
         shared_by = case when p_shared then auth.uid() end,
         shared_at = case when p_shared then now() end
   where id = p_file;

  select coalesce(pr.full_name, pr.email) into v_actor
    from public.profiles pr where pr.id = auth.uid();

  /* Publication is a meaningful mutation (rule 10): actor, record, both
     states. bes_internal — the share event is BES's own history. */
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name,
         action, field, previous_value, new_value, visibility)
  values (f.agency_id, v_log_type, v_log_id, auth.uid(), v_actor,
          case when p_shared then 'File shared to the partner portal'
               else 'File removed from the partner portal' end,
          'file: ' || f.name,
          case when p_shared then 'private' else 'shared' end,
          case when p_shared then 'shared' else 'private' end,
          'bes_internal');
end $$;
