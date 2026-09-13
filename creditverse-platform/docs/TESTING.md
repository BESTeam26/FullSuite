# Testing

## The gate

```bash
npm test && npm run build && npm run probe
```

**`npm test`, `tsc` and `npm run build` are NOT a sufficient gate for this
application.** This is the single most important thing in this document.

All three can be perfectly green while production is broken, because this is no
longer a UI codebase. It is RLS, PostgREST relationships, RPCs, cron jobs,
payment logic, portals and cross-module data — and none of that is TypeScript.

## What each layer can and cannot catch

| Layer | Catches | **Cannot** catch |
|---|---|---|
| `tsc --noEmit` | type errors, wrong props, missing fields on typed shapes | anything expressed as a **string**: PostgREST selects, RPC names, RPC argument names, SQL |
| `npm run lint` | style, unused code, React hook rules | the same |
| `npm test` (1787 tests) | domain rules, component behaviour, lifecycle logic, formatting | anything needing a **real database** — the data layer is mocked, so a broken query is never issued |
| `npm run build` | bundling, imports, syntax | everything above |
| **`npm run probe:shapes`** | **ambiguous or invalid PostgREST embeds** | data correctness; it asks the API to *parse*, not to return rows |
| **`npm run probe:sql`** | **RPC overloads, wrong/missing arguments, missing or excessive `EXECUTE` grants, unpinned `search_path`, dead cron targets, three-part `net.` names** | whether the function's *logic* is right |
| **live acceptance probes** | **real authorization, as real users** | performance, UI |
| **`rls-matrix.mjs`** | the full policy matrix, 70 phases | runtime call shapes |

**The middle rows are the ones that were missing**, and every one of them exists
because something reached Dee's screen that every green check had approved.

## Unit tests

```bash
npm test            # 1787 tests, 155 files, ~11s
npm run test:watch
```

Vitest with Testing Library. Domain modules are pure and tested directly; the
data layer is mocked in component tests.

Conventions that matter:

- **Test the invariant, not the incidental count.** "No conversation belonging
  to another partner appears" survives a new partner; "there are 3 rows" does
  not.
- **Never change a fixture to match real data.** If reality contradicts a test,
  inspect the test's assumption.
- **If a test fails, report it as failing until it is fixed.** A gate reported
  as green with one failure is worse than no gate. This has happened once and
  it should not happen again.

## The runtime probes

### `npm run probe:shapes`

Extracts every `.from("x").select("…")` embed across **all** of `src/` and asks
the live PostgREST API to parse it. It does not read data and needs no session:
a schema error (PGRST100/200/201/202/204) comes back *before* any row-level
check, and a permission error means the shape was accepted — exactly the signal
wanted.

**Currently: 53 shapes across 32 files, 0 refused, 6 skipped** (built by string
interpolation and therefore not reconstructable — skipped and counted, never
guessed at).

It exists because `outsourcing_groups → partner_contacts` is ambiguous, PostgREST
refused the whole request, and the CreditOps partner tree rendered empty for
every folder while twenty live partners sat in the database. Nothing else could
have caught it.

### `npm run probe:sql`

Extracts every `.rpc()` call in `src/` and asks the live catalogue:

1. Does the name resolve to **exactly one** function? (Two = PostgREST refuses
   every call.)
2. Are the argument names ones that function actually takes?
3. Are all its **required** parameters supplied?
4. May `authenticated` execute it?
5. Is it reachable by `anon` or `PUBLIC` when it should not be?

Then, about the database itself: every cron job's target exists and is active;
every `SECURITY DEFINER` function in `public` pins `search_path`; no function
body contains a three-part `net.` name.

**Currently: 205 contracts, 0 failing, 3 skipped** (arguments assembled
elsewhere, so the names cannot be read from source).

Three deliberate exceptions are named in the script: `invitation_preview`,
`signature_request_preview` and `sign_document` are granted to `anon` because
they are token flows for people with no account. Adding a fourth should be a
decision somebody writes down.

## Live acceptance probes

Each runs **as real authenticated users**, inside transactions that are rolled
back. **Never as superuser** — a side-effect trigger without permission takes
the write down with it, and testing as the owner proves nothing about the agent.

```bash
node supabase/scripts/partner-messages-probe.mjs    # 14/14
node supabase/scripts/billing-probe.mjs             # 85/85
node supabase/scripts/marketing-module-probe.mjs    # 48/48
node supabase/scripts/creditops-routing-probe.mjs
node supabase/scripts/money-boundary-probe.mjs
```

Two traps these probes have already fallen into, and which you should watch for
when writing one:

- **Asserting "any failure" instead of on the message.** A refusal that happens
  for the wrong reason still passes. Assert on the error text.
- **Resolving an id under the caller's own RLS.** If the caller cannot see it,
  the id is null — and a function that refuses a null id refuses with the same
  wording as a real refusal. Resolve setup ids as the owner.

## The RLS matrix

```bash
node supabase/scripts/rls-matrix.mjs --phases=60,61    # targeted, ~34s
node supabase/scripts/rls-matrix.mjs                   # full, ~11 min
```

70 phases, ~1559 checks. Run targeted phases while developing; run the full
matrix before a security release. **Never push a migration while it is
running.** Throttled checks are re-run through the harness's back-off, never
counted as passes. **A gate at 1540/1559 is NOT a pass.**

## When you fix a bug

1. Fix the **smallest canonical cause**.
2. Add coverage **at the layer that could have caught it** — a unit test for a
   rule, a probe assertion for a runtime contract.
3. Record it in `docs/KNOWN-ISSUES.md` and `PILOT_ISSUES.md`.
4. Re-run the gate and report its **actual** numbers.
