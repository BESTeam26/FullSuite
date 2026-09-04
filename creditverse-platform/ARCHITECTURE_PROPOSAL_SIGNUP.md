# Proposal — Self-serve sign-up, automatic organization, trial and activation

**Status: proposal. Nothing built.** Decisions from Dee (2026-09-04): 30-day
trial with products set by the selected plan; Authorize.Net as processor;
public sign-up with email verification and abuse prevention; one Organization
ID per legitimate business; no second trial for a business already known.

## What exists (verified on disk)

- Supabase Auth owns accounts and sends the confirmation email itself.
  `handle_new_user()` runs AFTER INSERT on `auth.users` and creates the
  `profiles` row from `raw_user_meta_data` (full_name, avatar_url).
- The Login page already has a "Create account" path calling `signUp(email,
  password, fullName)`.
- `organizations` gets its `BES-` ID from the database on insert; entitlements
  are rows in `product_entitlements`; membership is `org_memberships`.
- No payment-processor configuration exists (env carries only site URL and the
  Supabase anon key). No trial concept exists in the schema.

## Flow

```
Sign-up form (public)
  email · password · full name · business/company name · phone · plan
  → supabase.auth.signUp with the business fields in raw_user_meta_data
  → Supabase sends the confirmation email (nothing is created yet)

Email confirmed  (auth.users.email_confirmed_at set)
  → trigger creates, in ONE transaction:
      organizations row        (BES- ID assigned by the database)
      org_memberships          (signer = org_admin)
      product_entitlements     (the plan's products, enabled)
      organization_trials row  (starts now, ends +30 days, plan, status)
  → first login lands on /app/org/<BES-ID>

Trial ends / payment
  → activation: Authorize.Net charge → entitlements stay on; otherwise
    entitlements flip off and the dashboard says so plainly.
```

Creation happens on **confirmation**, not on sign-up, so unverified addresses
never create organizations.

## Schema (additive)

```
organization_trials (organization_id pk → organizations, plan text, started_at,
                     ends_at, status trial_status: active|converted|expired|blocked,
                     blocked_reason text?, created_by uuid)
organization_identity (organization_id, kind identity_kind: email|email_domain|
                       phone|business_name_normalized|ein, value text,
                       unique (kind, value))     -- what a business is known by
plans (key text pk, label, products product_key[], trial_days int default 30)  -- data, not enum
```

## Trial eligibility (deterministic, in the database)

Before creating the trial, normalize and match against `organization_identity`:
exact matches on email, email domain (excluding public mail providers), phone
digits, EIN when supplied, and the normalized business name (lowercase,
punctuation and "LLC/Inc/Corp" suffixes removed).
- **Exact identifier match** (email, phone, EIN): organization is created, trial
  is `blocked` with the reason; the dashboard shows "trial not available —
  contact BES", paid activation still allowed.
- **Business-name match only**: trial created but flagged for BES review
  (`blocked_reason = 'name_match_review'`), visible on the BES Organizations
  hub; BES may release or block it.
Nothing is inferred from display names for **authorization**; identity rows
only decide trial eligibility.

## Abuse prevention

- Email verification required (creation on confirmation).
- Supabase Auth rate limits on sign-up; disposable-domain blocklist checked in
  the trigger (a small table of domains, data not code).
- One organization per confirmation; the trigger is idempotent per user.
- Public form has honeypot + server-side validation of the plan key against
  `plans`.

## Payments (Authorize.Net)

Accept.js hosted fields on the client (card data never touches our servers), an
Edge Function holding the API login ID and transaction key from the environment,
`organization_payments` ledger rows, and activation on a successful
authorize-and-capture. Built when the keys exist in the environment.

## Open questions for Dee (not blocking sign-up + trial)

1. Plan names, prices and product bundles — the `plans` table is data; I need
   the list.
2. Whether a blocked trial should still allow the person to log in and see a
   "contact BES" screen (my default: yes).
