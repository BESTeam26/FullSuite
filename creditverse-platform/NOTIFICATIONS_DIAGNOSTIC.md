# Notifications, badges and task-count integrity — diagnostic

> **HISTORICAL. Read for the reasoning, not for the current state.**
> Written 2026-09-04, when there was no notification system at all. There is
> one now: `notifications` (migration 0005), recipient rules by trigger on
> `activity_events` (0005/0006), and mention, direct message, handoff,
> announcement and attention added in 0218. The badge and the list are the
> same table under the reader's own row-level security. Migration 0218's own
> header records what was still missing on 2026-09-08 and what a live probe
> found; the register's N-2 row records the outcome.
>
> One thing this diagnostic could not have predicted, kept here because it is
> the same lesson: the page stayed unreachable for days AFTER the engine
> shipped, because `/app/notifications` was still flagged
> `locked_not_ready` — so the route guard refused the URL the Topbar bell
> pointed at. A surface can be real and still be unreachable.

**Diagnosis only. Nothing was changed at the time.** Measured against the live database and
the running app, with per-user checks run by impersonating each test user's JWT
inside a rolled-back transaction so Postgres evaluated the real policies.

## The finding that explains everything else

**There is no notification system.** No `notifications` table, no recipient
table, no read state, no mention model — none of the 29 public tables is
notification-related, and no migration has ever created one.

So the notification surfaces are not *wrong*: they are **fabricated**. The
badge is the literal `3`. The list is a six-item array in `HqPages.tsx`. They
agree only because two hand-written literals happen to match, and they are not
connected to each other, to the database, or to the signed-in user.

That reframes the recipient rules you listed. None of them is *violated* today —
none is *implemented*. Nothing is routed to anyone, because nothing is routed.

## Surface inventory

| Surface | Source | Real? | Scoped to user? | Clickable? |
|---|---|---|---|---|
| Sidebar → Notifications `3` | literal in `Sidebar.tsx:103` | ❌ hardcoded | no | n/a |
| `/app/notifications` list | array literal in `HqPages.tsx:232` | ❌ hardcoded | **no** | ❌ inert `<div>` |
| Topbar bell | `<button>` with no handler; a permanently green dot | ❌ | no | ❌ no `onClick` |
| Sidebar → My Work `2` | `agencyWork` = `seedWorkItems` | ❌ seed | **no** — counts everyone's | n/a |
| Sidebar → Attention (absent) | same seed, `Attention\|Blocked` → 0 | ❌ seed | no | n/a |
| Sidebar → Sub-Accounts `10` | live `organizations` | ✅ live | RLS | n/a |
| `/app/my-work` page | `useMyWork` → `work_items where assigned_to = me` | ✅ live | ✅ by assignment | ❌ inert table |
| `/app/attention` page | `useAttention` → `work_attention` view | ✅ live | RLS only | ❌ inert |
| `/app` dashboard attention cards | `useAttention`; 3 live, 4 placeholder | ✅ mixed, **honestly labelled** (`—` for placeholders) | RLS only | ✅ but only to `/app/attention` |
| CreditOps partner tree counts | `seedFulfillmentClients` filtered by live scope id | ❌ seed | no | n/a |
| Settings → notification toggles | `checked` hardcoded, `onChange={() => {}}` | ❌ | no | ❌ no-op |

---

## 1. Correctness and security defects

### 1.1 🔴 Placeholder surfaces have no authorization, and they carry cross-organization content

`RequireAuth` checks only *signed in* and *has any membership*. **There is no
agency-only route guard anywhere in `App.tsx`** — the 11 guards that exist are
`RequireEntitlement` (product gating), not role gating.

Notifications is merely absent from the customer sidebar. Rule 1: *never rely
on hidden UI for security.* Any organization user who navigates directly to
`/app/notifications` gets the full BES-flavoured list, which includes
`"Apex Credit Co. upgraded to Full Suite"` and
`"Pioneer Credit Solutions added 12 new clients"` — other customers' commercial
facts.

**Nothing real leaks today, because the rows are fiction.** But the hole is
leak-shaped: the moment this surface is wired to data, it serves whatever it
fetches to whoever asks. This is the single most important thing to fix before
the feature is built, not after.

*Verified by reading the route table and `RequireAuth`; not by a signed-in
organization session, since that needs a password I do not use.*

### 1.2 🔴 Every BES agent sees every escalation, regardless of assignment

Measured by impersonation:

| User | Work items visible | Actually assigned to them | Attention items shown |
|---|---|---|---|
| `bes.owner` (owner) | 10 | 0 | 6 |
| `bes.credit` (agent) | 10 | 1 | 6 |
| **`bes.restricted`** (agent, assigned nothing) | **10** | **0** | **6** |
| `org.owner` (Lakeside) | 1 | 0 | 0 |
| `org2.owner` (Northgate) | 1 | 0 | 0 |

Tenant isolation holds — organizations see only their own. What does not exist
is **person-level scope**: an agent with nothing assigned still sees the whole
agency's blocked and overdue work, including organizations they have no
relationship with. This is the known Team + Assignment Scope gap
(`ARCHITECTURE_PROPOSAL_TEAM_SCOPE.md` §2), and it is what makes
*"responsible user plus authorized escalation recipient"* unimplementable today:
there is no way to say who is responsible, so there is no one to notify.

### 1.3 🟡 Two different components are both named `AttentionCenter`

`pages/app/HqPages.tsx:58` (routed at `/app/attention`, inert) and
`components/dashboard/agency/AttentionCenter.tsx:63` (the dashboard panel,
clickable). Same name, different behaviour, both live. Rule 6.

---

## 2. Count mismatches — measured in the running app

`COUNT(scope)` must equal `LIST(scope)`. It does not, on three of four surfaces.

| Surface | Badge says | Page says | Cause |
|---|---|---|---|
| **My Work** | **2** | **0** — "Nothing assigned to you right now" | Badge counts seed AGENCY work, unfiltered by user; page queries `assigned_to = me` |
| **Attention Center** | **no badge** (0, so hidden) | **6** — Blocked 3, Overdue 3 | Badge counts `Attention\|Blocked` in 4 seed rows (0 match); page reads the live `work_attention` view |
| **Notifications** | **3** | 6 items, 3 styled unread | Two unrelated literals |
| **CreditOps tree** | every partner **0**, header **"0 active"** | **17 clients** in the list | `countActiveForPartner` filters `seedFulfillmentClients` by a *live* partner UUID; seed rows carry invented scope ids, so every match is empty |
| Sub-Accounts | 10 | 10 organizations | ✅ correct — the one badge reading live data |

The Attention mismatch is the dangerous direction: **the badge silently reads
zero while six items are overdue or blocked.** A badge that under-reports
urgency to nothing is worse than no badge.

The CreditOps case is the clearest to fix: the count and the list are in the
same component tree, and `fulfillment_clients` (17 rows) is already fetched in
that same page load. The number simply is not derived from the array that is
already in hand.

Where the doctrine *is* already honoured: `useAttention` computes its counts as
`tally(items)` from the very array it returns, so the page's own header and
list can never disagree. That is the pattern the rest should adopt.

---

## 3. Missing deep links

Nothing in the notification or task surfaces is actionable.

- **Notifications** — plain `<div>`s. No entity type, no entity id, no route,
  no `onClick`. The text `"New work order WO-9045 assigned to you"` names a
  record that does not exist in the database.
- **`/app/attention`** — 0 links and 0 buttons in the main region (measured).
  Dashboard card → `/app/attention` → dead end.
- **`/app/my-work`** — renders a table with no row handler.
- **Topbar bell** — no `onClick`, and the green dot is unconditional, so it
  signals "unread" permanently.
- **All three live dashboard cards** route to `/app/attention`, never to a record.

**Linkage data is nearly there but not sufficient.** `work_items` has
`related_type` (populated on all 10) and `related_ref` — but `related_ref` is
free **text, not a foreign key**, and is null on 3 of 10 rows. There is also no
route that resolves a work item; the only detail route is `clients/:id`. A deep
link therefore needs both a resolver per `related_type` and a decision about
the 30% with no reference.

---

## 4. Placeholder and hardcoded surfaces

| Location | What is fake |
|---|---|
| `Sidebar.tsx:103` | `badge: 3` |
| `HqPages.tsx:232` | the entire notification list |
| `agency-context.tsx:208` | `workItems = seedWorkItems`, never replaced by a query, and the source of two badges |
| `CreditOpsTreeSidebar.tsx:62` | `countActiveForPartner` over seed clients |
| `Topbar.tsx:78` | bell + permanent dot |
| `PlatformSections.tsx:150` | in-app / email notification toggles, `onChange={() => {}}` |

The dashboard is the honest exception: placeholder cards render `—` rather than
a fabricated number, and pages carry a `LIVE` badge. Extend that discipline
rather than replacing it.

---

## 5. Performance — healthy, and not the problem

Measured in the browser:

- `/app` dashboard: **1** request (`work_attention`), no duplicates.
- `/app/my-work`: **1** request (`work_items`).
- `/app/creditops`: 5 parallel requests, no duplicates.
- **No polling** — zero `refetchInterval`, zero `setInterval`.
- **No realtime listeners** — no `.channel()` or `.subscribe()` anywhere.
- **No N+1** — `work_attention` is one view read; there is no recipient fan-out
  to be N+1 about, because there are no recipients.
- Count/list dedupe works: `AgencyDashboard` and the attention panel share
  `["work","attention"]`, so one request serves both.

Two minor inefficiencies, worth noting but not urgent:

1. Badges that *are* live would fetch full rows to produce a number
   (`limit 100/200/500`). Fine at 10 rows; at scale a count-only query is right.
2. The seed-backed badges cost nothing precisely because they fetch nothing —
   the performance is good for the wrong reason.

**No performance work is warranted here.** The defects are correctness ones.

---

## 6. Architecture gaps

| Gap | Consequence |
|---|---|
| **No notification/recipient/read-state model** | No unread badge is possible; "mark read" has nothing to write |
| **No mention model** | `Mention → mentioned authorized user` cannot be built; the composer stores a structured body, so mentions have a natural home as a node type, but nothing parses one |
| **No Team + Assignment Scope** | Blocks *responsible user*, *escalation recipient*, and division-scoped recipients. Every escalation is currently addressed to everyone |
| **`related_ref` is text, nullable** | Deep links cannot be resolved reliably (3/10 rows have none) |
| **No agency-only route guard** | Placeholder surfaces are reachable by any signed-in user |
| **No division field on `work_items`** | `CreditOps event → CreditOps recipients only` has nothing to filter on. `production_logs.division_id` exists as free text; `work_items` has none |
| **Engagement gating is per-record, not per-recipient** | `bes_may_fulfil` decides who may *read a record*; there is no equivalent for who should be *told about it* |

### What is blocked by Team + Assignment Scope specifically

- `Task assigned → assigned user` — possible now (`assigned_to` exists).
- `Task reassigned → new assignee` — possible now; the trigger already writes an
  `Assignee changed` activity event.
- `Overdue/SLA → responsible user **plus authorized escalation recipient**` —
  **blocked.** "Responsible" is derivable from `assigned_to`; "authorized
  escalation recipient" needs the team/lead/manager hierarchy that does not exist.
- `CreditOps event → CreditOps recipients only` — **blocked.** No division on
  work items and no division membership on `agency_memberships`.
- `TalentOps → workspace scope` — **blocked.** No workspaces (that proposal is
  also unbuilt).

---

## 7. Ranked, and the smallest centralized fix

**Order matters: 1 and 2 are cheap and stop the app lying today. 3–5 are the
feature.**

| # | Fix | Size | Why first |
|---|---|---|---|
| **1** | **Delete the fake surfaces.** Remove `badge: 3`, the hardcoded notification list, the dead bell, and the no-op settings toggles. Show "No notifications" honestly | very small | Removes the false unread signal, the cross-organization placeholder text and the unguarded surface in one stroke. Nothing of value is lost — none of it is real |
| **2** | **Make every badge read its page's own hook.** `Sidebar` should call `useMyWork()` and `useAttention()`, not `agencyContext.agencyWork`; `CreditOpsTreeSidebar` should count the `clients` array the store already holds | small | Makes `COUNT == LIST` structurally true rather than by convention. Fixes all four mismatches at their single shared cause: badges reading seed while pages read the database |
| **3** | **Add an agency-only route guard** beside the existing `RequireEntitlement` | small | Closes the hidden-UI-as-security hole before any surface is wired to data |
| **4** | **Make items actionable.** One `workItemHref(item)` resolver plus a work-item detail route; give `related_ref` a typed resolution and decide the null case | medium | Turns Attention and My Work from read-only lists into a queue people can work |
| **5** | **Then build notifications properly** — one `notifications` table (recipient, entity_type, entity_id, read_at, agency/org, visibility), written by the same database triggers that already write `activity_events`, with RLS `recipient_id = auth.uid()`. Badge = `count(*) where read_at is null`; list = the same query. One canonical source, no second counter | large | Only worth doing after 1–3, and its recipient rules stay partial until Team Scope lands |

**Do not** patch the badges individually — all four mismatches share one cause
(`agency-context` serving seed work items to the chrome while the pages query
the database), and fixing that one seam fixes them together.

**Recommended now:** items 1–3. They are small, they remove active
misinformation, and none of them depends on Team Scope. Item 5 should wait for
Team + Assignment Scope, or it will need re-doing when recipients become
scopeable.
