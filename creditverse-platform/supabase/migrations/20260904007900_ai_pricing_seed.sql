-- 0101 — pricing rows, marked provisional.
--
-- `ai_pricing_policy` was empty, which meant ai_estimate_credits() refused
-- every model and no AI call could have been made. That is the correct failure
-- — an unpriced model must never be billed at zero — but it is not a usable
-- state, so this seeds the models the gateway can select.
--
-- ── READ THIS BEFORE GOING LIVE ────────────────────────────────────────────
--
-- THE NUMBERS BELOW ARE PROVISIONAL AND MUST BE CONFIRMED against Anthropic's
-- current published price list before real customers are charged. They are
-- rows, effective-dated, precisely so correcting them is an INSERT with a new
-- `effective_from` — never a code change and never an edit that rewrites
-- history. Past usage keeps the price that was in force when it happened.
--
-- Under-pricing here costs BES money on every call and the loss is silent.
-- `ai_pricing_unconfirmed()` below exists so it cannot stay silent.

alter table public.ai_pricing_policy
  add column if not exists price_confirmed_at timestamptz,
  add column if not exists source_note text;

comment on column public.ai_pricing_policy.price_confirmed_at is
  'When a person last checked this against the provider''s published prices. Null means provisional — see ai_pricing_unconfirmed().';

insert into public.ai_pricing_policy
  (model, input_cost_per_million, output_cost_per_million, cached_cost_per_million,
   markup_multiplier, credits_per_usd, effective_from, source_note)
values
  ('claude-opus-5',              15.00, 75.00, 1.50, 3.000, 100, now(), 'PROVISIONAL — confirm against the provider price list'),
  ('claude-sonnet-5',             3.00, 15.00, 0.30, 3.000, 100, now(), 'PROVISIONAL — confirm against the provider price list'),
  ('claude-haiku-4-5-20251001',   1.00,  5.00, 0.10, 3.000, 100, now(), 'PROVISIONAL — confirm against the provider price list')
on conflict do nothing;

/**
 * Models being charged for on a price nobody has confirmed.
 *
 * Surfaced on the AI economics screen. A provisional price that is too low is
 * a loss on every single call, and the only symptom is a margin that quietly
 * does not appear — so this is deliberately impossible to miss rather than a
 * comment in a migration nobody reads again.
 */
create or replace function public.ai_pricing_unconfirmed()
returns table (model text, effective_from timestamptz, source_note text)
language sql stable security definer set search_path = public as $$
  select p.model, p.effective_from, p.source_note
    from public.ai_pricing_policy p
   where public.is_agency_manager_or_above()
     and p.price_confirmed_at is null
     and (p.effective_until is null or p.effective_until > now())
$$;
revoke all on function public.ai_pricing_unconfirmed() from public, anon;
grant execute on function public.ai_pricing_unconfirmed() to authenticated;
