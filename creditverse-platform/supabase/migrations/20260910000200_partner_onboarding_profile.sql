-- =============================================================================
-- Partner onboarding IS the Partner Profile (Dee, 2026-09-10).
--
-- "The onboarding form should not be treated as a one-time intake form. It
-- should be the initial data entry point for the Partner Profile."
--
-- So there is no intake table. What the partner types during onboarding lands
-- on the canonical records the team already works from:
--
--   Company information  → outsourcing_groups (new columns below)
--   Primary contact      → partner_contacts (the calling contact's own row)
--   Every system/login   → partner_credentials — THE vault (0225): the
--                          password in Supabase Vault, everything else in the
--                          row, every reveal recorded
--   Affiliate accounts   → partner_credentials rows, category 'affiliate'
--   Access confirmation  → outsourcing_groups.access_confirmed_at / _by
--   "Continue to Agreement" → a signature_requests row from the template BES
--                          flagged as the partner onboarding agreement (0292)
--
-- Partner → Profile → Systems / Credentials → Affiliate accounts is the shape
-- Dee described, and it is rows, not columns: two domains, five affiliates,
-- another system next year — no schema change.
--
-- The partner edits the same records later from the portal. Each partner-side
-- write is a SECURITY DEFINER function gated ENTIRELY by
-- partner_group_of_user() (the portal boundary, 0142), and shares its body
-- with the staff-side function so the vault has one write path (rule 6).
-- =============================================================================

-- ── 1 · The partner record carries the company information ────────────────
alter table public.outsourcing_groups
  add column if not exists legal_business_name     text,
  add column if not exists dba_name                text,
  add column if not exists address_street          text,
  add column if not exists address_city            text,
  add column if not exists address_state           text,
  add column if not exists address_zip             text,
  add column if not exists website                 text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists access_confirmed_at     timestamptz,
  add column if not exists access_confirmed_by     uuid references public.profiles(id) on delete set null;

comment on column public.outsourcing_groups.access_confirmed_at is
  'When a partner contact confirmed that the information and credentials they provided may be used by BES for authorized services. Who, in access_confirmed_by. Set by my_partner_onboarding_complete(); never by a browser write.';

-- ── 2 · Credentials know what kind of system they are, and who last touched them
alter table public.credential_platforms
  add column if not exists category text not null default 'other'
    check (category in ('crm', 'ghl', 'esp', 'credit_monitoring', 'affiliate', 'domain', 'other'));

insert into public.credential_platforms (key, label, sends_code, sort, category) values
  ('disputefox',             'DisputeFox',              true,  10,  'crm'),
  ('crc',                    'Credit Repair Cloud',     false, 11,  'crm'),
  ('client_dispute_manager', 'Client Dispute Manager',  false, 12,  'crm'),
  ('disputebee',             'DisputeBee',              false, 13,  'crm'),
  ('disputebeast',           'DisputeBeast',            false, 14,  'crm'),
  ('creditfixrr',            'CreditFixrr',             false, 15,  'crm'),
  ('gohighlevel',            'GoHighLevel',             true,  20,  'ghl'),
  ('google',                 'Google Workspace / Gmail',true,  40,  'esp'),
  ('microsoft365',           'Microsoft 365 / Outlook', true,  41,  'esp'),
  ('mailgun',                'Mailgun',                 false, 42,  'esp'),
  ('sendgrid',               'SendGrid',                false, 43,  'esp'),
  ('smartcredit',            'SmartCredit',             false, 60,  'credit_monitoring'),
  ('identityiq',             'IdentityIQ',              false, 61,  'credit_monitoring'),
  ('myfreescorenow',         'MyFreeScoreNow',          false, 62,  'credit_monitoring'),
  ('experian',               'Experian',                false, 63,  'credit_monitoring'),
  ('godaddy',                'GoDaddy',                 true,  70,  'domain'),
  ('namecheap',              'Namecheap',               true,  71,  'domain'),
  ('cloudflare',             'Cloudflare',              true,  72,  'domain'),
  ('squarespace',            'Squarespace',             false, 73,  'domain'),
  ('wix',                    'Wix',                     false, 74,  'domain')
on conflict (key) do update set category = excluded.category, label = excluded.label, sort = excluded.sort;
update public.credential_platforms set category = 'esp' where key = 'email' and category = 'other';

alter table public.partner_credentials
  add column if not exists category       text not null default 'other'
    check (category in ('crm', 'ghl', 'esp', 'credit_monitoring', 'affiliate', 'domain', 'other')),
  /* "Other" made concrete: the provider's actual name when it is not in the catalogue. */
  add column if not exists provider_name  text,
  /* A GHL location / account name, a domain name, an affiliate program. */
  add column if not exists account_name   text,
  add column if not exists account_type   text check (account_type is null or account_type in ('agency', 'subaccount', 'not_sure')),
  add column if not exists affiliate_link text,
  add column if not exists dashboard_url  text,
  add column if not exists updated_by     uuid references public.profiles(id) on delete set null;

/* Existing rows: take the platform's category so DisputeFox logins read as CRM. */
update public.partner_credentials c
   set category = p.category
  from public.credential_platforms p
 where p.key = c.platform_key and c.category = 'other' and p.category <> 'other';

create or replace function public.partner_credentials_touch()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $function$;
revoke execute on function public.partner_credentials_touch() from public, anon, authenticated;
drop trigger if exists partner_credentials_touch on public.partner_credentials;
create trigger partner_credentials_touch
  before update on public.partner_credentials
  for each row execute function public.partner_credentials_touch();

-- ── 3 · The onboarding agreement is a flagged template ────────────────────
alter table public.document_templates
  add column if not exists partner_onboarding_agreement boolean not null default false;
create unique index if not exists document_templates_one_onboarding_agreement
  on public.document_templates (agency_id)
  where partner_onboarding_agreement and status = 'active';
comment on column public.document_templates.partner_onboarding_agreement is
  'The ONE active template a partner is asked to sign when they finish onboarding ("Continue to Agreement"). Audience must be partner or any.';

-- ── 4 · One vault write path, two gates ────────────────────────────────────
create or replace function public.partner_credential_write(
  p_agency uuid, p_group uuid, p_platform text, p_label text,
  p_username text, p_url text, p_secret text, p_code_destination text, p_notes text,
  p_rotation_due date, p_id uuid,
  p_category text, p_provider_name text, p_account_name text, p_account_type text,
  p_affiliate_link text, p_dashboard_url text)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_id      uuid := p_id;
  v_secret  uuid;
  v_name    text;
  v_created boolean := p_id is null;
  v_cat     text := coalesce(p_category, (select category from public.credential_platforms where key = p_platform), 'other');
begin
  if public.looks_like_a_secret(p_notes) then
    raise exception 'Put the password in the password field, not the notes. The notes are stored in the clear.'
      using errcode = '22023';
  end if;

  if v_created then
    insert into public.partner_credentials
      (agency_id, group_id, platform_key, label, username, url, code_destination, notes, rotation_due_on,
       category, provider_name, account_name, account_type, affiliate_link, dashboard_url, updated_by)
    values
      (p_agency, p_group, p_platform, p_label, p_username, p_url, p_code_destination, p_notes, p_rotation_due,
       v_cat, nullif(trim(p_provider_name), ''), nullif(trim(p_account_name), ''), p_account_type,
       nullif(trim(p_affiliate_link), ''), nullif(trim(p_dashboard_url), ''), auth.uid())
    returning id into v_id;
    insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
    values (v_id, p_agency, auth.uid(), 'created');
  else
    update public.partner_credentials
       set platform_key = p_platform, label = p_label, username = p_username, url = p_url,
           code_destination = p_code_destination, notes = p_notes, rotation_due_on = p_rotation_due,
           category = v_cat, provider_name = nullif(trim(p_provider_name), ''),
           account_name = nullif(trim(p_account_name), ''), account_type = p_account_type,
           affiliate_link = nullif(trim(p_affiliate_link), ''), dashboard_url = nullif(trim(p_dashboard_url), '')
     where id = v_id and group_id = p_group and archived_at is null
    returning secret_id into v_secret;
    if not found then
      raise exception 'credential not found' using errcode = 'P0002';
    end if;
    insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
    values (v_id, p_agency, auth.uid(), 'updated');
  end if;

  /* NULL = leave the password alone; '' = there is none; anything else replaces it. */
  if p_secret is not null then
    select secret_id into v_secret from public.partner_credentials where id = v_id;
    if length(p_secret) = 0 then
      update public.partner_credentials set secret_id = null where id = v_id;
      if not v_created then
        insert into public.partner_credential_events (credential_id, agency_id, actor_id, action, note)
        values (v_id, p_agency, auth.uid(), 'updated', 'password cleared');
      end if;
    elsif v_secret is null then
      v_name := 'partner_credential:' || v_id::text;
      v_secret := vault.create_secret(p_secret, v_name, 'BES partner credential');
      update public.partner_credentials set secret_id = v_secret, last_rotated_at = now() where id = v_id;
      if not v_created then
        insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
        values (v_id, p_agency, auth.uid(), 'rotated');
      end if;
    else
      perform vault.update_secret(v_secret, p_secret, null, 'BES partner credential');
      update public.partner_credentials set last_rotated_at = now() where id = v_id;
      insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
      values (v_id, p_agency, auth.uid(), 'rotated');
    end if;
  end if;
  return v_id;
end $function$;
revoke execute on function public.partner_credential_write(uuid, uuid, text, text, text, text, text, text, text, date, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

/* Staff gate — the signature grows by six trailing optional parameters, so the
   old one goes (a second overload would be ambiguous for named-parameter calls). */
drop function if exists public.partner_credential_save(uuid, text, text, text, text, text, text, text, date, uuid);
create function public.partner_credential_save(
  p_group uuid, p_platform text, p_label text,
  p_username text default null, p_url text default null, p_secret text default null,
  p_code_destination text default null, p_notes text default null, p_rotation_due date default null,
  p_id uuid default null,
  p_category text default null, p_provider_name text default null, p_account_name text default null,
  p_account_type text default null, p_affiliate_link text default null, p_dashboard_url text default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_agency uuid;
begin
  select agency_id into v_agency from public.outsourcing_groups where id = p_group;
  if v_agency is null then raise exception 'partner not found' using errcode = 'P0002'; end if;
  if not (public.is_staff_of(v_agency) and public.agency_can('partners.credentials.manage') and public.can_see_partner(p_group)) then
    raise exception 'You may not change this partner''s credentials' using errcode = '42501';
  end if;
  return public.partner_credential_write(v_agency, p_group, p_platform, p_label, p_username, p_url, p_secret,
    p_code_destination, p_notes, p_rotation_due, p_id, p_category, p_provider_name, p_account_name,
    p_account_type, p_affiliate_link, p_dashboard_url);
end $function$;
revoke execute on function public.partner_credential_save(uuid, text, text, text, text, text, text, text, date, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.partner_credential_save(uuid, text, text, text, text, text, text, text, date, uuid, text, text, text, text, text, text) to authenticated;

/* Partner gate — their own systems, on their own record. */
create or replace function public.my_partner_credential_save(
  p_platform text, p_label text,
  p_username text default null, p_url text default null, p_secret text default null,
  p_code_destination text default null, p_notes text default null,
  p_id uuid default null,
  p_category text default null, p_provider_name text default null, p_account_name text default null,
  p_account_type text default null, p_affiliate_link text default null, p_dashboard_url text default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_group uuid := public.partner_group_of_user(); v_agency uuid;
begin
  if v_group is null then raise exception 'Not a partner contact' using errcode = '42501'; end if;
  select agency_id into v_agency from public.outsourcing_groups where id = v_group;
  return public.partner_credential_write(v_agency, v_group, p_platform, p_label, p_username, p_url, p_secret,
    p_code_destination, p_notes, null, p_id, p_category, p_provider_name, p_account_name,
    p_account_type, p_affiliate_link, p_dashboard_url);
end $function$;
revoke execute on function public.my_partner_credential_save(text, text, text, text, text, text, text, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.my_partner_credential_save(text, text, text, text, text, text, text, uuid, text, text, text, text, text, text) to authenticated;

-- ── 5 · Reveal and archive, the same way ───────────────────────────────────
create or replace function public.partner_credential_reveal_unchecked(p_id uuid)
returns text language plpgsql security definer set search_path = public as $function$
declare v_c public.partner_credentials; v_secret text;
begin
  select * into v_c from public.partner_credentials where id = p_id and archived_at is null;
  if v_c.id is null then raise exception 'credential not found' using errcode = 'P0002'; end if;
  if v_c.secret_id is null then raise exception 'That entry has no stored password' using errcode = 'P0002'; end if;
  /* Audit BEFORE the value leaves. */
  insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
  values (p_id, v_c.agency_id, auth.uid(), 'revealed');
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_c.secret_id;
  return v_secret;
end $function$;
revoke execute on function public.partner_credential_reveal_unchecked(uuid) from public, anon, authenticated;

create or replace function public.partner_credential_reveal(p_id uuid)
returns text language plpgsql security definer set search_path = public as $function$
declare v_c record;
begin
  select agency_id, group_id into v_c from public.partner_credentials where id = p_id and archived_at is null;
  if v_c.agency_id is null then raise exception 'credential not found' using errcode = 'P0002'; end if;
  if not (public.is_staff_of(v_c.agency_id) and public.agency_can('partners.credentials.view') and public.can_see_partner(v_c.group_id)) then
    raise exception 'You do not have permission to reveal partner passwords' using errcode = '42501';
  end if;
  return public.partner_credential_reveal_unchecked(p_id);
end $function$;

create or replace function public.my_partner_credential_reveal(p_id uuid)
returns text language plpgsql security definer set search_path = public as $function$
declare v_group uuid := public.partner_group_of_user();
begin
  if v_group is null or not exists (select 1 from public.partner_credentials where id = p_id and group_id = v_group and archived_at is null) then
    /* Says nothing about whether the id exists elsewhere. */
    raise exception 'credential not found' using errcode = 'P0002';
  end if;
  return public.partner_credential_reveal_unchecked(p_id);
end $function$;
revoke execute on function public.my_partner_credential_reveal(uuid) from public, anon;
grant execute on function public.my_partner_credential_reveal(uuid) to authenticated;

create or replace function public.my_partner_credential_archive(p_id uuid, p_reason text default 'Removed by the partner')
returns void language plpgsql security definer set search_path = public as $function$
declare v_group uuid := public.partner_group_of_user(); v_c public.partner_credentials;
begin
  select * into v_c from public.partner_credentials where id = p_id and archived_at is null;
  if v_group is null or v_c.id is null or v_c.group_id <> v_group then
    raise exception 'credential not found' using errcode = 'P0002';
  end if;
  update public.partner_credentials set archived_at = now(), archived_reason = coalesce(nullif(trim(p_reason), ''), 'Removed by the partner') where id = p_id;
  insert into public.partner_credential_events (credential_id, agency_id, actor_id, action, note)
  values (p_id, v_c.agency_id, auth.uid(), 'archived', coalesce(nullif(trim(p_reason), ''), 'Removed by the partner'));
end $function$;
revoke execute on function public.my_partner_credential_archive(uuid, text) from public, anon;
grant execute on function public.my_partner_credential_archive(uuid, text) to authenticated;

/* The partner reads their own systems — never the secret, and with the name
   of whoever last changed each one ("Updated Sep 10 by Megan Floyd"). */
create or replace function public.my_partner_credentials()
returns table (
  id uuid, platform_key text, platform_label text, category text, label text,
  provider_name text, account_name text, account_type text,
  username text, url text, affiliate_link text, dashboard_url text,
  code_destination text, notes text, has_secret boolean,
  updated_at timestamptz, updated_by_name text, created_at timestamptz
)
language sql stable security definer set search_path = public as $function$
  select c.id, c.platform_key, p.label, c.category, c.label,
         c.provider_name, c.account_name, c.account_type,
         c.username, c.url, c.affiliate_link, c.dashboard_url,
         c.code_destination, c.notes, c.secret_id is not null,
         c.updated_at, coalesce(nullif(trim(pr.full_name), ''), pr.email::text), c.created_at
    from public.partner_credentials c
    join public.credential_platforms p on p.key = c.platform_key
    left join public.profiles pr on pr.id = coalesce(c.updated_by, c.created_by)
   where c.group_id = public.partner_group_of_user()
     and c.archived_at is null
   order by c.category, p.sort, c.label
$function$;
revoke execute on function public.my_partner_credentials() from public, anon;
grant execute on function public.my_partner_credentials() to authenticated;

/* Staff read the same "who last changed it" through the row; a view keeps the
   select policy and adds the name. */
create or replace view public.partner_credentials_with_actor
with (security_invoker = true) as
  select c.*, coalesce(nullif(trim(pr.full_name), ''), pr.email::text) as updated_by_name, p.label as platform_label
    from public.partner_credentials c
    join public.credential_platforms p on p.key = c.platform_key
    left join public.profiles pr on pr.id = coalesce(c.updated_by, c.created_by);
grant select on public.partner_credentials_with_actor to authenticated;

-- ── 6 · The partner's own profile ──────────────────────────────────────────
create or replace function public.my_partner_profile_save(p jsonb)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_group uuid := public.partner_group_of_user();
  v_agency uuid; v_before jsonb; v_after jsonb; v_actor text; v_changed text[];
  k text;
begin
  if v_group is null then raise exception 'Not a partner contact' using errcode = '42501'; end if;
  select agency_id, to_jsonb(g) into v_agency, v_before from public.outsourcing_groups g where id = v_group;

  update public.outsourcing_groups
     set legal_business_name = coalesce(nullif(trim(p->>'legal_business_name'), ''), legal_business_name),
         name                = coalesce(nullif(trim(p->>'legal_business_name'), ''), name),
         dba_name            = case when p ? 'dba_name' then nullif(trim(p->>'dba_name'), '') else dba_name end,
         address_street      = case when p ? 'address_street' then nullif(trim(p->>'address_street'), '') else address_street end,
         address_city        = case when p ? 'address_city' then nullif(trim(p->>'address_city'), '') else address_city end,
         address_state       = case when p ? 'address_state' then nullif(trim(p->>'address_state'), '') else address_state end,
         address_zip         = case when p ? 'address_zip' then nullif(trim(p->>'address_zip'), '') else address_zip end,
         address             = nullif(concat_ws(', ',
                                 nullif(trim(coalesce(p->>'address_street', address_street)), ''),
                                 nullif(trim(coalesce(p->>'address_city', address_city)), ''),
                                 nullif(trim(concat_ws(' ', nullif(trim(coalesce(p->>'address_state', address_state)), ''),
                                                            nullif(trim(coalesce(p->>'address_zip', address_zip)), ''))), '')), ''),
         website             = case when p ? 'website' then nullif(trim(p->>'website'), '') else website end,
         phone               = case when p ? 'phone' then nullif(trim(p->>'phone'), '') else phone end,
         contact_email       = coalesce(nullif(trim(p->>'contact_email'), ''), contact_email)
   where id = v_group;

  /* The calling contact's own row. Email stays: it is their sign-in identity. */
  update public.partner_contacts
     set full_name = coalesce(nullif(trim(concat_ws(' ', p->>'first_name', p->>'last_name')), ''), full_name),
         title     = case when p ? 'title' then nullif(trim(p->>'title'), '') else title end,
         phone     = case when p ? 'mobile' then nullif(trim(p->>'mobile'), '') else phone end
   where group_id = v_group and user_id = auth.uid();

  select to_jsonb(g) into v_after from public.outsourcing_groups g where id = v_group;
  select array_agg(key order by key) into v_changed
    from jsonb_each(v_after) a where a.value is distinct from (v_before -> a.key) and a.key <> 'updated_at';

  select coalesce(full_name, email::text) into v_actor from public.partner_contacts where group_id = v_group and user_id = auth.uid();
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, field, visibility)
  values (v_agency, 'partner', v_group::text, auth.uid(), v_actor,
          'Partner updated their profile',
          case when v_changed is null then 'contact details' else array_to_string(v_changed, ', ') end,
          'partner_profile', 'shared_with_partner');
end $function$;
revoke execute on function public.my_partner_profile_save(jsonb) from public, anon;
grant execute on function public.my_partner_profile_save(jsonb) to authenticated;

-- ── 7 · Sending: an owner-only core, so onboarding can create the agreement ──
create or replace function public.signature_request_create_unchecked(
  p_template uuid, p_signer_kind text, p_user uuid, p_partner uuid, p_contact uuid, p_email text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  t record; ctx jsonb; body text; missing text[]; v_email citext; v_name text; v_id uuid; v_actor text;
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
    v_email := lower(trim(p_email))::citext; v_name := trim(p_name);
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
end $function$;
revoke execute on function public.signature_request_create_unchecked(uuid, text, uuid, uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.create_signature_request(
  p_template uuid, p_signer_kind text,
  p_user uuid default null, p_partner uuid default null, p_contact uuid default null,
  p_email text default null, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_agency uuid;
begin
  select agency_id into v_agency from public.document_templates where id = p_template;
  if v_agency is null then raise exception 'Template not found' using errcode = 'P0002'; end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('documents.manage') then
    raise exception 'Sending a document for signature needs the document builder permission' using errcode = '42501';
  end if;
  return public.signature_request_create_unchecked(p_template, p_signer_kind, p_user, p_partner, p_contact, p_email, p_name);
end $function$;

-- ── 8 · Finishing onboarding: confirm, record, and hand over the agreement ──
/**
 * Returns the signing token of the onboarding agreement when BES has flagged
 * one, else NULL (onboarding is complete; the agreement will come from BES).
 * Idempotent: calling it again returns the still-open request's token rather
 * than creating a second one.
 */
create or replace function public.my_partner_onboarding_complete(p_confirm boolean)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_group uuid := public.partner_group_of_user();
  v_agency uuid; v_contact uuid; v_template uuid; v_req uuid; v_token uuid; v_actor text;
begin
  if v_group is null then raise exception 'Not a partner contact' using errcode = '42501'; end if;
  if not coalesce(p_confirm, false) then
    raise exception 'Please confirm that BES may use the information and access you provided' using errcode = '22023';
  end if;
  select agency_id into v_agency from public.outsourcing_groups where id = v_group;
  select id into v_contact from public.partner_contacts where group_id = v_group and user_id = auth.uid();

  update public.outsourcing_groups
     set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
         onboarding_completed_by = coalesce(onboarding_completed_by, auth.uid()),
         access_confirmed_at = now(),
         access_confirmed_by = auth.uid()
   where id = v_group;

  select coalesce(full_name, email::text) into v_actor from public.partner_contacts where id = v_contact;
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, field, visibility)
  values (v_agency, 'partner', v_group::text, auth.uid(), v_actor,
          'Partner completed onboarding', 'Access to the systems provided was confirmed for authorized BES services.',
          'onboarding', 'shared_with_partner');

  select id into v_template from public.document_templates
   where agency_id = v_agency and partner_onboarding_agreement and status = 'active' limit 1;
  if v_template is null then return null; end if;

  select token into v_token from public.signature_requests
   where template_id = v_template and signer_contact_id = v_contact and status in ('sent', 'viewed')
   order by sent_at desc limit 1;
  if v_token is not null then return v_token; end if;

  v_req := public.signature_request_create_unchecked(v_template, 'partner_contact', null, null, v_contact, null, null);
  select token into v_token from public.signature_requests where id = v_req;
  return v_token;
end $function$;
revoke execute on function public.my_partner_onboarding_complete(boolean) from public, anon;
grant execute on function public.my_partner_onboarding_complete(boolean) to authenticated;
