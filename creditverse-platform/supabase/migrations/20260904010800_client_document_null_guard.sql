-- 0130 — a NULL that switched off a permission check.
--
-- 0129 decided who may add a client document like this:
--
--     v_by_client := (c.portal_user_id = auth.uid());
--     if not v_by_client and not public.client_writable(...) then
--       raise exception 'not permitted';
--     end if;
--
-- When the client has no portal login, `c.portal_user_id` is NULL, so the
-- comparison is NULL — not false. `NOT NULL` is NULL, `NULL AND anything` is
-- NULL or false, and `IF NULL THEN` does not fire. The exception was never
-- raised and ANY authenticated caller could add a document to ANY client whose
-- portal login was unset, which is most of them.
--
-- The matrix caught it on the first run of phase 49: "another organization
-- cannot add one to this client" returned a file id.
--
-- The fix is `coalesce(... , false)`, and the lesson is that a permission
-- check written as `if not <comparison>` is only sound when the comparison
-- cannot be NULL. In SQL a comparison against a nullable column always can.

create or replace function public.save_client_document(
  p_client uuid, p_path text, p_name text, p_mime text, p_size bigint, p_kind text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.clients%rowtype;
  v_id uuid;
  v_by_client boolean;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null then raise exception 'client not found' using errcode = 'P0002'; end if;

  /* coalesce: a client with no portal login yields NULL here, and NULL would
     switch the whole check off rather than failing it. */
  v_by_client := coalesce(c.portal_user_id = auth.uid(), false);
  if not v_by_client and not coalesce(public.client_writable(c.organization_id, c.outsourcing_group_id, c.agency_id), false) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_path is null or p_path not like (c.partner_scope_id::text || '/clients/' || p_client::text || '/%') then
    raise exception 'a client document must live in that client''s own folder' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a document needs a name' using errcode = '22023';
  end if;

  insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by)
  values (c.organization_id, c.agency_id, 'client', p_client::text, 'bes-files', p_path, trim(p_name),
          nullif(p_mime, ''), p_size, auth.uid())
  returning id into v_id;

  perform public.log_audit('client_document.added', 'file', v_id::text, c.organization_id, null,
                           jsonb_build_object('client_id', p_client, 'name', p_name, 'size_bytes', p_size,
                                              'by_client', v_by_client, 'kind', p_kind));
  return v_id;
end $$;
revoke all on function public.save_client_document(uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.save_client_document(uuid, text, text, text, bigint, text) to authenticated;

-- Same shape, same guard, for the remover.
create or replace function public.delete_client_document(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  f public.files%rowtype;
  c public.clients%rowtype;
begin
  select * into f from public.files where id = p_id and entity_type = 'client';
  if f.id is null then raise exception 'document not found' using errcode = 'P0002'; end if;
  select * into c from public.clients where id = f.entity_id::uuid;
  if c.id is null then raise exception 'client not found' using errcode = 'P0002'; end if;
  if not coalesce(public.client_writable(c.organization_id, c.outsourcing_group_id, c.agency_id), false) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.files where id = p_id;
  perform public.log_audit('client_document.removed', 'file', p_id::text, c.organization_id, to_jsonb(f), null);
  return f.path;
end $$;
revoke all on function public.delete_client_document(uuid) from public, anon;
grant execute on function public.delete_client_document(uuid) to authenticated;
