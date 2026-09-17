-- The three things Dee's brief adds: UNKNOWN, consent, and webhook events.
--
-- ── UNKNOWN IS NOT FAILED ─────────────────────────────────────────────────
--
-- Dee: "gateway charged successfully → network timed out → FullSuite assumes
-- failure → FullSuite charges again." That is the double charge no idempotency
-- key catches, because the retry is a new, honest attempt at what looks like a
-- failure.
--
-- So a charge whose answer never arrived is UNKNOWN, not error. Unknown is
-- terminal for the attempt: it is never retried automatically, and the invoice
-- is not credited, because nobody yet knows whether money moved. It is
-- resolved by the webhook, or by a person reading the Authorize.Net
-- transaction list. `partner_autopay_due` excludes any invoice with an unknown
-- attempt against it, so the sweep will not walk into the same hole tomorrow.
--
-- ── SAVING A CARD IS NOT CONSENT TO CHARGE IT ─────────────────────────────
--
-- "Do not assume: Save card = AutoPay consent." The switch was already
-- separate. What was missing is WHO turned it on and WHEN — the record that
-- makes consent a fact rather than a setting.
--
-- ── WEBHOOKS ARE UNTRUSTED UNTIL PROVEN ───────────────────────────────────
--
-- Dee's standing rule: "Do not deploy a webhook that can credit invoices until
-- signature/authenticity verification is implemented." This table is the
-- ledger of what arrived; verification happens before anything is written to
-- it, and the amount and invoice are re-read from our own attempt, never taken
-- from the event body.

-- ── UNKNOWN ────────────────────────────────────────────────────────────────

alter table public.partner_card_charges drop constraint if exists partner_card_charges_status_ck;
alter table public.partner_card_charges add constraint partner_card_charges_status_ck
  check (status in ('pending', 'approved', 'declined', 'held_for_review', 'error', 'unknown'));

comment on column public.partner_card_charges.status is
  'pending · approved · declined · held_for_review · error · unknown. UNKNOWN means the processor''s answer never arrived: money may or may not have moved, so it is never retried automatically and never credits an invoice.';

/* The timeout path. Separate from settle because settle records an OUTCOME,
   and the whole point of unknown is that there is no outcome yet. */
create or replace function public.mark_partner_card_charge_unknown(
  p_idempotency_key text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare c public.partner_card_charges%rowtype;
begin
  select * into c from public.partner_card_charges
   where idempotency_key = p_idempotency_key for update;
  if c.id is null then
    raise exception 'No such charge attempt' using errcode = 'P0002';
  end if;
  /* If it already settled, the answer did arrive — leave it alone. */
  if c.status <> 'pending' then
    return jsonb_build_object('status', c.status, 'already_settled', true);
  end if;

  update public.partner_card_charges
     set status = 'unknown', response_text = p_note, updated_at = now()
   where id = c.id;

  perform public.log_audit('partner.card_payment_unknown', 'partner_card_charge', c.id::text, null, null,
    jsonb_build_object('partner', c.group_id, 'invoice', c.invoice_id,
      'amount_cents', c.amount_cents, 'kind', c.kind, 'note', p_note));

  return jsonb_build_object('status', 'unknown', 'already_settled', false);
end $$;

comment on function public.mark_partner_card_charge_unknown(text, text) is
  'The processor was reached but its answer never arrived. Money may have moved. Never retried automatically — resolved by the webhook or by a person.';

revoke all on function public.mark_partner_card_charge_unknown(text, text) from public, authenticated, anon;

/* An invoice with an unresolved attempt against it is left alone by the sweep.
   Charging it again is precisely the double charge unknown exists to prevent. */
create or replace function public.partner_autopay_due()
returns table (
  group_id uuid, invoice_id uuid, invoice_number text,
  amount_cents bigint, currency text, idempotency_key text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.group_id, i.id, i.invoice_number,
         public.invoice_balance_cents(i.id),
         i.currency,
         'autopay:' || i.id::text || ':' || public.invoice_balance_cents(i.id)::text
    from public.partner_invoices i
    join public.outsourcing_groups g on g.id = i.group_id
    join public.partner_payment_profiles p
      on p.group_id = i.group_id and p.is_default and p.autopay_enabled
   where i.status in ('sent', 'overdue', 'partially_paid')
     and i.due_date <= current_date
     and g.lifecycle not in ('suspended', 'archived')
     and public.invoice_balance_cents(i.id) > 0
     and not exists (
       select 1 from public.partner_card_charges c
        where c.invoice_id = i.id and c.status in ('pending', 'unknown', 'held_for_review'))
   order by i.due_date, i.invoice_number
$$;

comment on function public.partner_autopay_due() is
  'Invoices autopay should charge today. The key is derived from the invoice and its balance, so a sweep that runs twice charges once. Skips suspended and archived partners, and any invoice with an attempt still in the air.';

revoke all on function public.partner_autopay_due() from public, authenticated, anon;

-- ── Consent, as a fact rather than a setting ───────────────────────────────

alter table public.partner_payment_profiles
  add column if not exists autopay_enabled_at timestamptz,
  add column if not exists autopay_enabled_by uuid references public.profiles (id);

comment on column public.partner_payment_profiles.autopay_enabled_at is
  'When autopay was last switched ON, and by whom in autopay_enabled_by. Saving a card is not consent to charge it; this is the record that it was given.';

create or replace function public.set_partner_autopay(p_group uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_has_card boolean;
begin
  if not public.may_act_on_partner_billing(p_group, auth.uid()) then
    raise exception 'You cannot change autopay for this partner' using errcode = '42501';
  end if;

  select exists (select 1 from public.partner_payment_profiles
                  where group_id = p_group and is_default) into v_has_card;
  /* Autopay without a card is a switch that does nothing — and a partner who
     believes their invoices are being paid. Refuse it rather than accept it. */
  if p_enabled and not v_has_card then
    raise exception 'Save a card first: autopay needs a card on file' using errcode = '22023';
  end if;

  update public.partner_payment_profiles
     set autopay_enabled = p_enabled,
         /* Switching it off does not erase who once switched it on. */
         autopay_enabled_at = case when p_enabled then now() else autopay_enabled_at end,
         autopay_enabled_by = case when p_enabled then auth.uid() else autopay_enabled_by end,
         updated_at = now()
   where group_id = p_group and is_default;

  perform public.log_audit('partner.autopay_changed', 'outsourcing_group', p_group::text, null, null,
    jsonb_build_object('enabled', p_enabled, 'by', auth.uid()));
  return p_enabled;
end $$;

revoke all on function public.set_partner_autopay(uuid, boolean) from public;
grant execute on function public.set_partner_autopay(uuid, boolean) to authenticated;

-- ── What the gateway told us, and when ─────────────────────────────────────

create table if not exists public.partner_payment_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'authorize_net',
  /* Authorize.Net's own event id. Unique, which is what makes a replay a
     no-op rather than a second payment. */
  provider_event_id text not null,
  event_type    text not null,
  provider_txn_id text,
  charge_id     uuid references public.partner_card_charges (id) on delete set null,
  payment_id    uuid references public.partner_payments (id) on delete set null,
  status        text not null default 'received',
  note          text,
  /* The event body, minus anything sensitive. Authorize.Net does not send card
     numbers in webhooks, and this is stripped before it is written regardless. */
  payload       jsonb,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  constraint partner_payment_events_status_ck
    check (status in ('received', 'processed', 'ignored', 'unmatched', 'failed'))
);

comment on table public.partner_payment_events is
  'Every verified Authorize.Net webhook. The unique provider_event_id is why a replayed event cannot produce a second payment.';

create unique index if not exists partner_payment_events_once
  on public.partner_payment_events (provider, provider_event_id);
create index if not exists partner_payment_events_txn
  on public.partner_payment_events (provider_txn_id) where provider_txn_id is not null;

alter table public.partner_payment_events enable row level security;

/* Finance reads it. Nobody writes it from a browser; the webhook function
   writes it with the service role, after verifying the signature. */
create policy partner_payment_events_select on public.partner_payment_events
  for select using (public.is_agency_staff() and public.agency_can('partners.payments.record'));

grant select on public.partner_payment_events to authenticated;
