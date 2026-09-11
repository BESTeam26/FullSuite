-- =============================================================================
-- Writers for the crosswalk and the address history.
--
-- Both tables were created SELECT-only on purpose — a table anybody can write
-- is a table whose contents nobody can trust. But an import has to write them,
-- so here are the two doors, each checking a capability the way every other
-- write in this schema does.
-- =============================================================================

create or replace function public.import_link_record(
  p_source_system text, p_source_kind text, p_source_id text,
  p_entity_type text, p_entity_id text, p_batch uuid default null)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and status = 'active' limit 1;
  if v_agency is null or not public.agency_can('creditops.clients.edit') then
    raise exception 'Recording an import link requires client editing permission'
      using errcode = '42501';
  end if;
  insert into public.import_links
    (agency_id, source_system, source_kind, source_id, entity_type, entity_id, import_batch_id)
  values (v_agency, p_source_system, p_source_kind, p_source_id, p_entity_type, p_entity_id, p_batch)
  on conflict (agency_id, source_system, source_kind, source_id)
    do update set entity_type = excluded.entity_type,
                  entity_id   = excluded.entity_id,
                  import_batch_id = coalesce(excluded.import_batch_id, public.import_links.import_batch_id);
end $function$;
revoke execute on function public.import_link_record(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.import_link_record(text, text, text, text, text, uuid) to authenticated;

create or replace function public.client_address_record(
  p_client uuid, p_l1 text, p_l2 text, p_city text, p_state text, p_zip text,
  p_source text, p_source_ref text, p_recorded_at timestamptz,
  p_needs_review boolean default false, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_id uuid;
begin
  select agency_id into v_agency from public.clients where id = p_client;
  if v_agency is null then raise exception 'No such client' using errcode = '22023'; end if;
  if not (public.is_staff_of(v_agency) and public.agency_can('creditops.clients.edit')) then
    raise exception 'Recording a client address requires client editing permission'
      using errcode = '42501';
  end if;

  /* Idempotent on the source reference, so a re-run does not stack the same
     address twice. */
  if p_source_ref is not null then
    select id into v_id from public.client_address_history
     where client_id = p_client and source_ref = p_source_ref;
    if v_id is not null then return v_id; end if;
  end if;

  v_id := gen_random_uuid();
  insert into public.client_address_history
    (id, agency_id, client_id, address_line1, address_line2, city, state, postal_code,
     source, source_ref, recorded_at, needs_review, note)
  values (v_id, v_agency, p_client, p_l1, p_l2, p_city, p_state, p_zip,
          p_source, p_source_ref, coalesce(p_recorded_at, now()), coalesce(p_needs_review,false), p_note);
  return v_id;
end $function$;
revoke execute on function public.client_address_record(uuid, text, text, text, text, text, text, text, timestamptz, boolean, text) from public, anon;
grant execute on function public.client_address_record(uuid, text, text, text, text, text, text, text, timestamptz, boolean, text) to authenticated;
