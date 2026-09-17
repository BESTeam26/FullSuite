-- Paying a partner invoice by card: the shared foundation.
--
-- Dee, 2026-09-17, asked for all three: pay-this-invoice, card on file, and
-- autopay. They differ only in WHO starts the charge and WHETHER a card is
-- kept; the vault, the recording and the double-charge protection are one
-- thing, built once here.
--
-- ── WHAT IS NEVER STORED ───────────────────────────────────────────────────
--
-- No card number. No CVV. No expiry beyond the month and year needed to warn
-- that a card is about to lapse. Authorize.Net holds the instrument and gives
-- back two opaque ids; those ids and the last four digits are the whole of what
-- BES keeps, which is the same shape the organization vault already uses.
--
-- ── WHY A SEPARATE RECORDING FUNCTION ──────────────────────────────────────
--
-- `record_partner_payment` requires `partners.payments.record`, which is
-- owner-gated. A partner paying their own invoice does not have it and must
-- never be given it — that capability is "record any payment against any
-- partner". So a verified charge is recorded by a SECURITY DEFINER function
-- that the payments function calls with the service role, and which decides for
-- itself that the invoice really belongs to that partner.
--
-- ── THE BUG THAT BILLS SOMEBODY TWICE ──────────────────────────────────────
--
-- Dee named it, and it is the one that matters. Three separate guards, because
-- any one of them can be defeated by a retry, a double click or a replayed
-- webhook:
--
--   1. Every attempt carries an IDEMPOTENCY KEY, unique. A retry with the same
--      key returns the first answer instead of charging again.
--   2. A provider transaction id can be recorded ONCE, enforced by an index.
--      A webhook replay of a charge already recorded changes nothing.
--   3. Autopay's key is derived from the invoice, so a sweep that runs twice
--      in a minute — or twice in a day — produces one charge.

-- ── The vault ──────────────────────────────────────────────────────────────

create table if not exists public.partner_payment_profiles (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  group_id            uuid not null references public.outsourcing_groups (id) on delete cascade,
  provider            text not null default 'authorize_net',
  /* Authorize.Net's own ids. Opaque to BES and useless anywhere else. */
  customer_profile_id text not null,
  payment_profile_id  text not null,
  card_brand          text,
  last4               text,
  exp_month           smallint,
  exp_year            smallint,
  is_default          boolean not null default true,
  /* Card on file is not consent to charge it automatically. Autopay is its own
     switch, off until somebody turns it on. */
  autopay_enabled     boolean not null default false,
  added_by            uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint partner_payment_profiles_last4_ck
    check (last4 is null or last4 ~ '^[0-9]{4}$'),
  /* A belt-and-braces refusal of anything that looks like a full card number.
     Nothing should ever try; if something does, the row does not exist. */
  constraint partner_payment_profiles_no_pan_ck
    check (customer_profile_id !~ '^[0-9]{12,19}$' and payment_profile_id !~ '^[0-9]{12,19}$')
);

comment on table public.partner_payment_profiles is
  'A partner card, as Authorize.Net profile ids. Never a card number, never a CVV. Autopay is a separate switch from having a card on file.';

create unique index if not exists partner_payment_profiles_one_default
  on public.partner_payment_profiles (group_id) where is_default;

alter table public.partner_payment_profiles enable row level security;

/* A partner contact sees their own partner's cards; BES staff see them where
   they may already see the partner. Nobody sees a number, because none is kept. */
create policy partner_payment_profiles_select on public.partner_payment_profiles
  for select using (
    public.is_partner_contact_of(group_id)
    or (public.is_agency_staff() and public.can_see_partner(group_id))
  );

/* Writes go through the functions below, never straight from a client. */
grant select on public.partner_payment_profiles to authenticated;

-- ── Every attempt, once ────────────────────────────────────────────────────

create table if not exists public.partner_card_charges (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  group_id            uuid not null references public.outsourcing_groups (id) on delete cascade,
  invoice_id          uuid references public.partner_invoices (id) on delete set null,
  profile_id          uuid references public.partner_payment_profiles (id) on delete set null,
  /* 'pay_now' | 'card_on_file' | 'autopay' — which of the three started it. */
  kind                text not null,
  /* The one thing that makes a retry safe. */
  idempotency_key     text not null,
  amount_cents        bigint not null check (amount_cents > 0),
  currency            text not null default 'USD',
  status              text not null default 'pending',
  provider_txn_id     text,
  response_code       text,
  response_text       text,
  payment_id          uuid references public.partner_payments (id) on delete set null,
  started_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint partner_card_charges_kind_ck
    check (kind in ('pay_now', 'card_on_file', 'autopay')),
  constraint partner_card_charges_status_ck
    check (status in ('pending', 'approved', 'declined', 'held_for_review', 'error'))
);

comment on table public.partner_card_charges is
  'One row per charge ATTEMPT, keyed by an idempotency key. The reason a retry, a double click or a replayed webhook cannot bill somebody twice.';

/* Guard 1: the same attempt is the same attempt. */
create unique index if not exists partner_card_charges_idempotent
  on public.partner_card_charges (idempotency_key);

/* Guard 2: a provider transaction is recorded once, ever. */
create unique index if not exists partner_card_charges_provider_txn
  on public.partner_card_charges (provider_txn_id) where provider_txn_id is not null;

create index if not exists partner_card_charges_invoice
  on public.partner_card_charges (invoice_id, created_at desc);

alter table public.partner_card_charges enable row level security;

create policy partner_card_charges_select on public.partner_card_charges
  for select using (
    public.is_partner_contact_of(group_id)
    or (public.is_agency_staff() and public.can_see_partner(group_id))
  );

grant select on public.partner_card_charges to authenticated;
