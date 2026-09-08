-- 0202 — Meetings: one canonical reference, two providers, no video engine.
--
-- ---------------------------------------------------------------------------
-- WHAT BES IS AND IS NOT BUILDING
--
-- §69: "BES should NOT build WebRTC, video streaming, screen sharing engine,
-- recording engine inside this phase. Google Meet and Zoom already do that.
-- BES creates/manages the meeting link and keeps operational context in
-- Communication."
--
-- §68: "Do not paste a bare Meet/Zoom URL as the only record. Create a
-- canonical meeting reference so BES can later know which channel, provider,
-- who created it, meeting time, join link, external ID, calendar event."
--
-- So: one `meetings` row per meeting, one message card pointing at it, and the
-- provider does the video.
--
-- ---------------------------------------------------------------------------
-- THE COLUMN THAT IS DELIBERATELY ABSENT
--
-- §61: "Zoom's start_url gives host-level ability and is sensitive. Do NOT
-- post it into the channel. Do NOT expose it to participants. Do NOT store it
-- in ordinary browser-readable data."
--
-- There is no `start_url` column on this table, and there will not be one. A
-- column that must never be read by the browser does not belong in a table the
-- browser reads — the way to keep a secret out of a page is not to remember
-- to filter it, it is for the row not to contain it.
--
-- Tokens follow the same reasoning and live in `agency_meeting_credentials`,
-- which grants nothing to `authenticated` at all. The browser learns whether a
-- provider is CONNECTED and never anything else about how.
--
-- ---------------------------------------------------------------------------
-- STATUS TODAY
--
-- No Google or Zoom credentials exist for BES yet (stack doctrine, rule 19:
-- "Where a key is missing the feature says it is not connected — it does not
-- fall back to a stub, a sample, or a second provider"). Both providers
-- therefore read NOT CONNECTED, and the Meeting control says so instead of
-- failing (§66). The schema, the authorization and the card are complete and
-- waiting on OAuth.
-- ---------------------------------------------------------------------------

create type public.meeting_provider as enum ('google_meet', 'zoom');

create table public.agency_meeting_providers (
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  provider     public.meeting_provider not null,
  connected    boolean not null default false,
  account_label text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (agency_id, provider)
);

comment on table public.agency_meeting_providers is
  'Whether a provider is connected, and nothing about how. Readable by staff so the Meeting control can say "not connected" rather than fail (Dee, §66).';

/* Tokens. No grant to `authenticated` — not select, not anything. Only the
   service role, from an Edge Function, ever reads this. */
create table public.agency_meeting_credentials (
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  provider      public.meeting_provider not null,
  refresh_token text,
  access_token  text,
  expires_at    timestamptz,
  scope         text,
  updated_at    timestamptz not null default now(),
  primary key (agency_id, provider)
);

comment on table public.agency_meeting_credentials is
  'OAuth tokens. `authenticated` holds NO privilege on this table — not select. Dee: "Never expose refresh tokens to browser JavaScript." A token the browser cannot request is a token the browser cannot leak.';

create table public.meetings (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  /** Where it was arranged. A meeting belongs to the conversation about it. */
  channel_id          uuid references public.channels(id) on delete set null,
  provider            public.meeting_provider not null,
  /** The provider's own id, for reconciliation. */
  external_meeting_id text,
  /** The calendar event, when the provider made one (Google, §59). */
  external_event_id   text,
  topic               text not null check (length(trim(topic)) between 1 and 200),
  start_at            timestamptz,
  duration_minutes    integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  /** What PARTICIPANTS get. Never a host start url — see the header. */
  join_url            text,
  status              text not null default 'scheduled'
    check (status in ('scheduled', 'started', 'ended', 'cancelled')),
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index meetings_channel_idx on public.meetings (channel_id) where channel_id is not null;
create unique index meetings_external_idx on public.meetings (provider, external_meeting_id)
  where external_meeting_id is not null;
create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

comment on table public.meetings is
  'One meeting identity: the provider''s meeting, its calendar event, the channel it was arranged in, and the join link participants use. The channel card renders from this row rather than from a pasted URL (Dee, §68).';
comment on column public.meetings.join_url is
  'The PARTICIPANT link. Zoom''s host start_url is deliberately not stored anywhere in this schema (Dee, §61).';

alter table public.messages
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null;

-- ── Authorization ───────────────────────────────────────────────────────
alter table public.agency_meeting_providers enable row level security;
alter table public.agency_meeting_credentials enable row level security;
alter table public.meetings enable row level security;
revoke all on public.agency_meeting_providers, public.agency_meeting_credentials, public.meetings
  from public, anon;
grant select on public.agency_meeting_providers to authenticated;
grant insert, update on public.agency_meeting_providers to authenticated;
grant select, insert, update on public.meetings to authenticated;
-- No grant at all on agency_meeting_credentials. Deliberate.

create policy agency_meeting_providers_select on public.agency_meeting_providers
  for select to authenticated using (public.is_staff_of(agency_id));
create policy agency_meeting_providers_insert on public.agency_meeting_providers
  for insert to authenticated with check (public.is_admin_of(agency_id));
create policy agency_meeting_providers_update on public.agency_meeting_providers
  for update to authenticated
  using (public.is_admin_of(agency_id)) with check (public.is_admin_of(agency_id));

/* A meeting is visible exactly when the conversation it was arranged in is.
   One arranged outside a channel is visible to the agency's staff. */
create policy meetings_select on public.meetings for select to authenticated
  using (case when channel_id is null then public.is_staff_of(agency_id)
              else public.channel_visible(channel_id) end);
create policy meetings_insert on public.meetings for insert to authenticated
  with check (created_by = auth.uid()
              and public.is_staff_of(agency_id)
              and (channel_id is null or public.channel_writable(channel_id)));
create policy meetings_update on public.meetings for update to authenticated
  using (created_by = auth.uid() or public.is_admin_of(agency_id))
  with check (created_by = auth.uid() or public.is_admin_of(agency_id));

/* §88 — connecting or disconnecting a provider is an administrative event. */
create or replace function public.audit_meeting_provider()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  perform public.log_audit(
    case when new.connected then 'Meeting provider connected' else 'Meeting provider disconnected' end,
    'agency', new.agency_id::text, null,
    case when tg_op = 'UPDATE' then jsonb_build_object('provider', old.provider, 'connected', old.connected) end,
    jsonb_build_object('provider', new.provider, 'connected', new.connected));
  return new;
end;
$function$;
drop trigger if exists agency_meeting_providers_audit on public.agency_meeting_providers;
create trigger agency_meeting_providers_audit
  after insert or update on public.agency_meeting_providers
  for each row execute function public.audit_meeting_provider();

/* Both providers exist, both not connected, for every agency. The interface
   reads a row rather than the absence of one, so "not connected" is a fact
   somebody set rather than a gap somebody has to interpret. */
insert into public.agency_meeting_providers (agency_id, provider, connected)
select a.id, p.provider, false
  from public.agencies a
  cross join (values ('google_meet'::public.meeting_provider), ('zoom'::public.meeting_provider)) as p(provider)
on conflict do nothing;
