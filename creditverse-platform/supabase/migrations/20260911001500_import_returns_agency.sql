-- =============================================================================
-- The import function returns its agency too.
--
-- The Edge Function has to write `files` rows for the attachments, and
-- `files.agency_id` is NOT NULL. Re-deriving the agency in TypeScript would
-- mean a second query and a second chance to get the tenant wrong, so the
-- function that already knows it says so.
-- =============================================================================

create or replace function public.clickup_import_client(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_group uuid; v_client uuid; v_fc uuid; v_created boolean := false;
  v_note jsonb; v_cred jsonb; v_addr jsonb;
  v_secrets int := 0; v_notes int := 0; v_existing uuid;
  v_may_secret boolean;
begin
  v_group := (p->>'group_id')::uuid;
  select agency_id into v_agency from public.outsourcing_groups where id = v_group;
  if v_agency is null then raise exception 'No such partner' using errcode = '22023'; end if;
  if not (public.is_staff_of(v_agency) and public.agency_can('creditops.clients.edit')) then
    raise exception 'Importing clients requires client editing permission' using errcode = '42501';
  end if;
  v_may_secret := public.agency_can('creditops.clients.sensitive');

  v_fc := public.client_match_for_import(
    v_group, 'clickup', p->>'task_id', p->>'legacy_client_id',
    p->>'email', p->>'phone', p->>'full_name', nullif(p->>'dob','')::date);

  if v_fc is not null then
    select client_id into v_client from public.fulfillment_clients where id = v_fc;
  end if;

  -- ── The person ────────────────────────────────────────────────────────
  if v_client is null then
    v_created := true;
    v_client := gen_random_uuid();
    insert into public.clients (id, agency_id, outsourcing_group_id, mode, provenance,
      first_name, last_name, email, phone, date_of_birth,
      address_line1, city, state, postal_code, status)
    values (v_client, v_agency, v_group, 'outsourcing_only', 'outsourcing_only',
      p->>'first_name', p->>'last_name', nullif(p->>'email','')::citext, p->>'phone',
      nullif(p->>'dob','')::date,
      p->>'address_line1', p->>'city', p->>'state', p->>'postal_code', 'active');
  else
    /* Enrich, never blank: a field ClickUp does not carry must not erase one
       somebody has since filled in by hand. */
    update public.clients set
      first_name = coalesce(nullif(p->>'first_name',''), first_name),
      last_name  = coalesce(nullif(p->>'last_name',''),  last_name),
      email      = coalesce(nullif(p->>'email','')::citext, email),
      phone      = coalesce(nullif(p->>'phone',''), phone),
      date_of_birth = coalesce(nullif(p->>'dob','')::date, date_of_birth),
      address_line1 = coalesce(nullif(p->>'address_line1',''), address_line1),
      city = coalesce(nullif(p->>'city',''), city),
      state = coalesce(nullif(p->>'state',''), state),
      postal_code = coalesce(nullif(p->>'postal_code',''), postal_code),
      updated_at = now()
     where id = v_client;
  end if;

  -- ── The CreditOps record ──────────────────────────────────────────────
  if v_fc is null then
    v_fc := gen_random_uuid();
    insert into public.fulfillment_clients (id, agency_id, outsourcing_group_id, client_id,
      mode, name, email, phone, date_of_birth, status, round, due_at,
      source_status, legacy_client_id, program_started_on,
      breach_equifax, breach_npd, security_freeze_only)
    values (v_fc, v_agency, v_group, v_client, 'outsourcing_only',
      p->>'full_name', nullif(p->>'email','')::citext, p->>'phone', nullif(p->>'dob','')::date,
      (p->>'status')::public.fulfillment_client_status,
      (p->>'round')::public.fulfillment_round,
      nullif(p->>'due_at','')::timestamptz,
      p->>'source_status', p->>'legacy_client_id', nullif(p->>'started_on','')::date,
      (p->>'breach_equifax')::boolean, (p->>'breach_npd')::boolean,
      coalesce((p->>'security_freeze_only')::boolean, false));
  else
    update public.fulfillment_clients set
      name = coalesce(nullif(p->>'full_name',''), name),
      email = coalesce(nullif(p->>'email','')::citext, email),
      phone = coalesce(nullif(p->>'phone',''), phone),
      date_of_birth = coalesce(nullif(p->>'dob','')::date, date_of_birth),
      status = coalesce((p->>'status')::public.fulfillment_client_status, status),
      round  = coalesce((p->>'round')::public.fulfillment_round, round),
      due_at = coalesce(nullif(p->>'due_at','')::timestamptz, due_at),
      source_status = coalesce(p->>'source_status', source_status),
      legacy_client_id = coalesce(p->>'legacy_client_id', legacy_client_id),
      program_started_on = coalesce(nullif(p->>'started_on','')::date, program_started_on),
      breach_equifax = coalesce((p->>'breach_equifax')::boolean, breach_equifax),
      breach_npd = coalesce((p->>'breach_npd')::boolean, breach_npd),
      updated_at = now()
     where id = v_fc;
  end if;

  perform public.import_link_record('clickup', 'task', p->>'task_id', 'fulfillment_client', v_fc::text, null);

  -- ── The queue ─────────────────────────────────────────────────────────
  if p->>'department' is not null then
    insert into public.client_department_statuses (client_id, department, status)
    values (v_fc, (p->>'department')::public.fulfillment_department, p->>'department_status')
    on conflict (client_id, department) do update
      set status = excluded.status, updated_at = now();
  end if;

  -- ── Addresses that disagree ───────────────────────────────────────────
  for v_addr in select * from jsonb_array_elements(coalesce(p->'address_history','[]'::jsonb)) loop
    perform public.client_address_record(v_client,
      v_addr->>'line1', null, v_addr->>'city', v_addr->>'state', v_addr->>'postal_code',
      v_addr->>'source', v_addr->>'source_ref',
      nullif(v_addr->>'recorded_at','')::timestamptz,
      coalesce((v_addr->>'needs_review')::boolean, false), v_addr->>'note');
  end loop;

  -- ── The protected data ────────────────────────────────────────────────
  /* Silently skipped rather than refused when the caller may not hold
     secrets: the rest of the import is still worth having, and the summary
     says how many were skipped. */
  if v_may_secret then
    if nullif(p->>'ssn','') is not null then
      select id into v_existing from public.client_secrets
       where client_id = v_client and kind = 'ssn' and archived_at is null;
      perform public.client_secret_write(v_client, 'ssn', p->>'ssn',
        'Social Security number', null, null, null, null, v_existing);
      v_secrets := v_secrets + 1;
    end if;

    for v_cred in select * from jsonb_array_elements(coalesce(p->'credentials','[]'::jsonb)) loop
      select id into v_existing from public.client_secrets
       where client_id = v_client and kind = v_cred->>'kind'
         and coalesce(provider,'') = coalesce(v_cred->>'provider','') and archived_at is null;
      perform public.client_secret_write(v_client, v_cred->>'kind', v_cred->>'secret',
        v_cred->>'label', v_cred->>'provider', v_cred->>'username', v_cred->>'url', null, v_existing);
      v_secrets := v_secrets + 1;
    end loop;
  end if;

  -- ── The notes worth keeping ───────────────────────────────────────────
  /* Keyed on the ClickUp comment id, so a re-run does not repeat them, and
     stamped with the ORIGINAL time and author — a migrated history dated
     today is not history. */
  for v_note in select * from jsonb_array_elements(coalesce(p->'notes','[]'::jsonb)) loop
    if not exists (select 1 from public.import_links
                    where source_system='clickup' and source_kind='comment'
                      and source_id = v_note->>'source_id') then
      insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility, created_at)
      values (v_agency, 'client', v_fc::text, null, v_note->>'author',
              'Imported from ClickUp', v_note->>'text', 'bes_internal',
              coalesce(nullif(v_note->>'at','')::timestamptz, now()));
      perform public.import_link_record('clickup', 'comment', v_note->>'source_id',
        'activity_event', v_fc::text, null);
      v_notes := v_notes + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'fulfillment_client_id', v_fc, 'client_id', v_client, 'agency_id', v_agency,
    'created', v_created, 'secrets', v_secrets, 'notes', v_notes,
    'secrets_skipped', (not v_may_secret));
end $function$;

revoke execute on function public.clickup_import_client(jsonb) from public, anon;
grant execute on function public.clickup_import_client(jsonb) to authenticated;
