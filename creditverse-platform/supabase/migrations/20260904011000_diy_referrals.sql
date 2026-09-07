-- 0132 — DIY referrals: attribution, events, and one commission ledger.
--
-- An organization refers consumers to BES DIY Credit through a tracked link.
-- Consumers who buy through it are attributed to that organization, and the
-- organization earns on what they do next.
--
-- ---------------------------------------------------------------------------
-- ONE LEDGER, NOT TWO.
--
-- `commissions` already exists for funded funding deals, with the states
-- pending → earned → payable → paid → reversed. A referral commission is the
-- same thing owed to the same kinds of party for a different reason, so it
-- goes in the same ledger (rule 2). A second table would mean two answers to
-- "what do we owe this partner?".
--
-- The reference's five states map onto the existing four plus pending with no
-- renaming: Pending = pending, Eligible = earned, Approved = payable,
-- Paid = paid, Reversed = reversed. Renaming would rewrite the meaning of rows
-- that already exist.
--
-- ATTRIBUTION IS NOT ACCESS. This is the rule that matters most here. Being
-- owed money for a consumer tells you nothing about their credit report, their
-- disputes, their documents or their journey. Nothing below grants a single
-- read of any of that, and the matrix asserts it.
-- ---------------------------------------------------------------------------

create type public.referral_event_kind as enum (
  'signup',               -- the consumer created a DIY account through the link
  'subscription_active',  -- they are paying
  'converted_credit',     -- they bought done-for-you credit repair
  'converted_funding'     -- they bought a funding service
);

-- ---------------------------------------------------------------------------
-- 1. The link. One code, owned by the organization that refers.
-- ---------------------------------------------------------------------------
create table public.referral_codes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  /** What appears in the URL. Case-insensitive and unique across the platform. */
  code            citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  label           text,
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index referral_codes_org_idx on public.referral_codes (organization_id) where active;

-- ---------------------------------------------------------------------------
-- 2. Who is attributed to whom. First touch, once, permanently.
--
-- `client_id` is UNIQUE: a consumer belongs to at most one referrer, decided
-- the first time and never re-decided. Dee's rule — attribution history is
-- preserved even if the consumer later purchases another service — is this
-- constraint plus the absence of any writer that changes `code_id`.
--
-- A consumer who came to BES directly simply has no row. They are not
-- assigned to anybody, which is why the table is sparse rather than defaulted.
-- ---------------------------------------------------------------------------
create table public.referral_attributions (
  id              uuid primary key default gen_random_uuid(),
  code_id         uuid not null references public.referral_codes(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null unique references public.clients(id) on delete cascade,
  /** Where they came from, as recorded at the time. */
  source          text not null default 'BES DIY Credit',
  attributed_at   timestamptz not null default now()
);
create index referral_attributions_org_idx on public.referral_attributions (organization_id, attributed_at desc);

comment on table public.referral_attributions is
  'One referrer per consumer, decided at first touch and never changed. Being attributed a consumer grants NO access to that consumer''s records.';

-- ---------------------------------------------------------------------------
-- 3. What the consumer did. Each event is what a plan prices.
-- ---------------------------------------------------------------------------
create table public.referral_events (
  id              uuid primary key default gen_random_uuid(),
  attribution_id  uuid not null references public.referral_attributions(id) on delete cascade,
  kind            public.referral_event_kind not null,
  /** The figure a percentage applies to, when there is one. */
  amount_cents    integer check (amount_cents is null or amount_cents >= 0),
  occurred_at     timestamptz not null default now(),
  note            text,
  recorded_by     uuid references public.profiles(id) on delete set null
);
/* One of each kind per consumer: a signup happens once, and a subscription
   going active twice is the same fact observed twice. */
create unique index referral_events_one_per_kind on public.referral_events (attribution_id, kind);
create index referral_events_attribution_idx on public.referral_events (attribution_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 4. The ledger learns a second reason to owe money.
-- ---------------------------------------------------------------------------
alter table public.commissions alter column deal_id drop not null;
alter table public.commissions add column if not exists referral_event_id uuid
  references public.referral_events(id) on delete cascade;

/* Exactly one reason, never both and never neither. A commission with no cause
   is an amount nobody can explain. */
alter table public.commissions drop constraint if exists commissions_one_cause;
alter table public.commissions add constraint commissions_one_cause
  check ((deal_id is not null) <> (referral_event_id is not null));

create unique index if not exists commissions_one_per_referral_event
  on public.commissions (referral_event_id, party_kind, coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where referral_event_id is not null;

/* Referral plans price an event kind, so `applies_to` grows the values that
   describe one. The existing funded-deal values are untouched. */
alter table public.commission_plans drop constraint if exists commission_plans_applies_to_check;
alter table public.commission_plans add constraint commission_plans_applies_to_check
  check (applies_to in ('gross_funded', 'net_funded', 'accepted_offer_amount',
                        'referral_signup', 'referral_subscription', 'referral_credit_conversion', 'referral_funding_conversion'));

-- Which plan value each event kind is priced by.
create or replace function public.referral_applies_to(p_kind public.referral_event_kind)
returns text language sql immutable as $$
  select case p_kind
    when 'signup' then 'referral_signup'
    when 'subscription_active' then 'referral_subscription'
    when 'converted_credit' then 'referral_credit_conversion'
    when 'converted_funding' then 'referral_funding_conversion'
  end
$$;
