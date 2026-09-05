# Proposal — BES AI Credits (access vs. consumption)

**Status: built 2026-09-05 (0070 tables and functions, Settings › AI usage, HQ › AI Credits, ai-gateway Edge Function with ai_record_usage() metering; first actions: letter wording help, Program Fit explanation). Deploy of the gateway waits for the Anthropic key; automatic recharge waits for the payment connection.** Rule from Dee: AI usage is
token/credit-based across all eligible plans; no tier includes unlimited AI;
AI access (entitlement) and AI consumption (metered) are different things;
prepaid, rechargeable; customers see BES AI Credits, BES meters real tokens
and cost internally.

## Model
```
Plan entitles AI features (which features an organization may use)
  → every AI call is metered: organization, user, product, feature, model,
    input tokens, output tokens, cached tokens, provider cost, BES charge, at
  → charges draw down a prepaid credit balance per organization
  → balance ≤ threshold → optional auto-recharge ($10 / $25 / $50 / $100 packs)
  → zero balance → AI features pause with a clear message; nothing else stops
```
Do not fix "$1 = X tokens". Credits are priced from provider cost × BES policy
per model at call time (`ai_pricing_policy` rows: model, unit cost, markup,
effective_from), so a model change never silently changes margins.

## Data (all append-only where it is history)
- `ai_features` (key, label, product, min_plan) — what exists and where.
- `ai_usage_events` (org, user, product, feature, model, input_tokens,
  output_tokens, cached_tokens, provider_cost_cents(numeric), credits_charged,
  request_id unique, created_at) — the ledger of use; written only by the
  server-side AI gateway (Edge Function), never by the browser.
- `ai_credit_ledger` (org, delta_credits, kind: purchase | auto_recharge |
  usage | adjustment | refund, reference, created_at) — balance = sum.
- `ai_recharge_settings` (org, threshold, pack, enabled) — owner-configurable.

## Gateway
One Edge Function fronts every model call: checks entitlement (plan × feature),
checks balance, calls the provider, meters tokens from the provider response,
writes the usage event and the ledger debit in one transaction, returns the
result. The browser never holds a provider key or computes a charge.

## Customer surface
Settings → AI usage: credits used this cycle by feature (Credit analysis,
Letter assistance, Funding analysis, Operational assistant), balance, packs,
auto-recharge toggle, statement download. Agency surface: same per
organization plus provider cost and margin.

## Verification
Matrix: usage events and ledger readable by the organization's owner/admin
only (and BES managers); never writable by a client role; balance function
equals the ledger sum. Unit: charge computation from policy rows; entitlement
gate by plan/feature.
