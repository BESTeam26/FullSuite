-- 0116 — Letters actually posted, through Lob.
--
-- Everything up to the envelope already exists: the Letter Library, the
-- builder on the client's real items, attestation, the approval gate, and the
-- statutory clocks that start on mailing. What did not exist was the envelope.
-- `mark_letter_mailed()` recorded that somebody said a letter went out; this
-- records that one actually did, to a named address, with a provider id.
--
-- The shape is reserve-then-reconcile, the same as the AI gateway (0100), for
-- the same reason: the expensive irreversible act happens OUTSIDE the
-- database, and a row must exist before it rather than after, or a crash
-- between the two loses the fact that money was spent and paper was posted.
--
--   begin_letter_mailing()     the caller's own permission is checked, the
--                              addresses are frozen, a 'queued' row is written
--   → Lob                      the Edge Function posts the letter
--   complete_letter_mailing()  the provider id, cost and status come back, and
--                              only then is the letter marked mailed
--
-- If the middle step fails, the row stays 'failed' with the reason, and the
-- letter stays approved. Nothing is silently lost and nothing is silently
-- double-posted.

create type public.mailing_status as enum (
  'queued', 'submitted', 'in_transit', 'delivered', 'returned', 'failed', 'cancelled'
);

create table public.letter_mailings (
  id                     uuid primary key default gen_random_uuid(),
  letter_id              uuid not null references public.dispute_letters(id) on delete cascade,
  provider               text not null default 'lob',
  /** Lob's own id (ltr_…). Null until the provider has accepted it. */
  provider_id            text,
  status                 public.mailing_status not null default 'queued',

  /**
   * The addresses AS THEY WERE USED, not a reference to where they came from.
   *
   * The CRA address registry is editable and the client's address can change.
   * If this row pointed at those instead of copying them, correcting an
   * address next year would rewrite where a letter was posted last year —
   * which is the kind of quiet history change rule 4 exists to prevent.
   */
  to_name                text not null,
  to_line1               text not null,
  to_line2               text,
  to_city                text not null,
  to_state               text not null,
  to_zip                 text not null,
  from_name              text not null,
  from_line1             text not null,
  from_line2             text,
  from_city              text not null,
  from_state             text not null,
  from_zip               text not null,

  /** Live or test, recorded per mailing: a test key posts nothing. */
  provider_mode          text not null default 'unknown' check (provider_mode in ('live', 'test', 'unknown')),
  expected_delivery_date date,
  tracking_number        text,
  cost_cents             integer check (cost_cents is null or cost_cents >= 0),
  /** What the provider said when it refused. Never paraphrased. */
  error                  text,

  requested_by           uuid references public.profiles(id) on delete set null,
  requested_at           timestamptz not null default now(),
  submitted_at           timestamptz,
  last_event_at          timestamptz,
  updated_at             timestamptz not null default now()
);
create trigger letter_mailings_updated_at before update on public.letter_mailings
  for each row execute function public.set_updated_at();

create index letter_mailings_letter_idx on public.letter_mailings (letter_id, requested_at desc);
create unique index letter_mailings_provider_id_idx on public.letter_mailings (provider, provider_id)
  where provider_id is not null;
/**
 * One letter, one live posting. A retry after a failure is allowed — that is
 * the whole point of recording the failure — but two simultaneous presses of
 * Post cannot both queue.
 */
create unique index letter_mailings_one_in_flight on public.letter_mailings (letter_id)
  where status in ('queued', 'submitted', 'in_transit', 'delivered');

alter table public.letter_mailings enable row level security;

-- Visible to whoever may see the letter. `letter_visible` already answers that
-- for the client behind it, so there is no second visibility rule here.
create policy letter_mailings_select on public.letter_mailings for select to authenticated
  using (exists (select 1 from public.dispute_letters l where l.id = letter_id));

comment on table public.letter_mailings is
  'One attempt to post one letter. Addresses are copied, not referenced, so correcting an address later cannot rewrite where a letter was actually sent.';

-- ---------------------------------------------------------------------------
-- Step 1 — may this person post this letter, and to where?
--
-- SECURITY INVOKER: the first statement selects the letter, and under INVOKER
-- that select is filtered by the letter's own policy. A caller who cannot see
-- the letter gets no row and is refused. Written as DEFINER this would read
-- every organization's letters and decide for itself.
-- ---------------------------------------------------------------------------
create or replace function public.begin_letter_mailing(
  p_letter    uuid,
  p_to        jsonb,
  p_from      jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  l public.dispute_letters%rowtype;
  v_org uuid;
  v_id uuid;
  v_missing text;
begin
  select * into l from public.dispute_letters where id = p_letter;
  if l.id is null then raise exception 'Letter not visible' using errcode = '42501'; end if;
  if not public.credit_client_writable(l.client_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  select fc.organization_id into v_org from public.fulfillment_clients fc where fc.id = l.client_id;
  perform public.require_permission(v_org, 'creditops.letters.build');

  -- The approval gate is the compliance act; posting must not bypass it.
  if l.status not in ('approved', 'printed') then
    raise exception 'Only an approved letter can be posted' using errcode = '22023';
  end if;

  /* An incomplete address is refused HERE rather than by the provider, so the
     reason is ours and readable instead of a 422 from an API. */
  v_missing := coalesce(
    nullif(concat_ws(', ',
      case when coalesce(trim(p_to->>'name'),  '') = '' then 'recipient name' end,
      case when coalesce(trim(p_to->>'line1'), '') = '' then 'recipient street' end,
      case when coalesce(trim(p_to->>'city'),  '') = '' then 'recipient city' end,
      case when coalesce(trim(p_to->>'state'), '') = '' then 'recipient state' end,
      case when coalesce(trim(p_to->>'zip'),   '') = '' then 'recipient ZIP' end,
      case when coalesce(trim(p_from->>'name'),  '') = '' then 'sender name' end,
      case when coalesce(trim(p_from->>'line1'), '') = '' then 'sender street' end,
      case when coalesce(trim(p_from->>'city'),  '') = '' then 'sender city' end,
      case when coalesce(trim(p_from->>'state'), '') = '' then 'sender state' end,
      case when coalesce(trim(p_from->>'zip'),   '') = '' then 'sender ZIP' end
    ), ''), null);
  if v_missing is not null then
    raise exception 'Cannot post: missing %', v_missing using errcode = '22023';
  end if;

  insert into public.letter_mailings (
    letter_id, to_name, to_line1, to_line2, to_city, to_state, to_zip,
    from_name, from_line1, from_line2, from_city, from_state, from_zip, requested_by
  ) values (
    p_letter,
    trim(p_to->>'name'), trim(p_to->>'line1'), nullif(trim(coalesce(p_to->>'line2','')), ''),
    trim(p_to->>'city'), upper(trim(p_to->>'state')), trim(p_to->>'zip'),
    trim(p_from->>'name'), trim(p_from->>'line1'), nullif(trim(coalesce(p_from->>'line2','')), ''),
    trim(p_from->>'city'), upper(trim(p_from->>'state')), trim(p_from->>'zip'),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.begin_letter_mailing(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.begin_letter_mailing(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Step 2 — what the provider said. Service role only: the Edge Function is the
-- only thing that has spoken to Lob, so it is the only thing that may report
-- what happened. A browser claiming a letter was posted would be a claim with
-- nothing behind it.
-- ---------------------------------------------------------------------------
create or replace function public.complete_letter_mailing(
  p_mailing     uuid,
  p_status      public.mailing_status,
  p_provider_id text default null,
  p_mode        text default 'unknown',
  p_expected    date default null,
  p_tracking    text default null,
  p_cost_cents  integer default null,
  p_error       text default null
) returns void language plpgsql security definer set search_path = public as $$
declare m public.letter_mailings%rowtype;
begin
  select * into m from public.letter_mailings where id = p_mailing;
  if m.id is null then raise exception 'mailing not found' using errcode = 'P0002'; end if;

  update public.letter_mailings
     set status        = p_status,
         provider_id   = coalesce(p_provider_id, provider_id),
         provider_mode = coalesce(nullif(p_mode, ''), provider_mode),
         expected_delivery_date = coalesce(p_expected, expected_delivery_date),
         tracking_number = coalesce(p_tracking, tracking_number),
         cost_cents    = coalesce(p_cost_cents, cost_cents),
         error         = p_error,
         submitted_at  = case when p_status = 'submitted' and submitted_at is null then now() else submitted_at end,
         last_event_at = now()
   where id = p_mailing;

  /*
   * The letter becomes 'mailed' only when a provider accepted it, and only for
   * a LIVE posting. A test-mode letter is simulated — treating it as mailed
   * would start the statutory clocks on an envelope that does not exist, and
   * those clocks are the whole legal spine of a dispute round.
   */
  if p_status = 'submitted' and p_mode = 'live' then
    update public.dispute_letters set status = 'mailed', mailed_at = now()
     where id = m.letter_id and status in ('approved', 'printed');
    if m.letter_id is not null then
      insert into public.dispute_timers (letter_id, kind, due_at, note)
      select m.letter_id, t.kind::public.dispute_timer_kind, now() + t.offset_days, t.note
        from (values
          ('furnisher_notice'::text,  interval '5 days',   'CRA notice to the furnisher — 5 business days (approximated as 5 calendar days; check the calendar)'),
          ('reinvestigation',         interval '30 days',  '30 days; +15 only if the consumer supplies new relevant information during the reinvestigation'),
          ('results_notice',          interval '35 days',  'written results within 5 business days of completion'),
          ('reinsertion_watch',       interval '120 days', 'compare the next imports for reappearance of any deleted item')
        ) as t(kind, offset_days, note)
       where exists (select 1 from public.dispute_letters dl where dl.id = m.letter_id and dl.recipient_kind = 'cra')
         and not exists (select 1 from public.dispute_timers dt where dt.letter_id = m.letter_id and dt.kind = t.kind::public.dispute_timer_kind);
    end if;
  end if;
end $$;
revoke all on function public.complete_letter_mailing(uuid, public.mailing_status, text, text, date, text, integer, text) from public, anon, authenticated;
grant execute on function public.complete_letter_mailing(uuid, public.mailing_status, text, text, date, text, integer, text) to service_role;

-- Tracking updates arrive from Lob's webhook, keyed by the provider's own id.
create or replace function public.record_mailing_event(p_provider_id text, p_status public.mailing_status, p_tracking text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.letter_mailings
     set status = p_status,
         tracking_number = coalesce(p_tracking, tracking_number),
         last_event_at = now()
   where provider = 'lob' and provider_id = p_provider_id;
end $$;
revoke all on function public.record_mailing_event(text, public.mailing_status, text) from public, anon, authenticated;
grant execute on function public.record_mailing_event(text, public.mailing_status, text) to service_role;
