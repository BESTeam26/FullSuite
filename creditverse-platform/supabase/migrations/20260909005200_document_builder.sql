-- =============================================================================
-- Document builder with e-signature (Dee, 2026-09-09, D-005 activated).
--
-- "I should have a document Builder just like DocuSign… create documents in
-- Settings with folders… with custom value/field, and SIGNATURE field and
-- date they sign it… an email will be sent to the agent to sign."
--
-- ── THREE RECORDS, ONE RULE ────────────────────────────────────────────────
--
--   document_folders      how Dee organises them (Partner, Agent, Credit…)
--   document_templates    the body, with {{namespace.field}} merge fields and
--                         a {{signature}} / {{signed_date}} block; VERSIONED
--   signature_requests    one document sent to one person: the RENDERED
--                         SNAPSHOT taken at send time, a tokenised link, and
--                         the signature evidence when it lands
--
-- The rule: once rendered for signature, the words never change. A template
-- edit bumps its version and touches no request; a custom value or a rate
-- edited next month cannot rewrite what somebody signed (D-004's snapshot
-- rule, rule 11). Signing fills the signature fields INTO the snapshot and
-- keeps both copies.
--
-- ── ONE RENDERER ──────────────────────────────────────────────────────────
--
-- `render_document` is the canonical merge-field renderer (D-004): data
-- resolution only, HTML-escaped values, allowlisted by what the context
-- carries. It executes nothing. Unresolved tokens are reported, and sending
-- REFUSES while any non-signature token is unresolved (§11 of the template
-- directive) — "Hello {{contact.first_name}}" never goes out.
--
-- ── WHO MAY DO WHAT ───────────────────────────────────────────────────────
--
--   documents.manage   build templates, send requests, void them, see all
--   the signer         reads and signs their OWN document through the token,
--                      with no account required (anon), like an invitation
--   a member           reads requests addressed to them once signed in
-- =============================================================================

insert into public.permission_keys (key, module, label, description, security_relevant, sort)
values ('documents.manage', 'Documents', 'Document builder',
        'Build document templates, send them for signature, and see every signature request. Signed documents attach to the person''s own record.',
        true, 42)
on conflict (key) do nothing;

-- ── Folders ───────────────────────────────────────────────────────────────
create table public.document_folders (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies(id),
  name       text not null,
  kind       text not null default 'other'
             check (kind in ('partner', 'agent', 'credit_repair', 'proposal', 'agreement', 'policy', 'other')),
  sort       integer not null default 100,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (agency_id, name)
);

-- ── Templates ─────────────────────────────────────────────────────────────
create table public.document_templates (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id),
  folder_id   uuid references public.document_folders(id) on delete set null,
  name        text not null,
  /* Who this is written for — decides which merge namespaces resolve. */
  audience    text not null default 'member'
              check (audience in ('member', 'partner', 'client', 'any')),
  body        text not null default '',
  version     integer not null default 1,
  status      text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.document_templates is
  'Reusable documents with {{namespace.field}} merge fields and a {{signature}}/{{signed_date}} block. A body edit bumps version; signature_requests record the version they rendered.';

create index document_templates_folder on public.document_templates (agency_id, folder_id, status);

/* A changed body is a new version. Requests already sent keep theirs. */
create or replace function public.document_template_version()
returns trigger
language plpgsql as $function$
begin
  if new.body is distinct from old.body then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $function$;

create trigger document_templates_version
  before update on public.document_templates
  for each row execute function public.document_template_version();

-- ── Signature requests ────────────────────────────────────────────────────
create table public.signature_requests (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id),
  template_id        uuid references public.document_templates(id) on delete set null,
  template_version   integer,
  title              text not null,
  /* The snapshot: rendered at send, never re-rendered. */
  rendered_html      text not null,
  /* The snapshot with the signature fields filled — written once at signing. */
  signed_html        text,
  signer_kind        text not null check (signer_kind in ('member', 'partner_contact', 'client', 'external')),
  signer_user_id     uuid references public.profiles(id),
  signer_contact_id  uuid references public.partner_contacts(id),
  outsourcing_group_id uuid references public.outsourcing_groups(id),
  signer_email       citext not null,
  signer_name        text not null,
  token              uuid not null unique default gen_random_uuid(),
  status             text not null default 'sent'
                     check (status in ('sent', 'viewed', 'signed', 'declined', 'voided', 'expired')),
  sent_at            timestamptz not null default now(),
  viewed_at          timestamptz,
  signed_at          timestamptz,
  expires_at         timestamptz not null default now() + interval '30 days',
  signature_name     text,
  signature_ip       text,
  signature_user_agent text,
  member_document_id uuid references public.member_documents(id) on delete set null,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now()
);

comment on table public.signature_requests is
  'One document sent to one person for signature. rendered_html is the frozen snapshot; signed_html adds the signature and date. The token is the signer''s only key and works with no account.';

create index signature_requests_signer on public.signature_requests (signer_user_id, status);
create index signature_requests_agency on public.signature_requests (agency_id, status, sent_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.document_folders enable row level security;
alter table public.document_templates enable row level security;
alter table public.signature_requests enable row level security;

create policy document_folders_select on public.document_folders
  for select to authenticated using (public.is_staff_of(agency_id));
create policy document_folders_write on public.document_folders
  for all to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('documents.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('documents.manage'));

create policy document_templates_select on public.document_templates
  for select to authenticated using (public.is_staff_of(agency_id));
create policy document_templates_write on public.document_templates
  for all to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('documents.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('documents.manage'));

/* The manager sees all; a member sees the requests addressed to them. No
   insert or update from a browser: sending, viewing and signing are named
   acts through the functions below. */
create policy signature_requests_select on public.signature_requests
  for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (public.agency_can('documents.manage') or signer_user_id = auth.uid())
  );

revoke all on public.document_folders, public.document_templates, public.signature_requests from public, anon;
grant select, insert, update, delete on public.document_folders to authenticated;
grant select, insert, update on public.document_templates to authenticated;
grant select on public.signature_requests to authenticated;

-- ── The one renderer (D-004) ──────────────────────────────────────────────
/**
 * Replace every {{namespace.field}} (or {{field}}) with the HTML-escaped value
 * at that path in p_context. Tokens with no value stay in place, so the
 * caller can see and refuse them. Data resolution only — no expressions.
 */
create or replace function public.render_document(p_body text, p_context jsonb)
returns text
language plpgsql immutable as $function$
declare
  out_text text := coalesce(p_body, '');
  tok text; path text[]; val jsonb; rendered text;
begin
  for tok in
    select distinct m[1] from regexp_matches(coalesce(p_body, ''), '\{\{\s*([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\s*\}\}', 'gi') as m
  loop
    path := string_to_array(lower(tok), '.');
    val := p_context #> path;
    if val is not null and jsonb_typeof(val) <> 'null' then
      rendered := case jsonb_typeof(val) when 'string' then val #>> '{}' else val::text end;
      /* Escaped for HTML: a partner name is data, never markup (§14). */
      rendered := replace(replace(replace(replace(replace(rendered, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
      out_text := regexp_replace(out_text, '\{\{\s*' || regexp_replace(tok, '\.', '\\.', 'g') || '\s*\}\}', rendered, 'gi');
    end if;
  end loop;
  return out_text;
end $function$;

/** The tokens the renderer could NOT resolve — for the refusal before send. */
create or replace function public.unresolved_document_tokens(p_body text, p_context jsonb)
returns text[]
language sql immutable as $function$
  select coalesce(array_agg(distinct m[1] order by m[1]), '{}')
    from regexp_matches(coalesce(p_body, ''), '\{\{\s*([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\s*\}\}', 'gi') as m
   where (p_context #> string_to_array(lower(m[1]), '.')) is null
      or jsonb_typeof(p_context #> string_to_array(lower(m[1]), '.')) = 'null'
$function$;

/**
 * The merge context for one signer, from CANONICAL records — never typed in.
 * custom_values read through to the agency's own fields (rule 2: the name and
 * tagline already have a home). Signature fields are deliberately absent:
 * they resolve at signing, not at sending.
 */
create or replace function public.document_context_for(
  p_agency uuid, p_signer_kind text, p_user uuid, p_partner uuid, p_contact uuid
) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare
  ctx jsonb := '{}'::jsonb;
  a record; p record; m record; g record; c record;
begin
  select name, branding into a from public.agencies where id = p_agency;
  ctx := ctx || jsonb_build_object(
    'custom_values', jsonb_build_object(
      'company_name', coalesce(a.name, 'Blessed Empire Services'),
      'legal_business_name', coalesce(a.branding->>'legalName', a.name, 'Blessed Empire Services'),
      'tagline', coalesce(a.branding->>'tagline', ''),
      'support_email', coalesce(a.branding->>'supportEmail', ''),
      'support_phone', coalesce(a.branding->>'supportPhone', ''),
      'website_url', coalesce(a.branding->>'websiteUrl', '')),
    'today', to_char(current_date, 'FMMonth DD, YYYY'),
    'current_year', extract(year from current_date)::text,
    'agreement', jsonb_build_object('effective_date', to_char(current_date, 'FMMonth DD, YYYY')));

  if p_user is not null then
    select pr.full_name, pr.email, pr.phone into p from public.profiles pr where pr.id = p_user;
    select am.job_title into m from public.agency_memberships am where am.user_id = p_user and am.agency_id = p_agency;
    ctx := ctx || jsonb_build_object('user', jsonb_build_object(
      'name', coalesce(p.full_name, p.email),
      'first_name', split_part(coalesce(p.full_name, p.email), ' ', 1),
      'last_name', nullif(regexp_replace(coalesce(p.full_name, ''), '^\S+\s*', ''), ''),
      'email', p.email,
      'phone', coalesce(p.phone, ''),
      'position', coalesce(m.job_title, '')));
  end if;

  if p_partner is not null then
    select name, partner_name, primary_contact, contact_email::text as contact_email, phone into g
      from public.outsourcing_groups where id = p_partner;
    ctx := ctx || jsonb_build_object('partner', jsonb_build_object(
      'name', g.name,
      'company_name', coalesce(g.partner_name, g.name),
      'primary_contact', coalesce(g.primary_contact, ''),
      'email', coalesce(g.contact_email, ''),
      'phone', coalesce(g.phone, '')));
  end if;

  if p_contact is not null then
    select full_name, email::text as email, phone into c from public.partner_contacts where id = p_contact;
    ctx := ctx || jsonb_build_object('contact', jsonb_build_object(
      'name', c.full_name,
      'first_name', split_part(coalesce(c.full_name, ''), ' ', 1),
      'last_name', nullif(regexp_replace(coalesce(c.full_name, ''), '^\S+\s*', ''), ''),
      'email', c.email,
      'phone', coalesce(c.phone, '')));
  end if;

  return ctx;
end $function$;

revoke execute on function public.document_context_for(uuid, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.document_context_for(uuid, text, uuid, uuid, uuid) to authenticated;

-- ── Sending: render, refuse the unresolved, snapshot ──────────────────────
create or replace function public.create_signature_request(
  p_template uuid,
  p_signer_kind text,
  p_user uuid default null,
  p_partner uuid default null,
  p_contact uuid default null,
  p_email text default null,
  p_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  t record; ctx jsonb; body text; missing text[]; v_email citext; v_name text; v_id uuid; v_actor text;
begin
  select * into t from public.document_templates where id = p_template;
  if t.id is null then raise exception 'Template not found' using errcode = 'P0002'; end if;
  if not public.is_staff_of(t.agency_id) or not public.agency_can('documents.manage') then
    raise exception 'Sending a document for signature needs the document builder permission' using errcode = '42501';
  end if;
  if t.status <> 'active' then
    raise exception 'Only an active template can be sent. Activate it first.' using errcode = '22023';
  end if;
  if p_signer_kind not in ('member', 'partner_contact', 'client', 'external') then
    raise exception 'Unknown signer kind' using errcode = '22023';
  end if;

  /* Who signs, and where the email goes — from the record, not retyped. */
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
  /* The signer's own name and email are always addressable, whatever kind. */
  ctx := ctx || jsonb_build_object('signer', jsonb_build_object('name', v_name, 'email', v_email::text));

  /* §11: refuse rather than send blanks. Signature fields are the exception —
     they are filled at signing and belong in the snapshot as fields. */
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

revoke execute on function public.create_signature_request(uuid, text, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.create_signature_request(uuid, text, uuid, uuid, uuid, text, text) to authenticated;

-- ── The signer's door: read by token, no account needed ───────────────────
create or replace function public.signature_request_preview(p_token uuid)
returns table (title text, signer_name text, signer_email text, rendered_html text, signed_html text,
               status text, expires_at timestamptz, signed_at timestamptz, agency_name text, agency_branding jsonb)
language plpgsql security definer set search_path = public as $function$
begin
  /* Opening the link is the "viewed" fact, recorded once. */
  update public.signature_requests
     set status = 'viewed', viewed_at = now()
   where token = p_token and status = 'sent' and expires_at > now();

  return query
    select r.title, r.signer_name, r.signer_email::text, r.rendered_html, r.signed_html,
           case when r.status in ('sent', 'viewed') and r.expires_at <= now() then 'expired' else r.status end,
           r.expires_at, r.signed_at, a.name, a.branding
      from public.signature_requests r
      join public.agencies a on a.id = r.agency_id
     where r.token = p_token and r.status <> 'voided';
end $function$;

revoke execute on function public.signature_request_preview(uuid) from public;
grant execute on function public.signature_request_preview(uuid) to anon, authenticated;

/**
 * Signing. A typed name and explicit consent; the fields are filled INTO the
 * snapshot and the evidence (name, time, address, agent) is kept beside it.
 * A member's signed document becomes a member_documents row, so it shows on
 * their profile's Documents tab as signed with its date.
 */
create or replace function public.sign_document(
  p_token uuid, p_typed_name text, p_consent boolean, p_ip text default null, p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  r record; v_signed text; v_date text; v_doc uuid;
begin
  select * into r from public.signature_requests where token = p_token;
  if r.id is null or r.status = 'voided' then
    raise exception 'This signing link is not valid' using errcode = '22023';
  end if;
  if r.status = 'signed' then
    raise exception 'This document has already been signed' using errcode = '22023';
  end if;
  if r.expires_at <= now() then
    raise exception 'This signing link has expired. Ask the sender for a new one.' using errcode = '22023';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Please confirm you agree to sign electronically' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_typed_name, ''))) < 2 then
    raise exception 'Type your full name to sign' using errcode = '22023';
  end if;

  v_date := to_char(now(), 'FMMonth DD, YYYY');
  v_signed := public.render_document(r.rendered_html, jsonb_build_object(
    'signature', trim(p_typed_name),
    'signed_date', v_date));

  /* A member's signed agreement is part of their record. */
  if r.signer_kind = 'member' and r.signer_user_id is not null then
    insert into public.member_documents
          (agency_id, user_id, kind, name, status, sent_at, signed_at, visible_to_member, created_by, notes)
    values (r.agency_id, r.signer_user_id,
            case when r.title ilike '%nda%' then 'nda'
                 when r.title ilike '%policy%' then 'policy'
                 when r.title ilike '%acknowledg%' then 'acknowledgment'
                 else 'agreement' end,
            r.title, 'signed', r.sent_at, now(), true, r.created_by,
            'Signed electronically by ' || trim(p_typed_name) || ' on ' || v_date || '.')
    returning id into v_doc;
  end if;

  update public.signature_requests
     set status = 'signed', signed_at = now(), signed_html = v_signed,
         signature_name = trim(p_typed_name), signature_ip = p_ip, signature_user_agent = p_user_agent,
         member_document_id = v_doc
   where id = r.id;

  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, new_value, visibility)
  values (r.agency_id,
          case when r.signer_kind = 'member' then 'agency_member' when r.outsourcing_group_id is not null then 'partner' else 'signature_request' end,
          coalesce(r.signer_user_id::text, r.outsourcing_group_id::text, r.id::text),
          r.signer_user_id, trim(p_typed_name), 'Document signed: ' || r.title, 'signature_request',
          v_date, 'bes_internal');
end $function$;

revoke execute on function public.sign_document(uuid, text, boolean, text, text) from public;
grant execute on function public.sign_document(uuid, text, boolean, text, text) to anon, authenticated;

/** A manager withdraws an unsigned request. The row stays; it was sent. */
create or replace function public.void_signature_request(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare r record;
begin
  select * into r from public.signature_requests where id = p_id;
  if r.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if not public.is_staff_of(r.agency_id) or not public.agency_can('documents.manage') then
    raise exception 'Voiding a request needs the document builder permission' using errcode = '42501';
  end if;
  if r.status = 'signed' then
    raise exception 'A signed document cannot be voided. Send a superseding one.' using errcode = '22023';
  end if;
  update public.signature_requests set status = 'voided' where id = p_id;
end $function$;

revoke execute on function public.void_signature_request(uuid) from public, anon;
grant execute on function public.void_signature_request(uuid) to authenticated;

-- ── Starter folders, so the screen is not empty on first open ─────────────
insert into public.document_folders (agency_id, name, kind, sort)
select a.id, f.name, f.kind, f.sort
  from public.agencies a
  cross join (values ('Agent Documents', 'agent', 10), ('Partner Documents', 'partner', 20),
                     ('Credit Repair Documents', 'credit_repair', 30), ('Proposals & Agreements', 'agreement', 40)) as f(name, kind, sort)
on conflict (agency_id, name) do nothing;
