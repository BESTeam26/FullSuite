-- The EOD report reaches the Team Lead, and support@ keeps the record.
--
-- Dee, 2026-09-16: *"On successful employee submission, automatically email the
-- employee's Team Lead. CC support@blessedempireservices.com. Do not hardcode
-- the Team Lead's email. Resolve it from the canonical employee/team
-- relationship."* And: *"Email failure must NOT undo a valid EOD submission."*
--
-- ── WHY AN OUTBOX AND NOT A SEND ───────────────────────────────────────────
--
-- The second requirement decides the design. If submitting tried to send, then
-- a provider outage, a rate limit or a bad key would roll the submission back
-- and somebody's day of work would vanish because an email did not go. So
-- submitting QUEUES, in the same transaction, and a sweep sends. The report is
-- safe the moment it is saved, and the email is a separate fact with its own
-- status — which is also why the screen can say "EOD submitted · Email delivery
-- failed" rather than having to choose one of the two.
--
-- This mirrors `billing_email_outbox` deliberately: same shape, same dispatch
-- pattern, same cron-plus-Edge-Function path. It is a separate table rather
-- than a column on that one because the billing outbox is keyed to invoices and
-- reminders, and widening it to mean "any email at all" would make its name a
-- lie and its foreign keys optional.
--
-- ── DUPLICATES ────────────────────────────────────────────────────────────
--
-- Dee: "Prevent duplicate emails from retries/replays." A partial unique index
-- on (eod_id, kind) does it at the only layer that cannot be raced: re-submit
-- ten times and there is still one row per report per kind. The sweep can
-- therefore be retried freely.

create table if not exists public.eod_email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  eod_id              uuid not null references public.eod_submissions (id) on delete cascade,
  kind                text not null default 'submitted',
  /* Resolved from the canonical relationship at queue time and STORED, so the
     record says who it actually went to rather than who would be resolved
     today. Never hardcoded, never derived from a name. */
  to_email            text,
  to_name             text,
  cc_email            text,
  subject             text not null,
  payload             jsonb not null default '{}'::jsonb,
  state               text not null default 'pending',
  attempts            integer not null default 0,
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint eod_email_outbox_state_check
    check (state in ('pending', 'sent', 'failed', 'unavailable'))
);

comment on table public.eod_email_outbox is
  'One queued EOD email per report. Queued inside the submitting transaction so a provider outage can never roll back somebody''s day of work; sent by the eod-email sweep.';
comment on column public.eod_email_outbox.state is
  'pending → sent, or failed (retryable), or unavailable when there is nobody to send to. "unavailable" is not an error: a report with no Team Lead has nowhere to go and says so.';

/* One email per report per kind, whatever happens upstream. */
create unique index if not exists eod_email_outbox_once
  on public.eod_email_outbox (eod_id, kind);

create index if not exists eod_email_outbox_pending
  on public.eod_email_outbox (state, attempts) where state in ('pending', 'failed');

alter table public.eod_email_outbox enable row level security;

/* Visible to the person whose report it is, to the lead it went to, and to
   management. Nobody else needs to know who was emailed about whose day. */
create policy eod_email_outbox_select on public.eod_email_outbox
  for select using (
    exists (
      select 1 from public.eod_submissions e
       where e.id = eod_email_outbox.eod_id
         and public.is_agency_staff()
         and (e.employee_id = auth.uid()
              or e.routed_to = auth.uid()
              or public.agency_can('ops.manage'))
    )
  );

grant select on public.eod_email_outbox to authenticated;

-- ── Queue on submission ────────────────────────────────────────────────────

create or replace function public.eod_queue_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead   record;
  v_name   text;
  v_state  text := 'pending';
begin
  /* Only on the transition INTO submitted. A later edit is a revision, and
     revisions are recorded in eod_revisions rather than re-sent. */
  if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
    return new;
  end if;

  select coalesce(p.full_name, p.email, 'A team member') into v_name
    from public.profiles p where p.id = new.employee_id;

  select p.id, coalesce(p.full_name, p.email) as name, p.email into v_lead
    from public.profiles p where p.id = new.routed_to;

  /* No lead resolved: the row is still written, as 'unavailable'. A silent
     absence would leave nobody able to tell the difference between "nobody to
     send to" and "the sweep has not run yet". */
  if v_lead.email is null then v_state := 'unavailable'; end if;

  insert into public.eod_email_outbox (
    agency_id, eod_id, kind, to_email, to_name, cc_email, subject, payload, state)
  values (
    new.agency_id, new.id, 'submitted',
    v_lead.email, v_lead.name,
    'support@blessedempireservices.com',
    /* Dee's exact format: {{Agent Name}} - EOD Report - {{Month Day, Year}} */
    v_name || ' - EOD Report - ' || to_char(new.work_date, 'FMMonth FMDD, YYYY'),
    jsonb_build_object(
      'employee_name', v_name,
      'work_date', new.work_date,
      'routing_reason', new.routing_reason,
      'snapshot', coalesce(new.snapshot, '{}'::jsonb),
      'accomplishments', new.unfinished_work,
      'blockers', new.blockers,
      'help_needed', new.escalations,
      'handoff', new.next_workday_priority,
      'notes', new.additional_notes),
    v_state)
  on conflict (eod_id, kind) do nothing;

  return new;
end $$;

drop trigger if exists eod_submissions_queue_email on public.eod_submissions;
create trigger eod_submissions_queue_email
  after insert or update on public.eod_submissions
  for each row execute function public.eod_queue_email();

-- ── The sweep, mirroring billing_email_dispatch ───────────────────────────

create or replace function public.eod_email_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_url text; v_secret text;
begin
  if not exists (
    select 1 from public.eod_email_outbox
     where state in ('pending', 'failed') and attempts < 5 and to_email is not null
  ) then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'eod_email_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'eod_email_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $$;

comment on function public.eod_email_dispatch() is
  'Nudges the eod-email function when there is something to send. Silent when the Vault has no endpoint configured — an unconfigured sweep must not error every five minutes.';
