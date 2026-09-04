# Performance diagnostic — measured, not assumed

**Status: diagnosed, then fixed. Priorities 1–5 implemented and re-measured —
see "Results" at the end. The findings below are the BEFORE state.**

Measured against the live development database with a signed-in BES owner
session, using `window.fetch` interception (payload bytes and row counts) and
Resource Timing (survives reload, so cold loads are real cold loads). Timings
are the dev server on localhost against Supabase `wiojlgkzxlaiajwwrzuj`.

## The short version

The application is **not** slow because of rendering, bundle size, or N+1
queries — all three are healthy. It is slow because **every cold page load
resolves the signed-in user's identity twice**, and that doubled batch sits
directly on the critical path in front of every data request.

On `/app` that is **8 of 11 requests (73%) spent on authorization**, for four
requests' worth of information.

---

## Per-route findings

### `/app` — HQ dashboard

| | |
|---|---|
| **REQUEST COUNT** | 11 cold (0 warm). FCP 424ms, last byte 985ms |
| **DUPLICATES** | `profiles`, `agency_memberships`, `org_memberships`, `external_memberships` — each fetched **twice** |
| **WATERFALLS** | 2 waves. Wave 1 t=54→585 (8 identity requests); wave 2 t=390→985 (`work_attention`, `user_preferences`, `organizations`). Wave 2 cannot start until identity resolves |
| **N+1** | None. `work_attention` is a single view read |
| **OVERFETCH** | `organizations` returns 14.6kb of nested memberships and businesses; the dashboard renders neither |
| **AUTH / PERMISSION REPEATS** | **Yes — the core defect.** `loadIdentity()` runs from both `getSession().then()` ([auth-context.tsx:145](src/lib/auth/auth-context.tsx:145)) and `onAuthStateChange` ([:156](src/lib/auth/auth-context.tsx:156)), which fires `INITIAL_SESSION` on boot. No dedupe |
| **LIKELY BOTTLENECK** | The duplicated identity batch. Contention makes the *needed* copies slower too: `profiles` 264ms alone vs **515ms** with its twin in flight |
| **RECOMMENDED FIX** | Resolve identity once. Guard `loadIdentity` against a concurrent call for the same user id, or drop the `getSession()` branch entirely and rely on `INITIAL_SESSION` |

### `/app/creditops`

| | |
|---|---|
| **REQUEST COUNT** | 15 cold, 2 warm. FCP 812ms, last byte **1394ms** — the slowest route |
| **DUPLICATES** | The 4 identity requests ×2, **plus `organizations` ×2** |
| **WATERFALLS** | 2 waves. Wave 1 t=78→968; wave 2 t=782→1394. The second identity batch runs *concurrently with* wave 2, competing with the requests the screen is waiting on |
| **N+1** | None. `fetchPartners` deliberately batches into 3 parallel reads |
| **OVERFETCH** | Two problems. (1) `organizations` twice with different shapes: 14.6kb nested from agency-context and 3.4kb narrow from `fetchPartners` — 18kb where 3.4kb is displayed. (2) `webhook_deliveries?limit=200` is fetched on mount for the **Signal Log tab, which is not open** |
| **AUTH / PERMISSION REPEATS** | Same doubled batch as `/app` |
| **LIKELY BOTTLENECK** | The auth gate at ~720ms, then a 600ms data wave behind it |
| **RECOMMENDED FIX** | Fix the identity duplication; give `fetchPartners` and agency-context a shared organizations query key, or narrow `ORG_SELECT` and let the ops routes reuse it; move the webhook log fetch into the Signal Log panel |

### `/app/fundingops`

| | |
|---|---|
| **REQUEST COUNT** | 15 cold, 2 warm. FCP 420ms, last byte 1051ms |
| **DUPLICATES** | Identity ×2, `organizations` ×2 |
| **WATERFALLS** | 2 waves: t=50→581, then t=393→1051 |
| **N+1** | None. `funding_clients` and `funding_deals` are one read each |
| **OVERFETCH** | Same 14.6kb nested `organizations`. Payloads otherwise small (`funding_clients` 2.6kb/3, `funding_deals` 1.3kb/3) |
| **AUTH / PERMISSION REPEATS** | Same doubled batch |
| **LIKELY BOTTLENECK** | Identity gate, then `funding_clients` (988ms) and the nested `organizations` (1051ms) — the two slowest in wave 2 |
| **RECOMMENDED FIX** | As above. No FundingOps-specific problem |

### `/app/reporting`

| | |
|---|---|
| **REQUEST COUNT** | 10 cold, **0 warm** |
| **DUPLICATES** | Identity ×2 — nothing else |
| **WATERFALLS** | 1 real wave; there is no data wave |
| **N+1** | None |
| **OVERFETCH** | **Zero database requests.** The page is entirely placeholder data. It does pull the 366kb (101kb gzipped) recharts chunk |
| **AUTH / PERMISSION REPEATS** | The doubled batch, which here is **80% of all requests** |
| **LIKELY BOTTLENECK** | Auth only, plus the chart library download |
| **RECOMMENDED FIX** | Nothing to optimize until it reads real data. Worth knowing the figures on screen are not live |

### One CreditOps client workspace

| | |
|---|---|
| **REQUEST COUNT** | 2 (warm), 11.1kb, 913ms |
| **DUPLICATES** | None within the open — but `fulfillment_engagements` (4.4kb/11 rows) was **already fetched by the route load**, under a different query key |
| **WATERFALLS** | None. Both requests fire in parallel |
| **N+1** | None. `activity_events` is one bounded timeline read (6.7kb/13 rows) |
| **OVERFETCH** | The re-fetched engagement list |
| **AUTH / PERMISSION REPEATS** | None — reads the cached auth context correctly |
| **LIKELY BOTTLENECK** | Nothing structural. 913ms is a cold RLS evaluation on `activity_events`, which is visibility-filtered |
| **RECOMMENDED FIX** | Route the `fetchPartners` engagement read through the `["fulfillment","engagements"]` query key so both callers share one cache entry |

### One FundingOps deal workspace

| | |
|---|---|
| **REQUEST COUNT** | 2 (warm), 4.4kb, 236ms |
| **DUPLICATES** | Same cross-key `fulfillment_engagements` re-fetch |
| **WATERFALLS** | None |
| **N+1** | None |
| **OVERFETCH** | Engagements again. `funding_department_statuses` returned 0 rows |
| **AUTH / PERMISSION REPEATS** | None |
| **LIKELY BOTTLENECK** | None. This is the fastest surface measured |
| **RECOMMENDED FIX** | The shared engagement key |

---

## What is already healthy

Worth stating, because these are the usual suspects and none of them is guilty:

- **No N+1 queries anywhere.** Every list is one bounded read. `fetchPartners`
  explicitly batches into 3 parallel requests rather than per-partner lookups.
- **Main thread is not the bottleneck.** Zero long tasks (>50ms) on any route.
  DOM sizes 426–888 nodes.
- **Warm navigation is fast.** CreditOps 2 requests / 299ms, FundingOps 2 / 267ms,
  Reporting 0. TanStack Query caching is working.
- **Route splitting is in place** — 49 lazy routes; ops pages are separate chunks.
- **Index coverage is broadly right** for tenant, status, assignment and entity
  timeline queries.

## Lower-priority observations

- `fulfillment_clients` is ordered by `name` with **no index on `name`** — a sort
  on every list read. Irrelevant at 17 rows, not at 10,000.
- `webhook_deliveries` is ordered `created_at desc limit 200` with only an
  `agency_id` index — that read sorts the whole table as the log grows.
- Main entry bundle is 624kb raw / **187kb gzipped**, plus a 101kb gzipped chart
  chunk. Large but within normal range for this stack.

---

## Top 5 by impact

| # | Problem | Evidence | Cost |
|---|---|---|---|
| **1** | **Identity batch resolves twice on every cold load** — `loadIdentity()` invoked from both `getSession()` and `onAuthStateChange(INITIAL_SESSION)` | 8 identity requests on every route measured. `profiles` 264ms alone → 515ms with its twin | 4 wasted requests + **~250–350ms added to the critical path**, on every cold load of every page |
| **2** | **`organizations` fetched twice per ops route, one of them 4× too fat** — `["organizations", userId]` nested (14.6kb) and `["partners", product]` narrow (3.4kb) | Both present in the CreditOps and FundingOps cold sequences | 18kb where 3.4kb renders; **grows with orgs × memberships**, so it degrades as BES adds partners |
| **3** | **`fetchFulfillmentEngagements` lives under two query keys** — called directly inside `fetchPartners`, and separately by `useFulfillment` | 4.4kb/11 rows on route load, then again when any workspace opens | One duplicated request per workspace open; the exact pattern rule 14 forbids |
| **4** | **Auth→data waterfall is two waves deep, and the gate is the doubled batch** | No data request starts before t=390–782ms on any route | The whole data wave inherits problem 1's delay; fixing 1 pulls wave 2 forward by roughly the same amount |
| **5** | **Hidden-tab fetch: `webhook_deliveries?limit=200` on CreditOps mount** — [creditops-webhooks.tsx:141](src/lib/fulfillment/creditops-webhooks.tsx:141) | Present in every CreditOps load; Signal Log tab was never opened | 1.7kb/4 rows today, **200 rows unindexed-sort at production volume**. Rule 7: do not load hidden tabs |

**Problems 1 and 4 are the same fix.** Deduplicating `loadIdentity` is a small,
contained change to one file and is the single highest-value item — it removes
4 requests and roughly a third of a second from every cold page load without
touching RLS, authorization, or the data model.

**Nothing has been changed. Awaiting direction before any optimization.**


---

# Results — after implementing priorities 1–5

Re-profiled with the identical method (Resource Timing for cold loads, fetch
interception for warm navigation and payload bytes).

## Cold load

| Route | Requests | Auth requests | Duplicates | Last byte | FCP |
|---|---|---|---|---|---|
| `/app` | 11 → **7** | 8 → **4** | 4 → **0** | 985ms → **605ms** (−39%) | 424ms → 424ms |
| `/app/creditops` | 15 → **9** | 8 → **4** | 5 → **0** | 1394ms → **674ms** (−52%) | 812ms → **384ms** (−53%) |
| `/app/fundingops` | 15 → **10** | 8 → **4** | 5 → **0** | 1051ms → **588ms** (−44%) | 420ms → 376ms |

## Warm navigation and workspaces

| Surface | Requests | Payload | Time |
|---|---|---|---|
| CreditOps warm SPA | 2 → **1** | 14.9kb → **13.2kb** | 299ms → **279ms** |
| FundingOps warm SPA | 2 → **2** (unchanged) | 3.9kb → 3.9kb | 267ms → **261ms** |
| CreditOps client workspace | 2 → **1** | 11.1kb → **1.9kb** (−83%) | 913ms → **294ms** (−68%) |
| FundingOps deal workspace | 2 → **1** | 4.4kb → **0.0kb** | 236ms → **229ms** |

## Payload

| Read | Before | After |
|---|---|---|
| `organizations` per ops route | 14.6kb + 3.4kb = **18.0kb** in 2 requests | **11.9kb** in 1 request (−34%) |
| `fulfillment_engagements` | 4.4kb × 2 (route + workspace) | 4.4kb × 1 |
| `webhook_deliveries` on CreditOps | 1.7kb, always | **0** unless Signal Log is opened |

## What changed

| Priority | Change | File |
|---|---|---|
| **1** | `loadIdentity` shares one in-flight promise per user id, so `getSession()` and `INITIAL_SESSION` resolve identity once. Sign-out clears it; `refreshMemberships` bypasses it with `force` | `lib/auth/auth-context.tsx` |
| **2** | `ORG_SELECT` no longer joins `org_memberships` or `external_memberships` — **no screen rendered either field**. `usePartners` now composes the shared `["organizations", userId]` cache instead of issuing its own organizations query | `lib/data/organizations.ts`, `lib/data/partners.ts`, `lib/data/use-partners.ts` |
| **3** | `fetchPartners` no longer calls `fetchFulfillmentEngagements` directly. `buildPartners` is now a pure function taking engagements as an argument; `usePartners` reads the canonical `["fulfillment","engagements"]` cache via `useFulfillment` | `lib/data/partners.ts`, `lib/data/use-partners.ts` |
| **4** | The signal log loads when the Signal Log panel mounts, not when CreditOps does. Idempotent, and retries on failure rather than latching | `lib/fulfillment/creditops-webhooks.tsx`, `components/dashboard/fulfillment/CreditOpsWebhookPanel.tsx` |
| **5** | Preserved. Warm transitions, both workspaces, existing caching and existing parallel batching all measured the same or better | — |

## Security

**No RLS change, no policy change, no migration.** Every change is client-side:
which columns are requested, and how results are cached. `verify-live.mjs`
passes all 26 checks (anonymous denial on every table, write protection,
append-only audit trail). Dropping the membership joins *narrows* what the
client requests — RLS was already filtering those rows and still is.

## Verification

- **Typecheck** clean · **Tests** 195 passed / 19 files · **Lint** 0 errors, 77
  warnings (identical to baseline) · **Build** succeeds · **madge** no circular
  dependencies
- 5 new tests in `lib/auth/auth-context-bootstrap.test.tsx` pin the dedupe by
  counting real table reads. Confirmed to have teeth: defeating the dedupe makes
  3 of them fail with `expected 2 to be 1`.

## Not done, deliberately

- Reporting placeholder data — out of scope for this task.
- The mutation layer — diagnosed separately in `MUTATION_DIAGNOSTIC.md`, not
  implemented.
- `work_items_insert` policy defect (organization members cannot create work
  items) — a pre-existing authorization bug, unrelated to performance.
