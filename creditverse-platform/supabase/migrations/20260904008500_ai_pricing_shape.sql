-- 0107 — the AI pricing shape. Dee: "let's have the sweet spot, not cheap and
-- not expensive… I trust your decision here."
--
-- ── The fact that decides everything ───────────────────────────────────────
--
-- Almost nothing in this platform uses AI. Letter generation is deterministic.
-- A downloaded PDF is read in the browser. A scan is read by Tesseract on the
-- customer's own machine. Only three things ever reach a provider:
--
--   • a scanned report local OCR could not make out
--   • "suggest wording" on a draft, when somebody presses it
--   • "explain this fit" on a lender match, when somebody presses it
--
-- So this is not a metered product with software around it. It is software
-- with a small metered edge, and the pricing should say so.
--
-- ── Which rules out two of the three obvious models ────────────────────────
--
-- PURE METERED is wrong. A meter on a $149 product creates anxiety out of all
-- proportion to the amounts involved: people avoid a feature that would help
-- them, and support answers "how much will this cost me" all day.
--
-- UNLIMITED is wrong, and Dee ruled it out. One customer scanning five hundred
-- reports would eat the margin on everybody else.
--
-- A GENEROUS INCLUDED ALLOWANCE, then top-ups. A normal month never reaches
-- the edge; a heavy month is paid for by the person having it.
--
-- ── Where to set the allowance ─────────────────────────────────────────────
--
-- At the ninetieth-percentile month, not the average. Set it at the average
-- and half the customers meter, which defeats the point. Set it at the maximum
-- and everybody subsidises the outliers.
--
-- A busy Empire Build customer: thirty clients, perhaps a third arriving as
-- scans, plus fifty wording clicks. That lands near 700-2,000 credits. Build
-- is set at 3,000 — comfortably past it, and roughly 7% of the plan's revenue
-- at cost.
--
-- Allowances rise slightly faster than price, because a larger firm scans
-- proportionally more: it has more clients who photograph a letter.
--
-- ── The markup stays at 3.0x ───────────────────────────────────────────────
--
-- Not margin for its own sake. It covers Authorize.Net's cut, the calls that
-- fail and cannot be billed, provider price changes between reviews, and tax.
-- At 1.0x a single provider price rise puts BES underwater on every call. At
-- 5x it starts to look like the product being sold, which it is not.
--
-- ── Honest caveat, recorded here rather than left in a conversation ────────
--
-- The per-token provider prices these credits are computed from are still
-- ESTIMATES (see ai_pricing_unconfirmed()). The SHAPE below holds whatever
-- those numbers turn out to be; the allowances may need moving once a month of
-- real usage exists, which is what ai_economics() is for. They are rows, so
-- moving them is an edit rather than a migration.

update public.plan_ai_allowances set monthly_credits = 3000,
  note = 'Covers a busy month without metering. About 7% of plan revenue at cost.'
 where plan_key = 'empire_build';
update public.plan_ai_allowances set monthly_credits = 8000,
  note = 'Rises faster than price: a larger firm scans proportionally more.'
 where plan_key = 'empire_grow';
update public.plan_ai_allowances set monthly_credits = 18000,
  note = 'Rises faster than price.'
 where plan_key = 'empire_scale';
update public.plan_ai_allowances set monthly_credits = 40000,
  note = 'Rises faster than price. Past this, talk to the customer rather than meter them.'
 where plan_key = 'empire_enterprise';

-- ---------------------------------------------------------------------------
-- Top-ups, as catalog rows.
--
-- One credit is one cent and a pack costs its face value. No volume discount
-- at launch: it is complexity for amounts this size, and if top-ups ever
-- become common that is a signal the ALLOWANCES are too low, not that the
-- packs need tiers.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_credit_packs (
  key           text primary key,
  label         text not null,
  credits       numeric(12,2) not null check (credits > 0),
  price_cents   integer not null check (price_cents > 0),
  sort          integer not null default 100,
  is_active     boolean not null default true
);
alter table public.ai_credit_packs enable row level security;
create policy ai_credit_packs_select on public.ai_credit_packs for select to authenticated using (true);
create policy ai_credit_packs_write on public.ai_credit_packs for all to authenticated
  using (public.is_agency_manager_or_above()) with check (public.is_agency_manager_or_above());
revoke all on public.ai_credit_packs from anon;
grant select, insert, update, delete on public.ai_credit_packs to authenticated;

insert into public.ai_credit_packs (key, label, credits, price_cents, sort) values
  ('topup_25',  'Add $25 of AI credit',  2500,  2500, 10),
  ('topup_50',  'Add $50 of AI credit',  5000,  5000, 20),
  ('topup_100', 'Add $100 of AI credit', 10000, 10000, 30),
  ('topup_250', 'Add $250 of AI credit', 25000, 25000, 40)
on conflict (key) do nothing;

comment on table public.ai_credit_packs is
  'Top-up packs. One credit = one cent, priced at face value, so the customer-facing unit stays legible and no discount tier hides the real rate.';
