-- 0225 — The partner credential vault.
--
-- ===========================================================================
-- WHY THIS EXISTS, AND WHY THE EARLIER ADVICE WAS WRONG
-- ===========================================================================
--
-- On finding plaintext passwords in ClickUp I told Dee to rotate them and move
-- them to a password manager. Dee's answer is the operational fact I had not
-- accounted for:
--
--   "All logins are important as we collect them during client onboarding
--    before we can even do fulfillment for them… I need something my team can
--    easily copy and paste from the partner database cause we have so many
--    logins."
--
-- The credentials ARE the work. A processor cannot open a dispute without the
-- partner's DisputeFox login. Telling the team to keep them somewhere else is
-- telling them to keep a second system in sync with this one — which is how
-- they ended up in a ClickUp description in the first place.
--
-- So BES stores them, and stores them properly. The problem was never that
-- they were written down. It was that they were written down in a free-text
-- field that everybody with `partners.view` could read, that no one could
-- audit, and that a database dump would have handed over in plain text.
--
-- ===========================================================================
-- WHAT MAKES THIS DIFFERENT FROM A NOTES FIELD
-- ===========================================================================
--
-- 1. ENCRYPTED AT REST, WITH THE KEY OUTSIDE THE ROW. The secret lives in
--    Supabase Vault (`vault.secrets`), authenticated-encrypted against a key
--    this database does not store. `partner_credentials` holds only a
--    `secret_id`, which is useless on its own. A dump of every table in
--    `public` yields no password.
--
-- 2. NO GRANT REACHES IT. `vault` is granted to `postgres` only — not to
--    `authenticated`, not to `anon`. Every read goes through one SECURITY
--    DEFINER function that checks authorization in its own body.
--
-- 3. THE METADATA AND THE SECRET ARE SEPARATELY AUTHORIZED. Seeing that a
--    DisputeFox login EXISTS, and its username, needs `partners.view` and an
--    assignment to that partner. Seeing the PASSWORD needs
--    `partners.credentials.view` as well. Most of the copy-and-paste a
--    processor does all day is the username and the URL, which cost nothing.
--
-- 4. EVERY REVEAL IS AUDITED. 0218 §36 says audit administration and never
--    reads — and this is the deliberate exception, because with a shared
--    credential the READ is the sensitive act. When a partner's account is
--    compromised the only useful question is who had the password and when,
--    and a system that cannot answer it is not a vault.
--
-- 5. IT IS NEVER CLIENT-FACING. There is no portal branch, no organization
--    branch, no `shared_with_partner` anything. Not a hidden control — the
--    absence of a policy.
--
-- ===========================================================================
-- WHAT IT DOES NOT DO
-- ===========================================================================
--
-- It does not replace rotating the credentials that were already exposed in
-- ClickUp. Anything that sat in a shared description should be assumed read
-- and changed; importing it here preserves the exposure with better storage.
-- That remains item 0.1 for Dee.
-- ===========================================================================

----------------------------------------------------------------------
-- 1. The platforms, as rows
----------------------------------------------------------------------
create table public.credential_platforms (
  key    text primary key check (key ~ '^[a-z][a-z0-9_]{1,38}$'),
  label  text not null,
  /* Where the security code lands is the question the team asks most after
     the password itself, so the catalogue says which platforms send one. */
  sends_code boolean not null default false,
  sort   integer not null default 0
);
insert into public.credential_platforms (key, label, sends_code, sort) values
  ('disputefox',   'DisputeFox',            true,  10),
  ('gohighlevel',  'GoHighLevel',           true,  20),
  ('letterstream', 'LetterStream',          true,  30),
  ('email',        'Email / mailbox',       false, 40),
  ('google',       'Google account',        true,  50),
  ('zapier',       'Zapier',                false, 60),
  ('crc',          'Credit Repair Cloud',   false, 70),
  ('stripe',       'Stripe',                true,  80),
  ('paypal',       'PayPal',                true,  90),
  ('clickup',      'ClickUp',               false, 100),
  ('phone',        'Phone / SMS system',    false, 110),
  ('other',        'Other',                 false, 999)
on conflict (key) do nothing;

alter table public.credential_platforms enable row level security;
revoke all on public.credential_platforms from public, anon;
grant select on public.credential_platforms to authenticated;
create policy credential_platforms_select on public.credential_platforms
  for select to authenticated using (public.is_agency_staff());

----------------------------------------------------------------------
-- 2. The credential. NOTE WHAT IS NOT HERE: a password column.
----------------------------------------------------------------------
create table public.partner_credentials (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  group_id      uuid not null references public.outsourcing_groups(id) on delete cascade,

  platform_key  text not null references public.credential_platforms(key) on delete restrict,
  /* "Main DF login", "GHL Admin — Kierra". What the team recognises it by. */
  label         text not null check (length(trim(label)) between 1 and 120),
  /* NOT a secret, and the thing most often copied. Kept in the clear on
     purpose: encrypting it would make the common case require a reveal. */
  username      text,
  url           text,
  /* "code goes to accounts@dispute-me.com", "+1 480 267 3023". Where the
     second factor arrives — not the factor itself. */
  code_destination text,
  /* Non-secret working notes: which mailbox, which team uses it, what it is
     for. A password put here is a password in the clear, which is the whole
     problem this table exists to solve — the interface warns, and
     `partner_credential_save` refuses an obvious one outright. */
  notes         text,

  /* The pointer into Supabase Vault. Useless without vault access, which
     `authenticated` does not have. NULL for an entry that has no password —
     an SSO login, or a note about where a credential lives. */
  secret_id     uuid,

  last_rotated_at  timestamptz,
  rotation_due_on  date,
  archived_at      timestamptz,
  archived_reason  text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index partner_credentials_group_idx on public.partner_credentials (group_id)
  where archived_at is null;
create index partner_credentials_rotation_idx on public.partner_credentials (rotation_due_on)
  where archived_at is null and rotation_due_on is not null;
create trigger partner_credentials_updated_at before update on public.partner_credentials
  for each row execute function public.set_updated_at();

comment on table public.partner_credentials is
  'Logins BES needs to fulfil for a partner. There is deliberately NO password column: the secret is in Supabase Vault and this row holds only a `secret_id`, so a dump of the public schema yields no credential. Seeing an entry needs partners.view; seeing its password needs partners.credentials.view and is audited.';

comment on column public.partner_credentials.username is
  'Kept in the clear deliberately. It is not a secret, and it is what the team copies twenty times a day — encrypting it would put a reveal, and an audit row, in front of the ordinary case.';

----------------------------------------------------------------------
-- 3. The audit. Append-only, and it records READS.
----------------------------------------------------------------------
create table public.partner_credential_events (
  id            bigint generated always as identity primary key,
  credential_id uuid not null references public.partner_credentials(id) on delete cascade,
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null check (action in ('created', 'updated', 'revealed', 'rotated', 'archived')),
  note          text,
  created_at    timestamptz not null default now()
);
create index partner_credential_events_cred_idx
  on public.partner_credential_events (credential_id, created_at desc);
create index partner_credential_events_actor_idx
  on public.partner_credential_events (actor_id, created_at desc);

comment on table public.partner_credential_events is
  'Who looked at which credential, and when. 0218 §36 says audit administration and never reads; this is the deliberate exception, because with a SHARED credential the read IS the sensitive act. When an account is compromised the only useful question is who held the password — a vault that cannot answer it is a filing cabinet.';

----------------------------------------------------------------------
-- 4. Authorization
--
--    Two levels, because the day's work is mostly the username.
----------------------------------------------------------------------
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('partners.credentials.view', 'partners', 'Reveal partner passwords',
   'See the password behind a partner credential. Every reveal is recorded against the person who asked. Seeing that a login exists, and its username, needs only partners.view.', true, 60),
  ('partners.credentials.manage', 'partners', 'Add and change partner credentials',
   'Create, edit, rotate and archive the logins BES holds for a partner.', true, 61)
on conflict (key) do nothing;

/* Off for everyone below admin by default. An agency grants it deliberately —
   and for a fulfilment team that needs it daily, granting it is one row and
   revoking it is one row, which is the point of it being a capability rather
   than a role. */
insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'partners.credentials.view',   false),
  (null, 'agency_manager',   'partners.credentials.manage', false),
  (null, 'agency_team_lead', 'partners.credentials.view',   false),
  (null, 'agency_team_lead', 'partners.credentials.manage', false),
  (null, 'agency_agent',     'partners.credentials.view',   false),
  (null, 'agency_agent',     'partners.credentials.manage', false)
on conflict do nothing;

alter table public.partner_credentials       enable row level security;
alter table public.partner_credential_events enable row level security;
revoke all on public.partner_credentials, public.partner_credential_events
  from public, anon, authenticated;
grant select on public.partner_credentials, public.partner_credential_events to authenticated;
/* No INSERT, UPDATE or DELETE grant at all. Every write goes through the
   DEFINER functions below, because a write has to touch the vault and the
   audit in one transaction and a policy cannot make that true. */

create policy partner_credentials_select on public.partner_credentials
  for select to authenticated
  using (public.is_staff_of(agency_id)
         and public.agency_can('partners.view')
         and public.can_see_partner(group_id));

create policy partner_credential_events_select on public.partner_credential_events
  for select to authenticated
  using (exists (select 1 from public.partner_credentials c
                  where c.id = partner_credential_events.credential_id
                    and public.is_staff_of(c.agency_id)
                    and public.agency_can('partners.view')
                    and public.can_see_partner(c.group_id)));
/* No UPDATE or DELETE policy: an access record is not editable (rule 10). */

----------------------------------------------------------------------
-- 5. Save. One transaction: the vault, the row, the audit.
----------------------------------------------------------------------
/* A notes field is where a password goes to hide. Generous on purpose: the
   cost of a false positive is one refused save with a clear message, and the
   cost of a false negative is a plaintext credential in a readable column. */
create or replace function public.looks_like_a_secret(p_text text)
returns boolean language sql immutable set search_path = public as $function$
  select coalesce(p_text, '') ~* '(pass\s*word|passcode|\bpwd\b|api[\s_-]?key|secret\s*key|bearer\s+[A-Za-z0-9._-]{12}|security\s*code)'
$function$;
revoke execute on function public.looks_like_a_secret(text) from public, anon;
grant execute on function public.looks_like_a_secret(text) to authenticated;

create or replace function public.partner_credential_save(
  p_group            uuid,
  p_platform         text,
  p_label            text,
  p_username         text default null,
  p_url              text default null,
  p_secret           text default null,
  p_code_destination text default null,
  p_notes            text default null,
  p_rotation_due     date default null,
  p_id               uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid;
  v_id     uuid := p_id;
  v_secret uuid;
  v_name   text;
begin
  select agency_id into v_agency from public.outsourcing_groups where id = p_group;
  if v_agency is null then
    raise exception 'partner not found' using errcode = 'P0002';
  end if;
  /* DEFINER, so the checks are here rather than in a policy — and they are the
     SAME predicates the SELECT policy uses, not a second opinion. */
  if not (public.is_staff_of(v_agency)
          and public.agency_can('partners.credentials.manage')
          and public.can_see_partner(p_group)) then
    raise exception 'You may not change this partner''s credentials' using errcode = '42501';
  end if;
  if public.looks_like_a_secret(p_notes) then
    raise exception 'That note looks like it contains a password. Put it in the password field instead, where it is encrypted and every look at it is recorded.'
      using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.partner_credentials
      (agency_id, group_id, platform_key, label, username, url, code_destination, notes, rotation_due_on)
    values (v_agency, p_group, p_platform, p_label, p_username, p_url, p_code_destination, p_notes, p_rotation_due)
    returning id into v_id;
    insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'created');
  else
    update public.partner_credentials
       set platform_key = p_platform, label = p_label, username = p_username, url = p_url,
           code_destination = p_code_destination, notes = p_notes, rotation_due_on = p_rotation_due
     where id = v_id and group_id = p_group and archived_at is null;
    if not found then
      raise exception 'credential not found' using errcode = 'P0002';
    end if;
    insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'updated');
  end if;

  /* NULL means "leave the password alone" — editing a label must not silently
     wipe a credential nobody meant to touch. An empty string clears it. */
  if p_secret is not null then
    select secret_id into v_secret from public.partner_credentials where id = v_id;
    if length(p_secret) = 0 then
      update public.partner_credentials set secret_id = null where id = v_id;
    elsif v_secret is null then
      /* The vault name is opaque on purpose: it appears in `vault.secrets`,
         which administrators can list, and a name like
         "DisputeFox — Credit Cure" would leak the inventory. */
      v_name := 'partner_credential:' || v_id::text;
      v_secret := vault.create_secret(p_secret, v_name, 'BES partner credential');
      update public.partner_credentials
         set secret_id = v_secret, last_rotated_at = now() where id = v_id;
    else
      perform vault.update_secret(v_secret, p_secret, null, 'BES partner credential');
      update public.partner_credentials set last_rotated_at = now() where id = v_id;
    end if;
    insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'rotated');
  end if;

  return v_id;
end $function$;
revoke execute on function public.partner_credential_save(uuid, text, text, text, text, text, text, text, date, uuid) from public, anon;
grant execute on function public.partner_credential_save(uuid, text, text, text, text, text, text, text, date, uuid) to authenticated;

comment on function public.partner_credential_save(uuid, text, text, text, text, text, text, text, date, uuid) is
  'Creates or updates one partner credential, writing the secret to Supabase Vault and the audit row in the same transaction. A NULL password means "leave it alone" — editing a label must not silently wipe a credential.';

----------------------------------------------------------------------
-- 6. Reveal. The only way out of the vault, and it is recorded.
----------------------------------------------------------------------
create or replace function public.partner_credential_reveal(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $function$
declare
  v_c      public.partner_credentials;
  v_secret text;
begin
  select * into v_c from public.partner_credentials where id = p_id and archived_at is null;
  if v_c.id is null then
    raise exception 'credential not found' using errcode = 'P0002';
  end if;
  if not (public.is_staff_of(v_c.agency_id)
          and public.agency_can('partners.credentials.view')
          and public.can_see_partner(v_c.group_id)) then
    /* Says what is missing without saying what exists. */
    raise exception 'You do not have permission to reveal partner passwords' using errcode = '42501';
  end if;
  if v_c.secret_id is null then
    raise exception 'That entry has no stored password' using errcode = 'P0002';
  end if;

  /* The audit is written BEFORE the value is returned, so a client that
     disconnects mid-response still leaves a record of having asked. */
  insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
  values (p_id, v_c.agency_id, auth.uid(), 'revealed');

  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_c.secret_id;
  return v_secret;
end $function$;
revoke execute on function public.partner_credential_reveal(uuid) from public, anon;
grant execute on function public.partner_credential_reveal(uuid) to authenticated;

comment on function public.partner_credential_reveal(uuid) is
  'The ONLY path out of the vault. Checks the capability and the partner assignment, records the reveal against the person BEFORE returning the value, and never logs the value itself.';

----------------------------------------------------------------------
-- 7. Archive, never delete (rule 11)
----------------------------------------------------------------------
create or replace function public.partner_credential_archive(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_c public.partner_credentials;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Archiving a credential needs a reason' using errcode = '22023';
  end if;
  select * into v_c from public.partner_credentials where id = p_id and archived_at is null;
  if v_c.id is null then raise exception 'credential not found' using errcode = 'P0002'; end if;
  if not (public.is_staff_of(v_c.agency_id)
          and public.agency_can('partners.credentials.manage')
          and public.can_see_partner(v_c.group_id)) then
    raise exception 'You may not change this partner''s credentials' using errcode = '42501';
  end if;
  update public.partner_credentials
     set archived_at = now(), archived_reason = p_reason where id = p_id;
  insert into public.partner_credential_events (credential_id, agency_id, actor_id, action, note)
  values (p_id, v_c.agency_id, auth.uid(), 'archived', trim(p_reason));
end $function$;
revoke execute on function public.partner_credential_archive(uuid, text) from public, anon;
grant execute on function public.partner_credential_archive(uuid, text) to authenticated;

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
