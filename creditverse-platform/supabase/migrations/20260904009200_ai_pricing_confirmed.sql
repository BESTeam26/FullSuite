-- 0114 — Confirmed provider prices, replacing the provisional ones.
--
-- Dee, 2026-09-06: "Use the current official API pricing for the exact
-- models being used. Provider cost and BES customer pricing should remain
-- separate."
--
-- Read from Anthropic's published price list on 2026-09-06
-- (platform.claude.com/docs/en/about-claude/pricing). Two of the three
-- provisional prices were WRONG, and wrong in the expensive direction:
--
--   claude-opus-5    provisional 15.00 / 75.00 / 1.50
--                    actual       5.00 / 25.00 / 0.50   — 3× too high
--   claude-sonnet-5  provisional  3.00 / 15.00 / 0.30
--                    actual       2.00 / 10.00 / 0.20   — 1.5× too high
--   claude-haiku-4.5 provisional  1.00 /  5.00 / 0.10
--                    actual       1.00 /  5.00 / 0.10   — correct
--
-- Those figures feed the customer charge through `markup_multiplier`, so the
-- provisional numbers were quietly overcharging by up to 3×. This is the
-- reason `ai_pricing_unconfirmed()` exists, and it is the first thing it
-- caught.
--
-- Prices are superseded, never edited. A usage event priced last week must
-- keep costing what it cost (rule 11), so the old rows get an `effective_until`
-- and the new rows start where they stop.
--
-- Anthropic is the only provider in the stack (rule 19). No rows are written
-- for OpenAI or Google models: the gateway does not call them, and a price for
-- a model nothing uses is a number waiting to be believed.

do $$
declare v_now timestamptz := now();
begin
  update public.ai_pricing_policy
     set effective_until = v_now
   where effective_until is null
     and price_confirmed_at is null
     and model in ('claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001');

  insert into public.ai_pricing_policy
    (model, input_cost_per_million, output_cost_per_million, cached_cost_per_million,
     markup_multiplier, credits_per_usd, effective_from, price_confirmed_at, source_note)
  values
    ('claude-opus-5',              5.00, 25.00, 0.50, 3.000, 100, v_now, v_now,
     'Anthropic published price list, read 2026-09-06. Cache read = 0.1x base input.'),
    ('claude-sonnet-5',            2.00, 10.00, 0.20, 3.000, 100, v_now, v_now,
     'Anthropic published price list, read 2026-09-06. $2/$10 confirmed as standard, not introductory.'),
    ('claude-haiku-4-5-20251001',  1.00,  5.00, 0.10, 3.000, 100, v_now, v_now,
     'Anthropic published price list, read 2026-09-06.');
end $$;

comment on column public.ai_pricing_policy.input_cost_per_million is
  'What the PROVIDER charges BES. Never what BES charges the customer — that is this times markup_multiplier, and the two must stay separately readable (Dee, 2026-09-06).';
