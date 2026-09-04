-- Found by the matrix: the derived organization code (business prefix + first 4 chars
-- of the user id) collided for similar business names whose signers' ids share a
-- prefix. The suffix is now redrawn until the (agency, code) pair is unused.
create or replace function public.provision_self_serve_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business   text  := nullif(trim(v_meta ->> 'business_name'), '');
  v_plan       text  := coalesce(nullif(v_meta ->> 'plan', ''), 'creditops');
  v_phone      text  := public.normalize_phone(v_meta ->> 'phone');
  v_domain     text  := lower(split_part(new.email, '@', 2));
  v_name_norm  text  := public.normalize_business_name(v_business);
  v_agency     uuid;
  v_org        uuid;
  v_plan_row   public.plans%rowtype;
  v_reason     text;
  v_matches    text[] := '{}';
  v_code       text;
  v_suffix     text;
begin
  -- Only a genuine self-serve signer, exactly once, on confirmation.
  if v_business is null then return new; end if;                         -- not a self-serve sign-up
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then return new; end if;
  if exists (select 1 from public.org_memberships m where m.user_id = new.id) then return new; end if;
  if exists (select 1 from public.blocked_email_domains b where b.domain = v_domain) then
    raise exception 'Sign-ups from this email provider are not accepted' using errcode = '23514';
  end if;

  select * into v_plan_row from public.plans p where p.key = v_plan and p.is_public;
  if v_plan_row.key is null then
    raise exception 'Unknown plan' using errcode = '23514';
  end if;
  select id into v_agency from public.agencies order by created_at limit 1;   -- one agency (rule 16)

  -- Is this business already known? Exact identifiers block; a name match is reviewed.
  if exists (select 1 from public.organization_identity i where i.kind = 'email' and i.value = lower(new.email)) then v_matches := array_append(v_matches, 'email'); end if;
  if v_phone is not null and exists (select 1 from public.organization_identity i where i.kind = 'phone' and i.value = v_phone) then v_matches := array_append(v_matches, 'phone'); end if;
  if not exists (select 1 from public.public_email_domains d where d.domain = v_domain)
     and exists (select 1 from public.organization_identity i where i.kind = 'email_domain' and i.value = v_domain) then v_matches := array_append(v_matches, 'email_domain'); end if;
  if v_name_norm is not null and exists (select 1 from public.organization_identity i where i.kind = 'business_name' and i.value = v_name_norm) then v_matches := array_append(v_matches, 'business_name'); end if;

  -- Short code: business prefix plus a suffix redrawn until unique within the agency.
  v_code := upper(left(regexp_replace(v_business, '[^A-Za-z0-9]', '', 'g'), 6));
  if v_code = '' then v_code := 'ORG'; end if;
  v_suffix := upper(right(replace(new.id::text, '-', ''), 4));
  while exists (select 1 from public.organizations o where o.agency_id = v_agency and o.code = (v_code || '-' || v_suffix)::citext) loop
    v_suffix := upper(substr(md5(random()::text), 1, 4));
  end loop;
  insert into public.organizations (agency_id, name, code, principal_name, principal_email, status)
  values (v_agency, v_business, v_code || '-' || v_suffix,
          coalesce(v_meta ->> 'full_name', new.email), new.email, 'Active')
  returning id into v_org;

  insert into public.org_memberships (organization_id, user_id, role) values (v_org, new.id, 'org_admin');

  insert into public.product_entitlements (organization_id, product, enabled)
  select v_org, p, true from unnest(v_plan_row.products) as p
  on conflict (organization_id, product) do update set enabled = true;

  -- Trial: blocked outright on an exact identifier match; reviewed on a name-only match.
  if array_length(v_matches, 1) is not null and (v_matches && array['email','phone','email_domain']) then
    v_reason := 'known_business:' || array_to_string(v_matches, ',');
    insert into public.organization_trials (organization_id, plan_key, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, now(), 'blocked', v_reason);
    update public.product_entitlements set enabled = false where organization_id = v_org;   -- no free access; paid activation may re-enable
  else
    insert into public.organization_trials (organization_id, plan_key, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, now() + make_interval(days => v_plan_row.trial_days), 'active',
            case when 'business_name' = any (v_matches) then 'name_match_review' end);
  end if;

  -- Record what this business is known by, for the next signer.
  insert into public.organization_identity (organization_id, kind, value)
  select v_org, k, v from (values
    ('email'::public.identity_kind, lower(new.email)),
    ('phone', v_phone),
    ('business_name', v_name_norm),
    ('email_domain', case when exists (select 1 from public.public_email_domains d where d.domain = v_domain) then null else v_domain end)
  ) as t(k, v) where v is not null
  on conflict do nothing;

  perform public.log_audit('organization.self_serve_provisioned', 'organization', v_org::text, v_org, null,
    jsonb_build_object('plan', v_plan_row.key, 'trial', case when v_reason is null then 'active' else 'blocked' end, 'matches', v_matches));
  return new;
end $$;
