# CreditOps SLA and operational dates — design, locked by Dee 2026-09-11

**Status: SPECIFIED, NOT BUILT.** Recorded so it never has to be re-explained.
The active build is the ClickUp importer; this is next.

---

## The core principle, in Dee's words

> The workflow should drive the dates automatically. Agents should make
> business actions, not manage database fields. Keep the complexity in the
> backend and give agents the simplest possible operational interface.

---

## 1. What exists today — the inspection

| Where | Date fields |
|---|---|
| `fulfillment_clients` | **`due_at`** (the only due date), `last_activity_at`, `program_started_on`, `created_at` |
| `client_department_statuses` | **only `updated_at`** — a queue has no anchor |
| `work_items` | `due_at`, `completed_at`, `qa_reviewed_at` |
| `dispute_rounds` | `opened_at`, `closed_at` |
| `dispute_timers` | `due_at`, `satisfied_at`, `kind` — keyed to a **letter**, not a client, **0 rows**, unused |

**Missing:** mailed date, processing date, last action date, reimport due,
support opened, complaint opened. Every anchor the rules need.

**What produces the SLA today:** one line —
`src/lib/data/fulfillment-clients.ts:87`, `slaHoursRemaining: hoursUntil(row.due_at)`,
rendered as `{n}h`. That is the `902.4h`.

**There is no SLA rule anywhere in the system.** No policy, no anchor, no
recomputation. Whatever sits in `due_at` *is* the SLA — and for the ClickUp
imports that is the ClickUp due date, which is the stale math to remove.

**Where due dates belong:** today, one column on the client. That is the flaw.
The rules are **per queue** — a client can be in Complaints (5 days) and
Dispute (30 days) simultaneously, and one column cannot hold both.
`client_department_statuses` is the right home; it has no date fields yet.

`dispute_timers` already models the right shape (`kind`, `due_at`,
`satisfied_at`) with kinds `reinvestigation · furnisher_notice ·
results_notice · reinsertion_watch`. The FCRA 30-day clock it was built for IS
the dispute SLA. Extend that idea rather than invent a third timer concept —
but it touches locked dispute logic, so confirm before changing it.

---

## 2. The rules

| Queue | Anchor | Due |
|---|---|---|
| **Dispute — mailed** | mailed date | **+30 days**, waiting state |
| **Support** | case opened | **+24 hours** (elapsed, unless the SOP says business hours) |
| **Complaints** | complaint opened | **+5 days** |
| **Reimport / review** | mailed date | around the 30-day mark; historically worked 30–35 days |

Calculated in the **database**, so the table, dashboard, Attention Center, My
Work, notifications and reports cannot disagree. Never display math in React.

---

## 3. In Dispute + Mailed — the behaviour

1. record the mailed date
2. due = mailed + 30 days
3. move to a waiting state
4. **automatically unassign the processing agent**
5. preserve the previous assignment for audit
6. exclude from active agent work while waiting
7. resurface when the 30 days arrive, **as Unassigned**

> "I do NOT want agents holding assignments for 30 days on work they cannot
> act on."

**Never removed:** the Partner relationship, team/partner visibility, and the
Lead Account Manager. Only the temporary operational agent assignment clears.
Returning work is **not** auto-assigned to the old processor — the Team Lead
rebalances.

---

## 4. The agent interface — deliberately small

Agent-facing CreditOps shows only:

**Current Department · Work Status · Assigned Agent · Due Date · SLA**

```
Dispute      Waiting for Reimport   Unassigned   Oct 10   29d remaining
Support      Needs Response         Jezel        Sep 12   6h remaining
Complaints   CFPB Needed            Ivan         Sep 16   Overdue 1d
```

Agents never see, and never choose: SLA type, `system_due_at`, queue timer,
timer kind, `manual_due_at`, calculation source.

### Agent actions are business actions

| Agent clicks | System does |
|---|---|
| **Mark as Mailed** | mailed date = now · waiting · due +30d · unassign processor · drop from active work |
| **Support Case** | opened = now · due +24h · SLA shown |
| **FTC Needed** / **CFPB Needed** | open Complaints queue · record start · due +5d |

One click each. Never four fields.

---

## 5. Team Lead / Admin — the advanced door

A separate **Adjust Dates / SLA** panel, not in the agent workflow, holding
mailed date, opened dates and a due-date override.

An override must: record who and when, **preserve the system-calculated date
separately**, and mark the record `Manual Override`. No silent date edits that
destroy the original SLA logic.

Enforced by database functions and policies, not only the UI. Agents work
assigned clients and update allowed work/status fields; they cannot rewrite
SLA anchors or overrides.

---

## 6. Table

Default columns: **Client · Credit Stage · Status · Current Department · Work
Status · Assigned Agent · Due Date · SLA.**

Technical dates live under the Columns control, for Team Leads and Admins.
Quick edit on dates for authorized users only — not every cell for everyone.

---

## 7. SLA display

Never `902.4h`. Show `29d remaining` · `6h remaining` · `Due today` ·
`Overdue 2d` · `Waiting until Oct 10`. Raw hours stay internal for sorting and
reporting. State colours: on track · due soon · due today · overdue · waiting.

---

## 8. Attention Center and My Work

**My Work:** only actionable assigned work. Waiting clients must not inflate an
agent's active-work count.

**Attention Center:** overdue support, overdue complaints, reimport/review due,
missing mailed date, missing required anchor dates.

---

## 9. Imported ClickUp dates

Keep as provenance. Once FullSuite has the anchor, **FullSuite's calculation
wins** — `indispute - mailed` with a known mailed date means due = mailed + 30
days, not whatever sat in ClickUp.

---

## 10. Audit

Audit anchor changes, manual overrides, auto-unassignment, queue transitions,
and meaningful recomputation. **Do not** write an event as remaining time
ticks down — a countdown is not history.

---

## 11. Acceptance tests

1. In Dispute + Mailed, mailed Sep 1 → due Oct 1 by exact date arithmetic
2. processing agent cleared on entering waiting
3. Partner assignment intact
4. waiting client excluded from active agent workload
5. due client resurfaces actionable and unassigned
6. Support due = opened + 24h
7. Complaint due = opened + 5 days
8. changing the mailed date recalculates
9. manual override preserves the system date separately
10. unauthorized agent cannot change an anchor or override
11. overdue display correct
12. My Work excludes waiting clients
13. Attention Center includes overdue and due-soon
14. an imported ClickUp due date does not override canonical SLA once the
    anchor exists
