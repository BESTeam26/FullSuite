-- =============================================================================
-- A client's protected identity and access data, and where a migration's
-- provenance lives.
--
-- Dee, 2026-09-11, on the ClickUp pilot: full SSN, Vault-encrypted, revealed
-- only with a capability. "Do not reduce SSN to permanent last-four-only
-- storage if the actual authorized fulfillment workflow requires the complete
-- value."
--
-- ── WHY THIS MIRRORS partner_credentials INSTEAD OF INVENTING ──────────────
--
-- That model already does the hard parts and has been in production since
-- 0225: the value lives in Supabase Vault and never in a table column, the
-- table holds only a `secret_id`, reading it goes through one DEFINER function
-- that checks a capability and writes an audit row BEFORE the value leaves,
-- and the notes field refuses anything that looks like a secret. Building a
-- second one would mean two things to keep right.
--
-- The difference is the owner. A partner credential belongs to a partner; an
-- SSN and a client's MyFreeScoreNow login belong to a CLIENT. So this is the
-- same shape with `client_id` where `group_id` was, and one extra idea — the
-- SSN is a secret with no username, which is why `kind` exists.
--
-- ── WHY THERE IS NO SSN COLUMN, ANYWHERE ───────────────────────────────────
--
-- Not even encrypted-in-a-column. A column can be SELECTed by anything that
-- can read the row, and every mistake after that is a leak: a `select *`, a
-- log line, an error message, a CSV export nobody thought about. The value is
-- reachable only by calling a function that has already decided you may have
-- it and has already recorded that you did.
--
-- ── WHY THE PROVENANCE MAP IS NOT A SHADOW TABLE ───────────────────────────
--
-- Dee ruled out a generic `clickup_clients` table, and rightly — a second copy
-- of a client is a second truth. `import_links` is not that. It stores no
-- client data at all: it is a crosswalk from a ClickUp object id to whatever
-- canonical row it became, and it exists so a second import run updates rather
-- than duplicates. Delete every row in it and no BES data is lost — only the
-- ability to re-run safely.
-- =============================================================================

-- ── The capability ──────────────────────────────────────────────────────────
insert into public.permission_keys (key, label, module)
values ('creditops.clients.sensitive', 'Reveal client SSN and logins', 'CreditOps')
on conflict (key) do update set label = excluded.label;

-- ── The store ───────────────────────────────────────────────────────────────
create table public.client_secrets (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  /** The canonical person, not the CreditOps work record: an SSN belongs to
      the human being, and follows them across services. */
  client_id   uuid not null references public.clients(id) on delete cascade,
  /** `ssn` has no username. `monitoring` is MyFreeScoreNow and its kin.
      `cfpb` is the complaint portal login BES creates on the client's behalf. */
  kind        text not null check (kind in ('ssn', 'monitoring', 'cfpb', 'other')),
  label       text,
  /** Provider or portal, for the kinds that have one. */
  provider    text,
  username    text,
  url         text,
  /** Stored in the clear, so it must never hold the secret — enforced below. */
  notes       text,
  /** The whole point: the value lives in Vault, this is only its id. */
  secret_id   uuid,
  last_rotated_at timestamptz,
  archived_at timestamptz,
  archived_reason text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.client_secrets is
  'A client''s protected identity and access data. The values are in Supabase Vault; this table holds only their ids. Reading one goes through client_secret_reveal(), which checks creditops.clients.sensitive and audits before the value leaves (Dee, 2026-09-11).';

/* One live SSN per person. Everything else may repeat — a client can hold two
   monitoring logins while one is being replaced. */
create unique index client_secrets_one_live_ssn
  on public.client_secrets (client_id) where kind = 'ssn' and archived_at is null;
create index client_secrets_client_idx on public.client_secrets (client_id) where archived_at is null;

create table public.client_secret_events (
  id            bigint generated always as identity primary key,
  secret_row_id uuid not null references public.client_secrets(id) on delete cascade,
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null check (action in ('created', 'updated', 'revealed', 'archived')),
  created_at    timestamptz not null default now()
);
comment on table public.client_secret_events is
  'Who looked at what, and when. Append-only: a reveal is recorded before the value is returned, so a read cannot happen without a trace.';
create index client_secret_events_row_idx on public.client_secret_events (secret_row_id, created_at desc);

-- ── Row-level security: the metadata is readable, the secret is not here ────
alter table public.client_secrets enable row level security;
alter table public.client_secret_events enable row level security;

/* Seeing that a client HAS an SSN on file needs only the client. Seeing the
   value is `client_secret_reveal`, and nothing else can reach it — `secret_id`
   is a Vault id and Vault is not readable by `authenticated` at all. */
create policy client_secrets_select on public.client_secrets
  for select using (
    public.is_staff_of(agency_id)
    and public.agency_can('creditops.clients.view')
    /* Narrowed to the partners this person may see, through the CreditOps
       record. `can_view_work` takes a work scope, not a client, so it is the
       wrong helper here — `can_see_partner` is the one that answers "may you
       see this account". */
    and exists (select 1 from public.fulfillment_clients fc
                 where fc.client_id = client_secrets.client_id
                   and (fc.outsourcing_group_id is null
                        or public.can_see_partner(fc.outsourcing_group_id)))
  );

create policy client_secret_events_select on public.client_secret_events
  for select using (public.is_staff_of(agency_id) and public.agency_can('creditops.clients.sensitive'));

/* No INSERT/UPDATE/DELETE policies: writing goes through the functions below,
   so there is one place that checks the capability and one place that audits. */
grant select on public.client_secrets to authenticated;
grant select on public.client_secret_events to authenticated;

-- ── Reading a value ─────────────────────────────────────────────────────────
create or replace function public.client_secret_reveal(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $function$
declare v_row public.client_secrets; v_secret text;
begin
  select * into v_row from public.client_secrets where id = p_id and archived_at is null;
  if v_row.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not (public.is_staff_of(v_row.agency_id) and public.agency_can('creditops.clients.sensitive')) then
    raise exception 'Revealing client identity and logins requires permission' using errcode = '42501';
  end if;
  if v_row.secret_id is null then raise exception 'Nothing stored here' using errcode = 'P0002'; end if;

  /* Audited BEFORE the value leaves, so a read cannot happen untraced. */
  insert into public.client_secret_events (secret_row_id, agency_id, actor_id, action)
  values (p_id, v_row.agency_id, auth.uid(), 'revealed');

  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_row.secret_id;
  return v_secret;
end $function$;
revoke execute on function public.client_secret_reveal(uuid) from public, anon;
grant execute on function public.client_secret_reveal(uuid) to authenticated;

-- ── Writing one ─────────────────────────────────────────────────────────────
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
  if not (public.is_staff_of(v_agency) and public.agency_can('creditops.clients.sensitive')) then
    raise exception 'Storing client identity and logins requires permission' using errcode = '42501';
  end if;
  /* The same guard the partner vault has: notes are stored in the clear. */
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
    /* A new Vault secret each time rather than an update in place: the old one
       is left behind deliberately, so a mistyped rotation is recoverable. */
    v_name := 'client_secret:' || v_id::text || ':' || extract(epoch from now())::bigint::text;
    select vault.create_secret(p_secret, v_name, 'BES client ' || p_kind) into v_secret_id;
    update public.client_secrets
       set secret_id = v_secret_id, last_rotated_at = now(), updated_at = now()
     where id = v_id;
  end if;

  return v_id;
end $function$;
revoke execute on function public.client_secret_write(uuid, text, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.client_secret_write(uuid, text, text, text, text, text, text, text, uuid) to authenticated;

create or replace function public.client_secret_archive(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid;
begin
  select agency_id into v_agency from public.client_secrets where id = p_id and archived_at is null;
  if v_agency is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not (public.is_staff_of(v_agency) and public.agency_can('creditops.clients.sensitive')) then
    raise exception 'Archiving client identity and logins requires permission' using errcode = '42501';
  end if;
  update public.client_secrets set archived_at = now(), archived_reason = p_reason, updated_by = auth.uid()
   where id = p_id;
  insert into public.client_secret_events (secret_row_id, agency_id, actor_id, action)
  values (p_id, v_agency, auth.uid(), 'archived');
end $function$;
revoke execute on function public.client_secret_archive(uuid, text) from public, anon;
grant execute on function public.client_secret_archive(uuid, text) to authenticated;

-- ── The operational fields ClickUp carries and BES had nowhere to put ───────
alter table public.fulfillment_clients
  add column if not exists legacy_client_id text,
  add column if not exists program_started_on date,
  add column if not exists breach_equifax boolean,
  add column if not exists breach_npd boolean,
  add column if not exists source_status text,
  /* A work condition, not a round and not a lifecycle status (Dee,
     2026-09-11): "it must not pretend the client is on a numbered dispute
     round". A frozen file is worked differently; it is not further along. */
  add column if not exists security_freeze_only boolean not null default false;

comment on column public.fulfillment_clients.security_freeze_only is
  'This file is a security-freeze engagement rather than a numbered dispute programme. A work condition the processing workflow reads — never a round, never a status.';

comment on column public.fulfillment_clients.source_status is
  'The workflow state the record carried in the system it came from, kept verbatim. A mapping we get wrong is then correctable without going back to the source.';
comment on column public.fulfillment_clients.legacy_client_id is
  'The client id in the previous system. Not a BES id — public_id is ours.';

-- ── Provenance: the crosswalk, not a shadow copy ────────────────────────────
create table public.import_links (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  source_system text not null,
  /** workspace | space | folder | list | task | comment | attachment */
  source_kind   text not null,
  source_id     text not null,
  /** What it became. Free text rather than a foreign key because the target
      table differs per kind, and a crosswalk that can only point at one table
      is a crosswalk that gets copied. */
  entity_type   text not null,
  entity_id     text not null,
  import_batch_id uuid,
  imported_at   timestamptz not null default now(),
  imported_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint import_links_source_unique unique (agency_id, source_system, source_kind, source_id)
);

comment on table public.import_links is
  'A crosswalk from a foreign object id to the canonical BES row it became. Holds no BES data: delete every row and nothing is lost except the ability to re-run an import without duplicating. This is deliberately NOT a shadow copy of the imported records (Dee ruled that out).';

create index import_links_entity_idx on public.import_links (entity_type, entity_id);

alter table public.import_links enable row level security;
create policy import_links_select on public.import_links
  for select using (public.is_staff_of(agency_id) and public.agency_can('creditops.clients.view'));
grant select on public.import_links to authenticated;

/* The partner ↔ source list link Dee asked for, so no run ever matches a
   partner by name. */
alter table public.outsourcing_groups
  add column if not exists source_list_ref text;
comment on column public.outsourcing_groups.source_list_ref is
  'The client list this partner''s records come from in the source system, e.g. a ClickUp list id. Stored so future imports match by id and never by name (Dee, 2026-09-11).';

-- ── Address history ─────────────────────────────────────────────────────────
/**
 * Dee, 2026-09-11, on Bryan Rodriguez having two addresses in ClickUp: "Do not
 * discard either one... If FullSuite does not yet have proper address-history
 * storage, add the smallest canonical structure needed rather than overwriting
 * one address."
 *
 * `clients` keeps the CURRENT address, because that is what every screen and
 * every letter reads and a join for the common case would be the wrong trade.
 * This table is what came before it and where each one came from — so an
 * address that disagrees is a question somebody can answer later rather than
 * a value that quietly lost.
 */
create table public.client_address_history (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  postal_code   text,
  /** Where BES learned it: `clickup_description`, `clickup_comment`, `staff`. */
  source        text not null,
  /** The id of the thing it came from, so it can be traced back. */
  source_ref    text,
  /** The moment it was TRUE in the source, not the moment it was imported. */
  recorded_at   timestamptz not null default now(),
  /** Two addresses that disagree is not an error to resolve by guessing. */
  needs_review  boolean not null default false,
  note          text,
  created_at    timestamptz not null default now()
);

comment on table public.client_address_history is
  'Every address BES has held for a client, with where it came from and when it was true. The current one lives on `clients`; this is the record that stops an older or conflicting address being silently overwritten (Dee, 2026-09-11).';

create index client_address_history_client_idx
  on public.client_address_history (client_id, recorded_at desc);

alter table public.client_address_history enable row level security;
create policy client_address_history_select on public.client_address_history
  for select using (
    public.is_staff_of(agency_id) and public.agency_can('creditops.clients.view')
    and exists (select 1 from public.fulfillment_clients fc
                 where fc.client_id = client_address_history.client_id
                   and (fc.outsourcing_group_id is null
                        or public.can_see_partner(fc.outsourcing_group_id)))
  );
grant select on public.client_address_history to authenticated;
