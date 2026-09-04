# Mutation performance diagnostic — measured

**Status: diagnosed, then fixed. Findings below are the BEFORE state; measured
results are at the end.**
Cold-load fixes were implemented separately — see `PERFORMANCE_DIAGNOSTIC.md`.

Measured against the live development database with a signed-in BES owner, on
the `[TEST]`-marked seed client `[TEST] Evan Ellis`, using `window.fetch`
interception (method, byte count, start/end offsets, per-call duration).

## The short version

Three patterns account for nearly all mutation latency, and none of them is the
write itself:

1. **A GoTrue round trip before the insert.** `currentUserId()` calls
   `supabase.auth.getUser()`, which is a **network call**, not a local read.
2. **Every mutation refetches the whole client list** — 13.2kb / 17 rows — no
   matter how small the change or whether the list is even on screen.
3. **Post Comment refreshes the timeline before the insert has landed**, so the
   comment does not appear. This is a correctness bug, not only a slow one.

---

## Per-action findings

### Complete Work / Log Production — **892ms, 4 calls**

```
4→303    (299ms)  GET  auth/v1/user           ← blocking, pure waste
303→617  (314ms)  POST production_logs        ← cannot start until the above returns
619→865  (246ms)  POST webhook_deliveries     ┐ parallel, fire-and-forget
619→892  (273ms)  GET  fulfillment_clients    ┘ 13.2kb, 17 rows
```

| Question | Answer |
|---|---|
| **1. Calls per click** | 4 (1 auth, 1 write, 1 signal log, 1 refetch) |
| **2. Sequential** | Stages 1→2→3 are strictly sequential. The auth call gates the write |
| **3. Auth re-resolved** | **Yes.** `currentUserId()` ([fulfillment-clients.ts:197](src/lib/data/fulfillment-clients.ts:197)) hits `/auth/v1/user` for an id `useAuth()` already holds in memory. **299ms = 34% of total** |
| **4. Could be one transaction** | The production insert is already single-statement. The activity event is written by a **database trigger**, so it is already atomic and idempotent — no round trip is spent on it |
| **5. UI waits for secondary work** | No — the form clears synchronously. Perceived latency comes from the list re-rendering afterwards |
| **6. Refetches whole lists** | **Yes.** `.then(invalidate)` invalidates `[queryKey,"clients"]` — the full 13.2kb list — to reflect a `production_logs` insert that does not change any client row |
| **7. Optimistic possible** | Yes, safely: production is append-only and the trigger writes the audit event server-side |
| **8. Production/EOD synchronous** | **No, and this is correct.** EOD reads `production_logs` on demand via `useEod`; nothing is written synchronously. This path is already right |
| **9. Duplicate mutation/refetch** | No duplicate write. One unnecessary refetch |
| **10. Loading state over-scoped** | No spinner is tied to it — the form resets immediately |
| **Biggest blocking call** | `GET auth/v1/user`, 299ms, on the critical path before the write |
| **Recommended fix** | Pass `employee_id` from the already-resolved `useAuth()` context and delete `currentUserId()`. **This is not a security change**: `production_logs_insert` already enforces `with check (employee_id = auth.uid() and is_staff_of(agency_id))`, so a forged id is rejected by the database. Then narrow the invalidation away from the client list. Expected: 892ms → ~320ms |

### Post Comment — **558ms, 3 calls, and the comment does not appear**

```
7→253    (246ms)  GET  activity_events        ← fires BEFORE the insert; returns stale rows
7→285    (278ms)  POST activity_events        ← the actual write
286→558  (273ms)  GET  fulfillment_clients    ← 13.2kb of the wrong data
```

| Question | Answer |
|---|---|
| **1. Calls per click** | 3 |
| **2. Sequential** | The clients refetch is sequential after the POST. The timeline GET races it |
| **3. Auth re-resolved** | No — `postNote` takes the actor from context. Correct |
| **4. One transaction** | Already one insert |
| **5. UI waits** | No — the box clears immediately |
| **6. Refetches unrelated data** | **Yes, and only unrelated data.** `postLiveNote` calls `.then(invalidate)`, which invalidates the **client list**. The timeline — the one thing that changed — is never invalidated after the write |
| **7. Optimistic possible** | Yes. `postNote()` does not `.select()` the created row, so there is nothing to append. Adding `.select().single()` returns the persisted record at no extra cost |
| **8. Derived work** | None |
| **9. Duplicate refetch** | The clients refetch is entirely wasted |
| **10. Loading state** | None |
| **🔴 Correctness defect** | `ClientWorkActivityTimeline` calls `timeline.refresh()` **synchronously**, immediately after `store.addActivity(...)` — which is fire-and-forget. The refetch beats the insert and returns the old rows. **Measured: the posted comment was absent from the DOM, and only appeared ~6s later** when the query went stale. The code comment says "the store writes optimistically", but `LiveProvider.activity` is hardcoded `[]` — there is no optimistic write to reconcile |
| **Recommended fix** | Make `postNote` return the created row (`.select().single()`), have `postLiveNote` return the promise, and append it to the timeline cache with `setQueryData`. Drop the clients invalidation. Expected: 558ms → ~280ms, one call, and the comment appears instantly and correctly |

### Status change — **1227ms, 4 calls**

```
27→593   (567ms)  PATCH fulfillment_clients   ← no .select(), returns nothing
27→857   (830ms)  GET   activity_events       ← concurrent timeline read
595→846  (251ms)  GET   fulfillment_clients   ← 13.2kb full-list refetch
595→1227 (632ms)  POST  webhook_deliveries    ← fire-and-forget, still on the wire
```

| Question | Answer |
|---|---|
| **1. Calls per click** | 4 |
| **2. Sequential** | PATCH → (refetch ‖ webhook). Two stages |
| **3. Auth re-resolved** | No |
| **4. One transaction** | Yes already — the activity event is trigger-written |
| **6. Refetches whole list** | **Yes**, 13.2kb, to apply one field change to one row |
| **7. Optimistic possible** | Yes — the new status is known before the write |
| **9. Duplicate** | No duplicate write |
| **Biggest blocking call** | The PATCH itself (567ms), which is RLS-evaluated. The 251ms refetch is avoidable |
| **Recommended fix** | `.update(...).select().single()` returns the updated row in the same round trip; write it into the list cache with `setQueryData` instead of invalidating. Expected: 1227ms → ~600ms |

### Agent assignment — **not measured; identical code path**

`updateAssignee` ([ops-client-store.tsx:588](src/lib/fulfillment/ops-client-store.tsx:588)) is
`backend.updateAssignee(...).then(invalidate)` — the same shape as `updateStatus`
minus the webhook. Expect 2 calls: one PATCH plus the 13.2kb list refetch. I could
not reach the assignment control from the list UI to measure it directly, so this
is traced from code, not from the wire.

### Notes / activity submission

Same path as Post Comment — `addActivity` maps to `postLiveNote`. Same finding.

---

## What is already correct

**The Time and EOD layer is the model the rest should follow.** `use-time.ts`
uses real `useMutation`, reads `userId` from `useAuth()` with no extra auth call,
and invalidates the *exact* affected key (`["eod","submission",userId,workDate]`)
rather than a broad list. Production, EOD and reporting are all **derived on
read** — nothing is written synchronously on Complete Work.

Audit is also right: activity events come from database triggers, so they are
atomic with the write, cannot be skipped by a client, and cost no round trip.

---

## Ranked mutation bottlenecks

| # | Problem | Cost | Fix |
|---|---|---|---|
| **1** | **Post Comment refetches the timeline before the insert lands** — the comment is missing for ~6s | Correctness, plus a wasted 13.2kb refetch of the wrong table | Return the created row; `setQueryData` into the timeline. Drop the clients invalidation |
| **2** | **`currentUserId()` makes a network auth call before every production insert** | **299ms, 34%** of Complete Work | Use the id from `useAuth()`. RLS already enforces `employee_id = auth.uid()` — no security change |
| **3** | **Every mutation invalidates the full 13.2kb client list** | ~250–275ms + 13.2kb on all five actions | `.select()` the mutated row and `setQueryData`; invalidate only what changed |
| **4** | **Writes do not return their row**, so a refetch is the only way to see the result | Forces #3 to exist at all | Add `.select().single()` to the status, assignee and note writes |
| **5** | **`webhook_deliveries` insert per status change** | 246–632ms of wire time; already fire-and-forget so it does not block | Correct as designed. Batch only if signal volume grows |

Fixing #1–#4 is contained to `ops-client-store.tsx`, `activity.ts` and
`fulfillment-clients.ts` — no schema change, no RLS change, no new layer.
Expected: Complete Work 892ms → ~320ms, Post Comment 558ms → ~280ms and correct,
status change 1227ms → ~600ms.

**Not implemented.** The implementation authorized in this task was
`PERFORMANCE_DIAGNOSTIC.md` priorities 1–5; these are reported for your decision.


---

# Results — after implementing the mutation fixes

Same method: fetch interception on the `[TEST] Evan Ellis` seed client, plus
direct database reads to confirm what was actually written.

## Measured

| Action | Calls | Wire time | Auth calls | Wasted refetch | Time to visible change |
|---|---|---|---|---|---|
| **Post Comment** | 3 → **1** | 558 → **357ms** | 0 → 0 | 13.2kb → **0** | **never** → **361ms** |
| **Complete Work** | 4 → **2** | 892 → **717ms** | 1 → **0** | 13.2kb → **0** | 617 → **367ms** |
| **Status change** | 4 → **3** | 1227 → **504ms** | 0 → 0 | 13.2kb → **0** | instant, from cache |
| **Agent assignment** | unchanged | — | — | — | — |

Payload per status change fell 15.1kb → 5.8kb. The remaining calls are the
write itself, the fire-and-forget webhook signal, and — on status change from a
list row — the timeline read caused by the row opening the workspace, which
happened before this work too.

**Assignment is still not reachable in live mode.** Neither division wires
`updateAssignee`, so `canAssign` is false and the control is not rendered. The
same `.select()` + cache-patch treatment was applied to that code path so it is
correct when a division does wire it, but nothing was measured because nothing
runs.

## Verified against the database, not the screen

| Check | Result |
|---|---|
| Posted note appears immediately | ✅ 361ms, correct `BES INTERNAL` badge, correct author and position |
| Note survives a page refresh | ✅ |
| Five rapid clicks on Post | ✅ **one** `activity_events` row |
| Three rapid clicks on Complete Work | ✅ **one** `production_logs` row |
| Production row correctness | ✅ department `Onboarding`, actions `["Client File Reviewed"]`, quantity 1 |
| `employee_id` populated from context | ✅ and accepted by RLS, which still checks `employee_id = auth.uid()` |
| Audit trail | ✅ trigger-written `Status changed` at `shared_with_partner`, notes at `bes_internal` |
| Status change persists | ✅ confirmed by re-reading `fulfillment_clients` |
| List reflects change with no refetch | ✅ returning to the list showed the new status with **0 requests** |
| EOD still derives on read | ✅ 3 units, live aggregation, nothing recalculated synchronously |
| Forced write failure | ✅ text kept, control restored, error shown, **no phantom timeline entry** |
| Retry after failure | ✅ one POST, composer clears, error clears |

## What changed

| Fix | Where |
|---|---|
| `postNote` returns the persisted row (`.select().single()`), so the timeline gets the real record — id, `created_at`, visibility — instead of a refetch | `lib/data/activity.ts` |
| `timelineKey()` is exported, so the reader and the writer name the same cache | `lib/data/activity.ts`, `lib/data/use-timeline.ts` |
| `postLiveNote` awaits the write, then `setQueryData`s the row into the timeline. No client-list invalidation | `lib/fulfillment/ops-client-store.tsx` |
| The racing `timeline.refresh()` after a fire-and-forget write is gone | `ClientWorkActivityTimeline.tsx`, `FundingOpsActivityTimeline.tsx` |
| Status / assignee / contact writes return the updated row; `patchClient` replaces that one row in the cached list. Every queue filters that same array, so all queues update with no request | `fulfillment-clients.ts`, `funding-clients.ts`, `ops-client-store.tsx` |
| `logProduction` takes `employeeId` from the resolved session — the `auth/v1/user` round trip is gone | `fulfillment-clients.ts`, `ops-client-store.tsx` |
| Composer and Complete Work: pending state, disabled control, content kept on failure, error surfaced | `OpsActivityTimeline.tsx`, `CompleteWorkSection.tsx` |
| `handled()` keeps rejections reachable for awaiting callers while preventing unhandled rejections for the rest — one place, no call-site churn | `ops-client-store.tsx` |

## Two things worth flagging

**The double-submit guard had to be a ref, not state.** My first attempt used
`isSubmitting` state and *failed the measurement*: three rapid clicks still
produced three inserts, because React state is not applied synchronously and
every click dispatched before the next render read the stale `false`. The
guard is now a ref, flipped on the current tick. The test pins it and fails
with "expected 1 times, but got 3 times" if the ref is removed.

**Production is not idempotent at the database level, and this does not make
it so.** The guard is client-side. There is no natural idempotency key — the
same agent may legitimately work the same file twice in a day — so a genuinely
idempotent write would need a client-generated request id column and a unique
index. Out of scope here; recorded rather than pretended.

## Deliberately unchanged

`currentUserId()` still makes its network call for `created_by` on client
creation. Unlike `employee_id`, **no policy constrains `created_by`** — there is
no `created_by = auth.uid()` check anywhere — so a client-supplied value could
forge who created a record (rules 4 and 10). Removing that round trip safely
needs a `default auth.uid()` on the column plus a matching check, which is a
schema change. A comment in both data modules records this so it is not
"optimized" away.

## Security

**No RLS change, no policy change, no migration.** `verify-live.mjs` passes all
checks. `.select()` after insert is itself RLS-gated and cannot leak: the
`activity_events` insert policy's first conjunct is `can_view_activity(...)`,
so a row that may be written may be read back — and one that may not, is not.

## Regression gate

Typecheck clean · 200 tests / 20 files · lint 0 errors, 77 warnings (baseline) ·
build succeeds · no circular dependencies · live security verification passes.

Five new tests in `ops-composer-mutation.test.tsx` count mutation invocations
and assert what survives a rejection, rather than asserting on spinner markup
which would still pass if the duplicate write returned.

## Test artifacts

The measurements wrote real rows to the dev database on the `[TEST] Evan Ellis`
client: several `[perf-after]` notes, two production logs and a few status
changes. Three of those notes are duplicates from the run that *proved* the
double-click defect before it was fixed. `activity_events` is append-only by
design, so they stay.
