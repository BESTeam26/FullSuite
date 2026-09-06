-- 0084 — GoHighLevel bridge: connection, credentials, and an event log
--
-- Dee's goal has GHL as the sales front end: a won opportunity there should
-- become work here. This migration builds the part that can be built and
-- verified *before* any credentials exist — a connection per GHL location, a
-- place for its secrets that the browser can never read, and an append-only
-- log of everything GHL sends us.
--
-- **Deliberately not built yet: turning an event into a client or a funding
-- file.** The client record is about to move to the organization level
-- (ARCHITECTURE_PROPOSAL_CLIENT_RECORD.md); creating clients from GHL first
-- would mean writing that mapping twice. Events are captured from day one, so
-- nothing is lost in the meantime and the backlog can be replayed.

create type public.ghl_connection_status as enum ('connected', 'paused', 'error');

-- ---------------------------------------------------------------------------
-- 1. Which GHL location belongs to which organization
-- ---------------------------------------------------------------------------
create table public.ghl_connections (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  location_id      text not null unique,
  label            text,
  status           public.ghl_connection_status not null default 'connected',
  last_event_at    timestamptz,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index ghl_connections_org_idx on public.ghl_connections (organization_id);
create trigger ghl_connections_updated_at before update on public.ghl_connections
  for each row execute function public.set_updated_at();

alter table public.ghl_connections enable row level security;

-- A connection is BES's commercial plumbing for a customer: BES staff manage
-- it, the organization's admins can see that it exists and whether it is
-- healthy. Neither can read the secrets, which are not in this table.
create policy ghl_connections_select on public.ghl_connections for select to authenticated
  using (public.is_agency_staff() or public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 2. The secrets. No grants to anyone: only the Edge Function, which runs as
--    the service role, ever touches this table. RLS is on with no policy, so
--    even a mistaken grant later would still deny every ordinary caller.
-- ---------------------------------------------------------------------------
create table public.ghl_credentials (
  location_id     text primary key references public.ghl_connections(location_id) on delete cascade,
  access_token    text not null,
  webhook_secret  text,
  rotated_at      timestamptz not null default now()
);
alter table public.ghl_credentials enable row level security;
revoke all on public.ghl_credentials from anon, authenticated;

comment on table public.ghl_credentials is
  'GHL tokens. Never selected by a browser: no grants, RLS on with no policy, Edge Function (service role) only.';

-- ---------------------------------------------------------------------------
-- 3. Everything GHL sends, exactly once
-- ---------------------------------------------------------------------------
create table public.ghl_events (
  id               bigint generated always as identity primary key,
  location_id      text not null,
  organization_id  uuid references public.organizations(id) on delete set null,
  event_type       text not null,
  external_id      text,
  payload          jsonb not null,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  outcome          text,
  -- Idempotency: GHL retries, and a retry must not become a second client.
  unique (location_id, event_type, external_id)
);
create index ghl_events_unprocessed_idx on public.ghl_events (received_at desc) where processed_at is null;
create index ghl_events_org_idx on public.ghl_events (organization_id, received_at desc);

alter table public.ghl_events enable row level security;

-- Readable by the people who could act on a problem; the payload can carry a
-- lead's contact details, so an organization sees only its own.
create policy ghl_events_select on public.ghl_events for select to authenticated
  using (public.is_agency_staff() or (organization_id is not null and public.is_org_admin(organization_id)));

-- ---------------------------------------------------------------------------
-- 4. Registering a connection. The token arrives once, goes straight into the
--    credentials table, and is never returned.
-- ---------------------------------------------------------------------------
create or replace function public.connect_ghl_location(
  p_org uuid, p_location_id text, p_label text, p_token text, p_webhook_secret text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- BES sets up integrations; an organization admin cannot point a location at
  -- their own tenant unilaterally (rule 16: BES owns platform plumbing).
  if not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(trim(p_location_id), '') = '' or coalesce(trim(p_token), '') = '' then
    raise exception 'a location id and a token are required' using errcode = '22023';
  end if;
  insert into public.ghl_connections (organization_id, location_id, label, created_by)
  values (p_org, trim(p_location_id), nullif(p_label, ''), auth.uid())
  on conflict (location_id) do update set organization_id = excluded.organization_id, label = excluded.label, status = 'connected'
  returning id into v_id;
  insert into public.ghl_credentials (location_id, access_token, webhook_secret)
  values (trim(p_location_id), p_token, nullif(p_webhook_secret, ''))
  on conflict (location_id) do update set access_token = excluded.access_token, webhook_secret = excluded.webhook_secret, rotated_at = now();
  -- The audit records that a connection changed, never the token itself.
  perform public.log_audit('ghl.connected', 'ghl_connection', v_id::text, p_org, null,
                           jsonb_build_object('location_id', trim(p_location_id), 'label', p_label));
  return v_id;
end $$;
revoke all on function public.connect_ghl_location(uuid, text, text, text, text) from public, anon;
grant execute on function public.connect_ghl_location(uuid, text, text, text, text) to authenticated;

create or replace function public.disconnect_ghl_location(p_location_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.ghl_connections;
begin
  if not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into v_row from public.ghl_connections where location_id = p_location_id;
  if v_row.id is null then
    raise exception 'connection not found' using errcode = 'P0002';
  end if;
  delete from public.ghl_credentials where location_id = p_location_id;
  update public.ghl_connections set status = 'paused' where location_id = p_location_id;
  perform public.log_audit('ghl.disconnected', 'ghl_connection', v_row.id::text, v_row.organization_id, to_jsonb(v_row), null);
end $$;
revoke all on function public.disconnect_ghl_location(text) from public, anon;
grant execute on function public.disconnect_ghl_location(text) to authenticated;

revoke all on public.ghl_connections, public.ghl_events from anon;
