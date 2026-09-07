-- 0115 — GoHighLevel at the AGENCY level, not one sub-account at a time.
--
-- Dee, 2026-09-06: "I need the GHL My agency API key and not just sub account.
-- I want this app to work with my entire agency platform for GHL."
--
-- 0084 modelled GHL as a per-location integration: a token pasted for each
-- sub-account, and a connection row that had to name a BES organization before
-- it could exist at all. That is the wrong shape for an agency that runs many
-- sub-accounts. It means:
--
--   • a token to paste for every sub-account, forever;
--   • no way to SEE the agency's sub-accounts until each was typed in;
--   • and no way to hold a GHL location that has no BES organization behind
--     it yet — which most of them will not, at first.
--
-- This migration adds the agency credential and lets a connection exist
-- unmapped. It changes nothing about how a location behaves once it IS mapped,
-- and every existing row keeps its organization.
--
-- The secret doctrine from 0084 is kept exactly: tokens live in their own
-- table, RLS on with no policy and no grants, reachable only by the Edge
-- Function running as the service role. A browser cannot read a token here any
-- more than it could there.

-- ---------------------------------------------------------------------------
-- 1. The agency credential. One row per BES agency (there is one agency, and
--    `agency_id` as the primary key is what enforces that).
-- ---------------------------------------------------------------------------
create table public.ghl_agency_credentials (
  agency_id      uuid primary key references public.agencies(id) on delete cascade,
  -- GHL's own id for the agency. Every sub-account discovered under this
  -- credential carries it, so a location can never be silently re-parented.
  company_id     text not null,
  access_token   text not null,
  /**
   * Set only for the OAuth (Marketplace app) flow. A GHL Agency Private
   * Integration token does not expire and has no refresh token, so both
   * columns are nullable and `token_kind` says which world we are in rather
   * than the code guessing from whether a column is null.
   */
  refresh_token  text,
  token_kind     text not null default 'private_integration'
                 check (token_kind in ('private_integration', 'oauth')),
  expires_at     timestamptz,
  /**
   * One webhook secret for the whole agency. GHL posts every sub-account's
   * events to the same endpoint when the webhook is configured agency-wide,
   * so a per-location secret cannot be the only way to authenticate them.
   */
  webhook_secret text,
  rotated_at     timestamptz not null default now(),
  connected_by   uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger ghl_agency_credentials_updated_at before update on public.ghl_agency_credentials
  for each row execute function public.set_updated_at();

alter table public.ghl_agency_credentials enable row level security;
revoke all on public.ghl_agency_credentials from anon, authenticated;

comment on table public.ghl_agency_credentials is
  'The agency-wide GHL token. Never selected by a browser: no grants, RLS on with no policy, Edge Function (service role) only. Same doctrine as ghl_credentials.';

-- ---------------------------------------------------------------------------
-- 2. A connection may now exist BEFORE it belongs to an organization.
--
--    A sub-account discovered from the agency is a real thing worth recording
--    and worth seeing; forcing an organization onto it at discovery time would
--    mean either inventing a mapping or hiding the sub-account. Both are
--    worse than an honest "not mapped yet".
--
--    `is_org_admin(null)` is false — a NULL comparison matches no membership —
--    so an unmapped row is visible to BES staff and to nobody else. That was
--    checked, not assumed.
-- ---------------------------------------------------------------------------
alter table public.ghl_connections
  alter column organization_id drop not null;

alter table public.ghl_connections
  add column if not exists company_id    text,
  add column if not exists name          text,
  add column if not exists discovered_at timestamptz;

comment on column public.ghl_connections.organization_id is
  'NULL = a GHL sub-account we can see under the agency credential but which is not mapped to a BES organization yet. Events for it are recorded and left unattributed.';

create index if not exists ghl_connections_unmapped_idx
  on public.ghl_connections (company_id) where organization_id is null;

-- ---------------------------------------------------------------------------
-- 3. Connecting the agency. The token arrives once and is never returned.
-- ---------------------------------------------------------------------------
create or replace function public.connect_ghl_agency(
  p_company_id     text,
  p_token          text,
  p_token_kind     text default 'private_integration',
  p_webhook_secret text default null,
  p_refresh_token  text default null,
  p_expires_at     timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_agency uuid;
begin
  -- BES owns platform plumbing (rule 16). An organization admin cannot point
  -- the agency credential anywhere.
  if not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(trim(p_company_id), '') = '' or coalesce(trim(p_token), '') = '' then
    raise exception 'a company id and a token are required' using errcode = '22023';
  end if;
  if p_token_kind not in ('private_integration', 'oauth') then
    raise exception 'unknown token kind' using errcode = '22023';
  end if;

  select id into v_agency from public.agencies limit 1;
  if v_agency is null then
    raise exception 'no agency' using errcode = 'P0002';
  end if;

  insert into public.ghl_agency_credentials
    (agency_id, company_id, access_token, refresh_token, token_kind, expires_at, webhook_secret, connected_by)
  values
    (v_agency, trim(p_company_id), p_token, nullif(p_refresh_token, ''), p_token_kind, p_expires_at,
     nullif(p_webhook_secret, ''), auth.uid())
  on conflict (agency_id) do update set
    company_id     = excluded.company_id,
    access_token   = excluded.access_token,
    refresh_token  = excluded.refresh_token,
    token_kind     = excluded.token_kind,
    expires_at     = excluded.expires_at,
    webhook_secret = coalesce(excluded.webhook_secret, public.ghl_agency_credentials.webhook_secret),
    rotated_at     = now(),
    connected_by   = auth.uid();

  -- The audit records that the credential changed, never the token.
  perform public.log_audit('ghl.agency_connected', 'ghl_agency', v_agency::text, null, null,
                           jsonb_build_object('company_id', trim(p_company_id), 'token_kind', p_token_kind));
end $$;
revoke all on function public.connect_ghl_agency(text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.connect_ghl_agency(text, text, text, text, text, timestamptz) to authenticated;

create or replace function public.disconnect_ghl_agency()
returns void language plpgsql security definer set search_path = public as $$
declare v_agency uuid;
begin
  if not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select agency_id into v_agency from public.ghl_agency_credentials limit 1;
  if v_agency is null then return; end if;
  delete from public.ghl_agency_credentials where agency_id = v_agency;
  /* The discovered sub-accounts are NOT deleted. What GHL told us existed is a
     fact about the past, and the mappings people made are work (rule 11).
     Losing the credential means we can no longer sync — not that the history
     never happened. */
  perform public.log_audit('ghl.agency_disconnected', 'ghl_agency', v_agency::text, null, null, null);
end $$;
revoke all on function public.disconnect_ghl_agency() from public, anon;
grant execute on function public.disconnect_ghl_agency() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What the sync writes back.
--
--    SECURITY DEFINER and granted to `service_role` only: the Edge Function is
--    the sole caller. It is written as one function rather than letting the
--    function INSERT directly so that the upsert rule — never overwrite a
--    mapping somebody made — lives in exactly one place.
-- ---------------------------------------------------------------------------
create or replace function public.record_ghl_locations(p_company_id text, p_locations jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_locations) <> 'array' then
    raise exception 'locations must be an array' using errcode = '22023';
  end if;
  for v_row in select * from jsonb_array_elements(p_locations) loop
    if coalesce(trim(v_row->>'id'), '') = '' then continue; end if;
    insert into public.ghl_connections (location_id, company_id, name, label, discovered_at)
    values (trim(v_row->>'id'), trim(p_company_id), v_row->>'name', v_row->>'name', now())
    on conflict (location_id) do update set
      company_id    = excluded.company_id,
      name          = excluded.name,
      discovered_at = now();
      /* organization_id is deliberately absent from the update: a sync must
         never undo a mapping a person made. */
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.record_ghl_locations(text, jsonb) from public, anon, authenticated;
grant execute on function public.record_ghl_locations(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Mapping a discovered sub-account to a BES organization, and undoing it.
-- ---------------------------------------------------------------------------
create or replace function public.map_ghl_location(p_location_id text, p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.ghl_connections;
begin
  if not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into v_row from public.ghl_connections where location_id = p_location_id;
  if v_row.id is null then
    raise exception 'connection not found' using errcode = 'P0002';
  end if;
  if p_org is not null and not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  update public.ghl_connections
     set organization_id = p_org,
         status = case when p_org is null then status else 'connected' end
   where location_id = p_location_id;
  /* Events that arrived before the mapping existed are attributed now, so a
     sub-account connected late does not lose its backlog. */
  if p_org is not null then
    update public.ghl_events set organization_id = p_org
     where location_id = p_location_id and organization_id is null;
  end if;
  perform public.log_audit('ghl.location_mapped', 'ghl_connection', v_row.id::text, p_org,
                           to_jsonb(v_row), jsonb_build_object('organization_id', p_org));
end $$;
revoke all on function public.map_ghl_location(text, uuid) from public, anon;
grant execute on function public.map_ghl_location(text, uuid) to authenticated;
