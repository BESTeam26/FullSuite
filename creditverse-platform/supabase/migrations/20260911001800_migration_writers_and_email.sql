-- =============================================================================
-- Finish the job: the CreditOps record may also have no email, and the writers
-- the migration calls must accept the migration.
--
-- Two things the first run found, both mine:
--
-- 1. `clients.email` was relaxed and `fulfillment_clients.email` was not, so
--    Thania still could not be created. Same reasoning: a CreditOps client can
--    be real and have no email.
--
-- 2. `import_link_record`, `client_address_record` and `client_secret_write`
--    each check a capability, and a service role holds none. Every client
--    failed at the first crosswalk write. The gate on `clickup_import_client`
--    was widened and its collaborators were not — which is what happens when a
--    rule is written in five places instead of one.
--
-- `service_role` bypasses row-level security outright and can already write
-- all of these tables directly, so this grants it nothing new. It only lets
-- the migration use the tested path rather than hand-written INSERTs.
-- =============================================================================

alter table public.fulfillment_clients alter column email drop not null;

comment on column public.fulfillment_clients.email is
  'Optional, like clients.email. Identity is held by the match ladder in client_match_for_import(), not by this column (Dee, 2026-09-11).';

/** True for the owner's own tooling, which already bypasses RLS entirely. */
create or replace function public.is_service_caller()
returns boolean
language sql stable as $function$
  select coalesce(current_setting('request.jwt.claim.role', true), auth.role(), '') = 'service_role'
      or current_user = 'service_role'
$function$;
grant execute on function public.is_service_caller() to authenticated, service_role;

create or replace function public.import_link_record(
  p_source_system text, p_source_kind text, p_source_id text,
  p_entity_type text, p_entity_id text, p_batch uuid default null)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid;
begin
  if public.is_service_caller() then
    select id into v_agency from public.agencies order by created_at limit 1;
  else
    select agency_id into v_agency from public.agency_memberships
     where user_id = auth.uid() and status = 'active' limit 1;
    if v_agency is null or not public.agency_can('creditops.clients.edit') then
      raise exception 'Recording an import link requires client editing permission'
        using errcode = '42501';
    end if;
  end if;
  insert into public.import_links
    (agency_id, source_system, source_kind, source_id, entity_type, entity_id, import_batch_id)
  values (v_agency, p_source_system, p_source_kind, p_source_id, p_entity_type, p_entity_id, p_batch)
  on conflict (agency_id, source_system, source_kind, source_id)
    do update set entity_type = excluded.entity_type,
                  entity_id   = excluded.entity_id,
                  import_batch_id = coalesce(excluded.import_batch_id, public.import_links.import_batch_id);
end $function$;

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
  if not public.is_service_caller()
     and not (public.is_staff_of(v_agency) and public.agency_can('creditops.clients.edit')) then
    raise exception 'Recording a client address requires client editing permission'
      using errcode = '42501';
  end if;

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

create or replace function public.client_secret_write(
  p_client uuid, p_kind text, p_secret text, p_label text default null,
  p_provider text default null, p_username text default null,
  p_url text default null, p_notes text default null, p_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_id uuid := p_id; v_secret_id uuid; v_name text;
begin
  select agency_id into v_agency from public.clients where id = p_client;
  if v_agency is null then raise exception 'No such client' using errcode = '22023'; end if;
  if not public.is_service_caller()
     and not (public.is_staff_of(v_agency) and public.agency_can('creditops.clients.sensitive')) then
    raise exception 'Storing client identity and logins requires permission' using errcode = '42501';
  end if;
  if public.looks_like_a_secret(p_notes) then
    raise exception 'Put the value in the secret field, not the notes. The notes are stored in the clear.'
      using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.client_secrets (agency_id, client_id, kind, label, provider, username, url, notes, updated_by)
    values (v_agency, p_client, p_kind, p_label, p_provider, p_username, p_url, p_notes, auth.uid())
    returning id into v_id;
    insert into public.client_secret_events (secret_row_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'created');
  else
    update public.client_secrets
       set kind = p_kind, label = p_label, provider = p_provider, username = p_username,
           url = p_url, notes = p_notes, updated_by = auth.uid(), updated_at = now()
     where id = v_id and client_id = p_client and archived_at is null
    returning secret_id into v_secret_id;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    insert into public.client_secret_events (secret_row_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'updated');
  end if;

  if p_secret is not null and btrim(p_secret) <> '' then
    v_name := 'client_secret:' || v_id::text || ':' || extract(epoch from now())::bigint::text;
    select vault.create_secret(p_secret, v_name, 'BES client ' || p_kind) into v_secret_id;
    update public.client_secrets
       set secret_id = v_secret_id, last_rotated_at = now(), updated_at = now()
     where id = v_id;
  end if;

  return v_id;
end $function$;
