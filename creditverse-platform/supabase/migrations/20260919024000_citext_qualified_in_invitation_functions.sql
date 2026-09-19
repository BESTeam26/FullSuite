-- Pilot blocker P-009 (2026-09-19): "Invite Team Member" failed with
-- 'type "citext" does not exist'. These functions force search_path=public and
-- name the case-insensitive email type without its schema, so the type does
-- not resolve at compile time. Regenerated from the live definitions with one
-- change: every bare citext becomes extensions.citext. Nothing else moves.

-- provision_self_serve_organization()
CREATE OR REPLACE FUNCTION public.provision_self_serve_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business   text  := nullif(trim(v_meta ->> 'business_name'), '');
  v_plan       text  := coalesce(nullif(v_meta ->> 'plan', ''), 'empire_grow');
  v_selected   text  := nullif(v_meta ->> 'selected_product', '');
  v_phone      text  := public.normalize_phone(v_meta ->> 'phone');
  v_domain     text  := lower(split_part(new.email, '@', 2));
  v_name_norm  text  := public.normalize_business_name(v_business);
  v_agency     uuid;
  v_org        uuid;
  v_plan_row   public.plans%rowtype;
  v_grant_row  public.plans%rowtype;
  v_reason     text;
  v_matches    text[] := '{}';
  v_code       text;
  v_suffix     text;
begin
  if v_business is null then return new; end if;
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then return new; end if;
  if exists (select 1 from public.org_memberships m where m.user_id = new.id) then return new; end if;
  if exists (select 1 from public.blocked_email_domains b where b.domain = v_domain) then
    raise exception 'Sign-ups from this email provider are not accepted' using errcode = '23514';
  end if;

  select * into v_plan_row from public.plans p where p.key = v_plan and p.is_public;
  if v_plan_row.key is null then
    raise exception 'Unknown plan' using errcode = '23514';
  end if;
  if not v_plan_row.public_trial then
    raise exception 'This plan is available by agreement; contact BES' using errcode = '23514';
  end if;
  if v_plan_row.choose_one then
    if v_selected is null or not (v_selected = any (v_plan_row.products::text[])) or v_selected not in ('creditOps', 'fundingOps') then
      raise exception 'Empire Build needs a choice: CreditOps or FundingOps' using errcode = '23514';
    end if;
  end if;
  select * into v_grant_row from public.plans p where p.key = coalesce(v_plan_row.trial_grant_plan, v_plan_row.key);
  select id into v_agency from public.agencies order by created_at limit 1;

  if exists (select 1 from public.organization_identity i where i.kind = 'email' and i.value = lower(new.email)) then v_matches := array_append(v_matches, 'email'); end if;
  if v_phone is not null and exists (select 1 from public.organization_identity i where i.kind = 'phone' and i.value = v_phone) then v_matches := array_append(v_matches, 'phone'); end if;
  if not exists (select 1 from public.public_email_domains d where d.domain = v_domain)
     and exists (select 1 from public.organization_identity i where i.kind = 'email_domain' and i.value = v_domain) then v_matches := array_append(v_matches, 'email_domain'); end if;
  if v_name_norm is not null and exists (select 1 from public.organization_identity i where i.kind = 'business_name' and i.value = v_name_norm) then v_matches := array_append(v_matches, 'business_name'); end if;

  -- Short code: business prefix plus a suffix redrawn until unique within the agency (0043).
  v_code := upper(left(regexp_replace(v_business, '[^A-Za-z0-9]', '', 'g'), 6));
  if v_code = '' then v_code := 'ORG'; end if;
  v_suffix := upper(right(replace(new.id::text, '-', ''), 4));
  while exists (select 1 from public.organizations o where o.agency_id = v_agency and o.code = (v_code || '-' || v_suffix)::extensions.citext) loop
    v_suffix := upper(substr(md5(random()::text), 1, 4));
  end loop;
  insert into public.organizations (agency_id, name, code, principal_name, principal_email, status, owner_user_id)
  values (v_agency, v_business, v_code || '-' || v_suffix,
          coalesce(v_meta ->> 'full_name', new.email), new.email, 'Active', new.id)
  returning id into v_org;

  insert into public.org_memberships (organization_id, user_id, role) values (v_org, new.id, 'org_admin');

  -- Trial capabilities = the grant plan (Empire Grow); never CRM on a trial.
  insert into public.product_entitlements (organization_id, product, enabled)
  select v_org, p, true from unnest(v_grant_row.products) as p where p <> 'crm'
  on conflict (organization_id, product) do update set enabled = true;

  if array_length(v_matches, 1) is not null and (v_matches && array['email','phone','email_domain']) then
    v_reason := 'known_business:' || array_to_string(v_matches, ',');
    insert into public.organization_trials (organization_id, plan_key, selected_product, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, v_selected::public.product_key, now(), 'blocked', v_reason);
    update public.product_entitlements set enabled = false where organization_id = v_org;
  else
    insert into public.organization_trials (organization_id, plan_key, selected_product, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, v_selected::public.product_key, now() + make_interval(days => v_plan_row.trial_days), 'active',
            case when 'business_name' = any (v_matches) then 'name_match_review' end);
  end if;

  insert into public.organization_identity (organization_id, kind, value)
  select v_org, k, v from (values
    ('email'::public.identity_kind, lower(new.email)),
    ('phone', v_phone),
    ('business_name', v_name_norm),
    ('email_domain', case when exists (select 1 from public.public_email_domains d where d.domain = v_domain) then null else v_domain end)
  ) as t(k, v) where v is not null
  on conflict do nothing;

  perform public.log_audit('organization.self_serve_provisioned', 'organization', v_org::text, v_org, null,
    jsonb_build_object('plan', v_plan_row.key, 'selected_product', v_selected, 'trial_grant', v_grant_row.key,
                       'trial', case when v_reason is null then 'active' else 'blocked' end, 'matches', v_matches));
  return new;
end $function$
;

-- signature_request_create_unchecked(uuid,text,uuid,uuid,uuid,text,text)
CREATE OR REPLACE FUNCTION public.signature_request_create_unchecked(p_template uuid, p_signer_kind text, p_user uuid, p_partner uuid, p_contact uuid, p_email text, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t record; ctx jsonb; body text; missing text[]; v_email extensions.citext; v_name text; v_id uuid; v_actor text;
begin
  select * into t from public.document_templates where id = p_template;
  if t.id is null then raise exception 'Template not found' using errcode = 'P0002'; end if;
  if t.status <> 'active' then
    raise exception 'Only an active template can be sent. Activate it first.' using errcode = '22023';
  end if;
  if p_signer_kind not in ('member', 'partner_contact', 'client', 'external') then
    raise exception 'Unknown signer kind' using errcode = '22023';
  end if;
  if p_signer_kind = 'member' then
    if p_user is null then raise exception 'A member signer needs the member' using errcode = '22023'; end if;
    select email, coalesce(full_name, email) into v_email, v_name from public.profiles where id = p_user;
    if not exists (select 1 from public.agency_memberships where user_id = p_user and agency_id = t.agency_id) then
      raise exception 'That person is not on this agency' using errcode = '22023';
    end if;
  elsif p_signer_kind = 'partner_contact' then
    if p_contact is null then raise exception 'A partner signer needs the contact' using errcode = '22023'; end if;
    select email, full_name, group_id into v_email, v_name, p_partner from public.partner_contacts where id = p_contact;
  else
    v_email := lower(trim(p_email))::extensions.citext; v_name := trim(p_name);
    if v_email is null or position('@' in v_email::text) = 0 or coalesce(v_name, '') = '' then
      raise exception 'An external signer needs a name and an email address' using errcode = '22023';
    end if;
  end if;

  ctx := public.document_context_for(t.agency_id, p_signer_kind, p_user, p_partner, p_contact);
  ctx := ctx || jsonb_build_object('signer', jsonb_build_object('name', v_name, 'email', v_email::text));
  missing := array(select x from unnest(public.unresolved_document_tokens(t.body, ctx)) as x
                    where lower(x) not in ('signature', 'signed_date', 'signature.name', 'signature.date'));
  if array_length(missing, 1) > 0 then
    raise exception 'The document still has unfilled fields: %. Fix the template or the record, then send.', array_to_string(missing, ', ')
      using errcode = '22023';
  end if;
  body := public.render_document(t.body, ctx);

  insert into public.signature_requests
        (agency_id, template_id, template_version, title, rendered_html, signer_kind,
         signer_user_id, signer_contact_id, outsourcing_group_id, signer_email, signer_name, created_by)
  values (t.agency_id, t.id, t.version, t.name, body, p_signer_kind,
          p_user, p_contact, p_partner, v_email, v_name, auth.uid())
  returning id into v_id;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, new_value, visibility)
  values (t.agency_id,
          case when p_signer_kind = 'member' then 'agency_member' when p_partner is not null then 'partner' else 'signature_request' end,
          coalesce(p_user::text, p_partner::text, v_id::text),
          auth.uid(), v_actor, 'Document sent for signature: ' || t.name, 'signature_request',
          v_name || ' <' || v_email::text || '> · v' || t.version, 'bes_internal');
  return v_id;
end $function$
;

-- diy_enroll(uuid,text,text,text)
CREATE OR REPLACE FUNCTION public.diy_enroll(p_org uuid, p_first_name text, p_last_name text, p_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email extensions.citext;
  v_agency uuid;
  v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_org is null then
    raise exception 'An organization is required' using errcode = '22023';
  end if;
  if not public.org_entitled(p_org, 'diyCredit') then
    raise exception 'This organization does not offer DIY Credit' using errcode = '42501';
  end if;
  if coalesce(trim(p_last_name), '') = '' then
    raise exception 'A surname is required' using errcode = '22023';
  end if;

  select email into v_email from public.profiles where id = auth.uid();
  select agency_id into v_agency from public.organizations where id = p_org;

  -- 1. Already linked to a file here. This is them, whatever address it holds.
  select id into v_client from public.clients
   where partner_scope_id = p_org and portal_user_id = auth.uid()
   limit 1;

  -- 2. A file for this address, not yet claimed by a sign-in.
  if v_client is null then
    select id into v_client from public.clients
     where partner_scope_id = p_org and lower(email::text) = lower(v_email::text)
     limit 1;

    if v_client is not null then
      update public.clients set portal_user_id = auth.uid()
       where id = v_client and portal_user_id is null;
      /* Somebody else holds the login on that file. Refuse loudly rather than
         hand this person another human's credit report. */
      if not exists (select 1 from public.clients where id = v_client and portal_user_id = auth.uid()) then
        raise exception 'A client record for this email is already linked to a different sign-in' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 3. Genuinely new.
  if v_client is null then
    insert into public.clients
      (agency_id, organization_id, mode, first_name, last_name, email, phone,
       portal_user_id, status, provenance, created_by)
    values (v_agency, p_org, 'saas_pulled', nullif(trim(p_first_name), ''), trim(p_last_name),
            v_email, nullif(trim(p_phone), ''), auth.uid(), 'active', 'diy_self_serve', auth.uid())
    returning id into v_client;
  end if;

  insert into public.diy_journeys (client_id) values (v_client)
  on conflict (client_id) do nothing;

  perform public.log_audit('diy.enrolled', 'client', v_client::text, p_org, null,
                           jsonb_build_object('reused_existing', v_client is not null));
  return v_client;
end $function$
;

-- clickup_import_client(jsonb)
CREATE OR REPLACE FUNCTION public.clickup_import_client(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency uuid; v_group uuid; v_client uuid; v_fc uuid; v_created boolean := false;
  v_note jsonb; v_cred jsonb; v_addr jsonb;
  v_secrets int := 0; v_notes int := 0; v_existing uuid;
  v_may_secret boolean;
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

  if v_client is null then
    v_created := true;
    v_client := gen_random_uuid();
    insert into public.clients (id, agency_id, outsourcing_group_id, mode, provenance,
      first_name, last_name, email, phone, date_of_birth,
      address_line1, city, state, postal_code, status)
    values (v_client, v_agency, v_group, 'outsourcing_only', 'outsourcing_only',
      p->>'first_name', p->>'last_name', nullif(p->>'email','')::extensions.citext, p->>'phone',
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
      breach_equifax, breach_npd, security_freeze_only)
    values (v_fc, v_agency, v_group, v_client, 'outsourcing_only',
      p->>'full_name', nullif(p->>'email','')::extensions.citext, p->>'phone', nullif(p->>'dob','')::date,
      (p->>'status')::public.fulfillment_client_status,
      (p->>'round')::public.fulfillment_round,
      nullif(p->>'due_at','')::timestamptz,
      p->>'source_status', p->>'legacy_client_id', nullif(p->>'started_on','')::date,
      (p->>'breach_equifax')::boolean, (p->>'breach_npd')::boolean,
      coalesce((p->>'security_freeze_only')::boolean, false));
  else
    update public.fulfillment_clients set
      name = coalesce(nullif(p->>'full_name',''), name),
      email = coalesce(nullif(p->>'email','')::extensions.citext, email),
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

  if p->>'department' is not null then
    insert into public.client_department_statuses (client_id, department, status)
    values (v_fc, (p->>'department')::public.fulfillment_department, p->>'department_status')
    on conflict (client_id, department) do update
      set status = excluded.status, updated_at = now();
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
end $function$
;

-- accept_invitation(uuid)
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.invitations%rowtype; v_email extensions.citext; v_id uuid;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into i from public.invitations where token = p_token;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then raise exception 'This invitation is not open' using errcode = '22023'; end if;
  if i.email <> v_email then raise exception 'This invitation was sent to a different email address' using errcode = '42501'; end if;
  if i.kind <> 'organization' then raise exception 'Only organization invitations are accepted here' using errcode = '22023'; end if;
  /* Ignoring pending: this invitation is one of them, and converting it does
     not raise the total. What this catches is the allowance shrinking after
     the invitation went out. */
  perform public.assert_seat_available(i.organization_id, auth.uid(), true);
  insert into public.org_memberships (user_id, organization_id, role, assigned_only)
  values (auth.uid(), i.organization_id, i.org_role, true)
  on conflict (user_id, organization_id) do update set role = excluded.role, archived_at = null
  returning id into v_id;
  update public.invitations set accepted_at = now() where id = i.id;
  perform public.log_audit('organization.invitation_accepted', 'org_membership', v_id::text, i.organization_id, null,
          jsonb_build_object('role', i.org_role));
  return v_id;
end $function$
;

-- invite_agency_member(text,agency_role,access_profile,uuid,text[],uuid,text)
CREATE OR REPLACE FUNCTION public.invite_agency_member(p_email text, p_role agency_role, p_profile access_profile DEFAULT NULL::access_profile, p_lead_team uuid DEFAULT NULL::uuid, p_modules text[] DEFAULT '{}'::text[], p_team uuid DEFAULT NULL::uuid, p_full_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency  uuid;
  v_email   extensions.citext := lower(trim(p_email))::extensions.citext;
  v_id      uuid;
  v_profile public.access_profile;
  v_lead    uuid;
  v_team    uuid := p_team;
  v_modules text[] := coalesce(p_modules, '{}');
  v_bad     text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and role in ('agency_owner', 'agency_admin') and status = 'active'
   limit 1;
  if v_agency is null then raise exception 'not permitted' using errcode = '42501'; end if;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;
  if p_role not in ('agency_admin', 'agency_user') then
    raise exception 'Invite people as Agency Admin or Agency User. Ownership is transferred from the owner''s own account, never by invitation.' using errcode = '22023';
  end if;

  if p_role = 'agency_admin' then
    v_profile := null; v_lead := null; v_modules := '{}';
  else
    v_profile := coalesce(p_profile, 'custom');
    v_lead := p_lead_team;
  end if;

  /* Leading a team means being on it. Saying so here rather than relying on
     the caller to pass both is one less way to invite a lead with no team. */
  if v_lead is not null then v_team := coalesce(v_team, v_lead); end if;

  if v_team is not null and not exists (
    select 1 from public.teams t where t.id = v_team and t.agency_id = v_agency and t.archived_at is null
  ) then
    raise exception 'That team does not belong to this agency' using errcode = '22023';
  end if;

  select string_agg(k, ', ') into v_bad
    from unnest(v_modules) as k
   where not exists (select 1 from public.permission_keys pk where pk.key = k);
  if v_bad is not null then
    raise exception 'Unknown capability: %', v_bad using errcode = '22023';
  end if;

  /* An open invitation is reused rather than duplicated: inviting the same
     person twice is a person clicking twice, not two employees. */
  select id into v_id from public.invitations
   where agency_id = v_agency and email = v_email and kind = 'agency'
     and accepted_at is null and expires_at > now();

  if v_id is not null then
    update public.invitations
       set agency_role = p_role, access_profile = v_profile, lead_team_id = v_lead,
           team_id = v_team, module_keys = v_modules, invited_by = auth.uid()
     where id = v_id;
  else
    insert into public.invitations
      (email, kind, agency_id, agency_role, access_profile, lead_team_id, team_id, module_keys, invited_by)
    values (v_email, 'agency', v_agency, p_role, v_profile, v_lead, v_team, v_modules, auth.uid())
    returning id into v_id;
  end if;

  perform public.log_audit('agency.member_invited', 'invitation', v_id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role, 'profile', v_profile,
                       'team', v_team, 'lead_team', v_lead, 'modules', v_modules,
                       'full_name', p_full_name));
  return v_id;
end $function$
;

-- set_report_recipient(text,text,text,boolean)
CREATE OR REPLACE FUNCTION public.set_report_recipient(p_kind text, p_email text, p_label text DEFAULT NULL::text, p_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency uuid;
  v_email extensions.citext := lower(btrim(p_email))::extensions.citext;
  v_id uuid;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and status = 'active' limit 1;
  if v_agency is null then raise exception 'not permitted' using errcode = '42501'; end if;

  /* Changing where MONEY is sent is the owner's, exactly like the reports
     themselves (P-004: money is the owner's unless the owner grants it). */
  if public.is_financial_report(p_kind) then
    if not public.agency_can('finance.dashboard.view') then
      raise exception 'Financial report delivery is owner-gated' using errcode = '42501';
    end if;
  elsif not (public.is_manager_of(v_agency) and public.agency_can('ops.manage')) then
    raise exception 'Managing operations is required' using errcode = '42501';
  end if;

  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;

  /* THE SEPARATION, as a constraint rather than a convention. An address
     that already receives an operational report cannot be given a financial
     one, and the reverse. */
  if p_active then
    if public.is_financial_report(p_kind) then
      if exists (select 1 from public.report_recipients r
                  where r.agency_id = v_agency and r.email = v_email and r.active
                    and not public.is_financial_report(r.report_kind)) then
        raise exception 'That inbox already receives operational reports. Financial reports go somewhere separate.'
          using errcode = '22023';
      end if;
    else
      if exists (select 1 from public.report_recipients r
                  where r.agency_id = v_agency and r.email = v_email and r.active
                    and public.is_financial_report(r.report_kind)) then
        raise exception 'That inbox receives financial reports. Operational reports go somewhere separate.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.report_recipients (agency_id, report_kind, email, label, active, created_by)
  values (v_agency, p_kind, v_email, nullif(btrim(coalesce(p_label, '')), ''), p_active, auth.uid())
  on conflict (agency_id, report_kind, email) do update
    set active = excluded.active, label = coalesce(excluded.label, public.report_recipients.label),
        updated_at = now()
  returning id into v_id;

  perform public.log_audit('report.recipient_set', 'report_recipient', v_id::text, null, null,
    jsonb_build_object('kind', p_kind, 'email', v_email, 'active', p_active));
  return v_id;
end $function$
;

-- accept_partner_invitation(uuid)
CREATE OR REPLACE FUNCTION public.accept_partner_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.invitations%rowtype;
  v_email extensions.citext;
  v_lifecycle public.partner_lifecycle;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  select * into i from public.invitations where token = p_token;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'This invitation is not open' using errcode = '22023';
  end if;
  if i.partner_contact_id is null then
    raise exception 'Only partner portal invitations are accepted here' using errcode = '22023';
  end if;
  if i.email <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  select g.lifecycle into v_lifecycle
    from public.partner_contacts ct join public.outsourcing_groups g on g.id = ct.group_id
   where ct.id = i.partner_contact_id;
  if v_lifecycle in ('suspended', 'archived') then
    raise exception 'This partner account is closed. Please speak to your BES contact'
      using errcode = '42501';
  end if;

  /* The whole grant: this row now belongs to this account. Refuse to steal a
     contact somebody else already activated. */
  update public.partner_contacts
     set user_id = auth.uid(), status = 'active', activated_at = coalesce(activated_at, now())
   where id = i.partner_contact_id
     and (user_id is null or user_id = auth.uid());
  if not found then
    raise exception 'This contact was already activated by a different account' using errcode = '42501';
  end if;

  update public.invitations set accepted_at = now() where id = i.id;
  return i.partner_contact_id;
end;
$function$
;
