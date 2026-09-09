-- =============================================================================
-- The partner storage policy is pinned to the partner subtree.
--
-- Matrix phase 61 caught this (1436/1437): "no OTHER bucket policy reaches the
-- channels subtree". `bes_files_partner_select` (0259) authorized through the
-- files row alone — entity_type='partner', shared, the caller's own partner —
-- with no constraint on WHERE the object lives. Every real partner file lives
-- under agency/partner/<group>/…, but nothing made that a rule: a files row
-- pointed at agency/channels/… and then shared would have exposed a channel
-- attachment to a partner contact. An attachment must never be more reachable
-- than its message (§26), so the path becomes part of the policy, not just a
-- convention in the uploader.
--
-- Two layers, same rule:
--   1. the storage policy only matches objects under agency/partner/ — a
--      mis-pointed files row now shares NOTHING;
--   2. set_partner_file_shared refuses to share a row whose path is outside
--      the partner subtree, so the mis-pointed row cannot even be flagged.
-- =============================================================================

drop policy if exists bes_files_partner_select on storage.objects;
create policy bes_files_partner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bes-files'
    and name like 'agency/partner/%'
    and exists (
      select 1 from public.files f
       where f.bucket = 'bes-files'
         and f.path = objects.name
         and f.entity_type = 'partner'
         and f.shared_with_partner
         and f.entity_id = public.partner_group_of_user()::text
    )
  );

create or replace function public.set_partner_file_shared(p_file uuid, p_shared boolean)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  f record;
  v_actor text;
begin
  select id, agency_id, entity_type, entity_id, name, path, shared_with_partner
    into f
    from public.files
   where id = p_file and entity_type = 'partner';
  if not found then
    raise exception 'File not found, or not a partner file';
  end if;
  if not public.is_staff_of(f.agency_id) or not public.agency_can('partners.portal') then
    raise exception 'Sharing to the partner portal needs the portal permission'
      using errcode = '42501';
  end if;
  -- The storage policy only serves the partner subtree; a row pointing
  -- anywhere else is mis-pointed or forged, and must not be flaggable.
  if f.path not like 'agency/partner/%' then
    raise exception 'Only files stored under the partner subtree can be shared'
      using errcode = '42501';
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
  values (f.agency_id, 'partner', f.entity_id, auth.uid(), v_actor,
          case when p_shared then 'File shared to the partner portal'
               else 'File removed from the partner portal' end,
          'file: ' || f.name,
          case when p_shared then 'private' else 'shared' end,
          case when p_shared then 'shared' else 'private' end,
          'bes_internal');
end;
$function$;
