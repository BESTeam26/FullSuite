-- A rerun of the importer never regresses a status FullSuite refined.
--
-- The 2026-09-29 completeness pass re-read every card to recover missing
-- comments and attachments. On a matched card, clickup_import_client also
-- applied ClickUp's status unconditionally — and ClickUp still says "In
-- Dispute Mailed" for the 225 files FullSuite had refined to "Round N Sent"
-- from the round evidence. Every one of them was pushed back. The Dispute
-- department rows were untouched (still ROUND SENT - AWAITING RESULTS,
-- unassigned, clocks intact), so the file status is restored from the
-- change event the trigger wrote, exact round included.
--
-- The rule from here: ClickUp's status is applied to an EXISTING file only
-- when ClickUp's own raw status changed since the last import. Genuine
-- ClickUp moves still flow (the same pass applied ~190 of them — files
-- cancelled, monitoring issues escalated, complaints raised); an unchanged
-- coarse status never overwrites a refined one. A brand-new file still
-- takes ClickUp's mapping in full.
--
-- Cost impact: none.

begin;

/* ── Restore the 225 ─────────────────────────────────────────────────── */
do $$
declare r record; v_n int := 0;
begin
  for r in
    select distinct on (e.entity_id) e.entity_id, e.previous_value
      from public.activity_events e
     where e.action = 'Status changed' and e.entity_type = 'fulfillment_client'
       and e.created_at >= '2026-09-29 05:00+00'
       and e.previous_value ~ '^Round [0-9]+ Sent$' and e.new_value = 'In Dispute Mailed'
     order by e.entity_id, e.created_at desc
  loop
    update public.fulfillment_clients fc
       set status = r.previous_value::public.fulfillment_client_status, updated_at = now()
     where fc.id::text = r.entity_id and fc.status = 'In Dispute Mailed';
    if found then v_n := v_n + 1; end if;
  end loop;
  raise notice '% files restored to their Round N Sent status', v_n;
end $$;

/* ── The guard ───────────────────────────────────────────────────────── */
create or replace function public.clickup_import_client(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_changed boolean := true;
  v_agency uuid; v_group uuid; v_client uuid; v_fc uuid; v_created boolean := false;
  v_note jsonb; v_cred jsonb; v_addr jsonb;
  v_secrets int := 0; v_notes int := 0; v_existing uuid;
  v_may_secret boolean;
  v_email_holder text;
  v_cross int := 0;
begin
  v_group := (p->>'group_id')::uuid;
  select agency_id into v_agency from public.outsourcing_groups where id = v_group;
  if v_agency is null then raise exception 'No such partner' using errcode = '22023'; end if;
  if not public.import_caller_may_write() then
    raise exception 'Importing clients requires the ClickUp import permission'
      using errcode = '42501';
  end if;
  /* The service role holds no capabilities, and a migration that silently
     dropped every SSN would be worse than one that refused. */
  v_may_secret := public.agency_can('creditops.clients.sensitive')
                  or auth.uid() is null;

  v_fc := public.client_match_for_import(
    v_group, 'clickup', p->>'task_id', p->>'legacy_client_id',
    p->>'email', p->>'phone', p->>'full_name', nullif(p->>'dob','')::date);

  if v_fc is not null then
    select client_id into v_client from public.fulfillment_clients where id = v_fc;
  end if;

  /* No work file, but the PERSON may still be here — cleared CreditOps
     file, FundingOps-only, or a directory entry. Attaching a new work file
     to them keeps their vault entries and their history; creating a second
     person would be refused by the unique email index anyway, which is how
     seven of Kevin Hernandez's cards imported as nothing (2026-09-25). */
  if v_client is null then
    v_client := public.client_person_for_import(
      v_group, p->>'email', p->>'phone', p->>'full_name', nullif(p->>'dob','')::date);
  end if;

  if v_client is null then
    v_created := true;
    v_client := gen_random_uuid();
    /* The email may already belong to somebody else under this partner.
       Two different people sharing an inbox is ordinary here, and Dee's
       rule is that different names are different people — so the client is
       created WITHOUT the address rather than merged into a stranger or
       lost to a constraint (2026-09-26). */
    if nullif(p->>'email','') is not null and (exists (
      select 1 from public.clients c2
       where c2.outsourcing_group_id = v_group
         and lower(c2.email::text) = lower(btrim(p->>'email')))
      or exists (
      select 1 from public.fulfillment_clients f2
       where f2.outsourcing_group_id = v_group
         and lower(f2.email::text) = lower(btrim(p->>'email')))) then
      select coalesce(c2.first_name, '') || ' ' || coalesce(c2.last_name, '')
        into v_email_holder
        from public.clients c2
       where c2.outsourcing_group_id = v_group
         and lower(c2.email::text) = lower(btrim(p->>'email'))
       limit 1;
    end if;

    insert into public.clients (id, agency_id, outsourcing_group_id, mode, provenance,
      first_name, last_name, email, phone, date_of_birth,
      address_line1, city, state, postal_code, status)
    values (v_client, v_agency, v_group, 'outsourcing_only', 'outsourcing_only',
      p->>'first_name', p->>'last_name',
      case when v_email_holder is null then nullif(p->>'email','')::extensions.citext end,
      p->>'phone',
      nullif(p->>'dob','')::date,
      p->>'address_line1', p->>'city', p->>'state', p->>'postal_code', 'active');
  else
    update public.clients set
      first_name = coalesce(nullif(p->>'first_name',''), first_name),
      last_name  = coalesce(nullif(p->>'last_name',''),  last_name),
      email      = coalesce(nullif(p->>'email','')::extensions.citext, email),
      phone      = coalesce(nullif(p->>'phone',''), phone),
      date_of_birth = coalesce(nullif(p->>'dob','')::date, date_of_birth),
      address_line1 = coalesce(nullif(p->>'address_line1',''), address_line1),
      city = coalesce(nullif(p->>'city',''), city),
      state = coalesce(nullif(p->>'state',''), state),
      postal_code = coalesce(nullif(p->>'postal_code',''), postal_code),
      updated_at = now()
     where id = v_client;
  end if;

  if v_fc is null then
    v_fc := gen_random_uuid();
    insert into public.fulfillment_clients (id, agency_id, outsourcing_group_id, client_id,
      mode, name, email, phone, date_of_birth, status, round, due_at,
      source_status, legacy_client_id, program_started_on,
      breach_equifax, breach_npd, security_freeze_only,
      lifecycle, archived_at)
    values (v_fc, v_agency, v_group, v_client, 'outsourcing_only',
      p->>'full_name',
      case when v_email_holder is null then nullif(p->>'email','')::extensions.citext end,
      p->>'phone', nullif(p->>'dob','')::date,
      (p->>'status')::public.fulfillment_client_status,
      (p->>'round')::public.fulfillment_round,
      nullif(p->>'due_at','')::timestamptz,
      p->>'source_status', p->>'legacy_client_id', nullif(p->>'started_on','')::date,
      (p->>'breach_equifax')::boolean, (p->>'breach_npd')::boolean,
      coalesce((p->>'security_freeze_only')::boolean, false),
      /* Archived in ClickUp means archived here: kept whole, and out of
         every queue (Dee, 2026-09-26). */
      case when coalesce((p->>'archived')::boolean, false)
           then 'archived'::public.client_lifecycle else 'active' end,
      case when coalesce((p->>'archived')::boolean, false) then now() end);
  else
    select (p->>'source_status') is distinct from fc0.source_status into v_source_changed
      from public.fulfillment_clients fc0 where fc0.id = v_fc;
    update public.fulfillment_clients set
      name = coalesce(nullif(p->>'full_name',''), name),
      email = coalesce(nullif(p->>'email','')::extensions.citext, email),
      phone = coalesce(nullif(p->>'phone',''), phone),
      date_of_birth = coalesce(nullif(p->>'dob','')::date, date_of_birth),
      /* ClickUp's status is applied only when ClickUp's OWN status changed
         since the last import. FullSuite refines what ClickUp records — an
         "In Dispute Mailed" card becomes "Round 3 Sent" here from evidence —
         and a rerun that copies the unchanged coarse status back over the
         refined one is a regression, not a sync (225 files, 2026-09-29). */
      status = case when p->>'source_status' is distinct from source_status
                    then coalesce((p->>'status')::public.fulfillment_client_status, status)
                    else status end,
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

  /* Said on the record, not only in an import summary that scrolls away. */
  if v_email_holder is not null then
    insert into public.activity_events
      (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility)
    values (v_agency, 'fulfillment_client', v_fc::text, null, 'Import',
            'Internal note',
            'This client''s ClickUp card gives the email ' || (p->>'email') ||
            ', which already belongs to ' || btrim(v_email_holder) ||
            ' under this partner. The email was left blank here rather than ' ||
            'merging two different people. Somebody needs to say whose it is.',
            'bes_internal');
  end if;

  /* Dee, 2026-09-24 (D-023): a person who turns up under a second partner
     gets a SEPARATE file there, and the partners never see each other's.
     BES may know the two look like one person, so the fact is recorded — as
     a note, in a table no partner-facing query reads. Never a merge, never
     a widening, and never by decrypting an SSN. */
  v_cross := public.client_note_cross_partner_identity(v_client, v_group);

  if p->>'department' is not null then
    /* Same rule for the department row: a NEW file gets ClickUp's mapping;
       an existing file's department row moves only when ClickUp's status
       moved, otherwise the router and the team own it. */
    insert into public.client_department_statuses (client_id, department, status)
    values (v_fc, (p->>'department')::public.fulfillment_department, p->>'department_status')
    on conflict (client_id, department) do update
      set status = excluded.status, updated_at = now()
      where v_source_changed;
  end if;

  for v_addr in select * from jsonb_array_elements(coalesce(p->'address_history','[]'::jsonb)) loop
    perform public.client_address_record(v_client,
      v_addr->>'line1', null, v_addr->>'city', v_addr->>'state', v_addr->>'postal_code',
      v_addr->>'source', v_addr->>'source_ref',
      nullif(v_addr->>'recorded_at','')::timestamptz,
      coalesce((v_addr->>'needs_review')::boolean, false), v_addr->>'note');
  end loop;

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

  for v_note in select * from jsonb_array_elements(coalesce(p->'notes','[]'::jsonb)) loop
    if not exists (select 1 from public.import_links
                    where source_system='clickup' and source_kind='comment'
                      and source_id = v_note->>'source_id') then
      insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility, created_at)
      values (v_agency, 'fulfillment_client', v_fc::text, null, v_note->>'author',
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
    'secrets_skipped', (not v_may_secret), 'cross_partner_notes', v_cross);
end $function$;


do $$
declare v_wrong int;
begin
  select count(*) into v_wrong from public.fulfillment_clients fc
    join public.client_department_statuses d on d.client_id = fc.id and d.department = 'Dispute'
   where fc.status::text ~ '^Round [0-9]+ Sent$' and d.assignee_id is not null;
  if v_wrong > 0 then raise exception '% restored files carry an assignee', v_wrong; end if;
end $$;

commit;
