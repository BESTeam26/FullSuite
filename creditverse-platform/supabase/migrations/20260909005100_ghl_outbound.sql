-- =============================================================================
-- BES → GoHighLevel: a client's status change reaches the partner's GHL.
--
-- Dee, 2026-09-09: "I want seamless trigger from my status to clients GHL
-- Pipeline and Workflow." Until now the bridge only listened (GHL → BES). This
-- is the other direction, built so it needs NO pipeline-stage mapping from
-- Dee: BES applies a TAG to the contact — `bes-status-<slug>` — and her GHL
-- workflows trigger on "tag added", moving pipeline stages the way she already
-- builds automations. The tag IS the integration contract:
--
--   status "Ready for Round 1"  →  tag bes-status-ready-for-round-1
--   status "LETTERS MAILED"      →  tag bes-status-letters-mailed
--
-- One status tag at a time: the previous bes-status-* tag is removed when the
-- new one lands, so a contact never carries two truths.
--
-- ── SHAPE ──────────────────────────────────────────────────────────────────
--
--   fulfillment_clients.status changes
--     → trigger enqueues ghl_outbound_events (only when the client's partner
--       is mapped to a connected GHL location — otherwise nothing to send)
--       → cron (every minute) asks the ghl-push function to work the queue
--         → the function finds the contact by EMAIL in that location, swaps
--           the tag, and records the outcome on the row
--
-- The queue is the audit: every attempt, every refusal, in one table the
-- Integrations panel reads. Nothing is fire-and-forget.
--
-- ── SECRETS ────────────────────────────────────────────────────────────────
--
-- The cron job authenticates to the function with a shared secret read from
-- Supabase Vault (`ghl_push_secret`), and finds the function at
-- `ghl_push_url` — also in Vault, so this migration carries no environment.
-- Both are written once, out of band, never in a migration. If either is
-- missing the dispatcher does nothing and says so in the panel: an unset
-- secret is a stopped bridge, not an open one.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

create table public.ghl_outbound_events (
  id               bigint generated always as identity primary key,
  agency_id        uuid not null references public.agencies(id),
  location_id      text not null,
  outsourcing_group_id uuid references public.outsourcing_groups(id) on delete set null,
  client_id        uuid references public.fulfillment_clients(id) on delete set null,
  contact_email    citext not null,
  contact_name     text,
  event_kind       text not null default 'client_status_changed',
  status_label     text not null,
  tag              text not null,
  state            text not null default 'pending'
                   check (state in ('pending', 'sent', 'failed', 'skipped')),
  attempts         integer not null default 0,
  last_error       text,
  ghl_contact_id   text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);

comment on table public.ghl_outbound_events is
  'Every status change BES tried to push to a partner''s GHL contact as a bes-status-* tag, with its outcome. Pending rows are worked by the ghl-push function on a one-minute cron.';

create index ghl_outbound_pending on public.ghl_outbound_events (state, created_at) where state = 'pending';
create index ghl_outbound_client on public.ghl_outbound_events (client_id, created_at desc);

alter table public.ghl_outbound_events enable row level security;

/* Staff read the outcomes (the panel); nobody writes through the API — the
   trigger enqueues and the function (service role) records outcomes. */
create policy ghl_outbound_select on public.ghl_outbound_events
  for select to authenticated using (public.is_agency_staff());

revoke all on public.ghl_outbound_events from public, anon;
grant select on public.ghl_outbound_events to authenticated;

/** "Ready for Round 1" → "ready-for-round-1": a tag GHL accepts and a human reads. */
create or replace function public.ghl_status_tag(p_status text)
returns text
language sql immutable as $function$
  select 'bes-status-' || trim(both '-' from regexp_replace(lower(coalesce(p_status, '')), '[^a-z0-9]+', '-', 'g'))
$function$;

-- ── Enqueue on status change ──────────────────────────────────────────────
create or replace function public.ghl_enqueue_client_status()
returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  v_location text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.outsourcing_group_id is null or new.email is null or new.is_fixture then
    return new;
  end if;

  /* Only a partner with a connected, mapped location has anywhere to send. */
  select c.location_id into v_location
    from public.ghl_connections c
   where c.outsourcing_group_id = new.outsourcing_group_id
     and c.status = 'connected'
   order by c.created_at
   limit 1;
  if v_location is null then
    return new;
  end if;

  insert into public.ghl_outbound_events
        (agency_id, location_id, outsourcing_group_id, client_id, contact_email, contact_name,
         status_label, tag)
  values (new.agency_id, v_location, new.outsourcing_group_id, new.id, new.email, new.name,
          new.status::text, public.ghl_status_tag(new.status::text));
  return new;
end $function$;

revoke execute on function public.ghl_enqueue_client_status() from public, anon, authenticated;

drop trigger if exists fulfillment_clients_ghl_outbound on public.fulfillment_clients;
create trigger fulfillment_clients_ghl_outbound
  after insert or update of status on public.fulfillment_clients
  for each row execute function public.ghl_enqueue_client_status();

-- ── Dispatch: cron asks the function to work the queue ────────────────────
create or replace function public.ghl_outbound_dispatch()
returns void
language plpgsql security definer set search_path = public, extensions, vault as $function$
declare
  v_secret text;
  v_url    text;
begin
  if not exists (select 1 from public.ghl_outbound_events where state = 'pending') then
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ghl_push_secret';
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'ghl_push_url';
  if v_secret is null or v_url is null then
    /* Stopped, not open. The panel reads the pending count and says why. */
    return;
  end if;
  perform extensions.net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end $function$;

revoke execute on function public.ghl_outbound_dispatch() from public, anon, authenticated;

select cron.schedule('ghl-outbound-dispatch', '* * * * *', $$select public.ghl_outbound_dispatch()$$);
