# CreditOps

BES's credit-repair fulfillment module. **Strictly defined** — the customer does
not configure it, because its correctness depends on a fixed domain model. This
is the deliberate exception to "everything runs on `work_items`".

## Three surfaces, three different questions

| Surface | Question it answers | Source |
|---|---|---|
| **Main Client List** | Who are all our CreditOps clients? | `fulfillment_clients`, all of them |
| **Department Queues** | What does *this department* have to do? | `client_department_statuses` |
| **My Work** | What is *assigned to me* and actionable right now? | `client_department_statuses.assigned_to` |

**The Main Client List shows every CreditOps client to every authorized
CreditOps staff member.** It is a directory, not a queue. Narrowing it would
stop somebody answering a question about a client who is not theirs, which is
not what BES wants.

**Department Queues are department work, narrowed by Partner scope.** Someone
assigned to Partner A's account does not see Partner B's clients in the Dispute
queue.

**My Work is personally assigned, actionable work only.** Not "clients I can
see" and not "everything in my department". If it is waiting on somebody else,
it is not My Work.

## `client_department_statuses` is queue membership

This is the fact most often gotten wrong.

```
fulfillment_clients.status            the client's OVERALL credit status
client_department_statuses            which department queues they are IN
```

**The overall Credit Status is NOT queue membership.** A client can carry
`Round Sent - Awaiting Results` as their credit status while sitting in the
Support queue for a billing question. One row per (client, department); the
department's queue is its rows.

## Routing — the workflow assigns the work

`creditops_status_routing` decides where a status change sends a client. It is a
**table**, not code, so BES can change the routing without a deploy.

| Column | Meaning |
|---|---|
| `status` | the credit status that triggers this rule |
| `department` | which department's queue it enters (null = no queue) |
| `kind` | `actionable` · `waiting` · `terminal` · `partner_action` |
| `entry_status` | the department status it enters with |
| `closes_department` | a department this status CLOSES (sequential close) |

The current routing, live:

| Status | → Department | Kind |
|---|---|---|
| `NEW ONBOARDING`, `New Client`, `Onboarding` | Onboarding | actionable |
| `INCOMPLETE ONBOARDING` | Onboarding | actionable |
| `Ready for Processing`, `In Processing`, `Prio Processing`, `Ready for QA`, `Ready for Round 1` | Dispute | actionable |
| **`Round Sent - Awaiting Results`**, `In Dispute` | Dispute | **waiting** |
| `SUPPORT NEW`, `Attention`, `ONBOARDING FOLLOWUP`, `MONITORING ISSUE`, `BILLING ISSUE`, `ESCALATED TO MANAGEMENT`, `On Hold (Non Workable)` | Support | actionable |
| `WAITING CLIENT RESPONSE`, `Awaiting Response` | Support | **waiting** |
| **`READY FOR REIMPORT`**, `Ready for Reimport / Review`, `Ready For Reimport/ Credit Update` | **Support** | actionable, **closes Dispute** |
| `LETTERS PENDING`, `LETTERS MAILED`, `CFPB FILED`, `FTC FILED`, `For Complaints` | Complaints | actionable |
| `BC NEEDED`, `BC IN PROGRESS` | Bureau Calling | actionable |
| `SUPPORT RESOLVED`, `CM COMPLETED`, `BC COMPLETED`, `BC NOT NEEDED` | — | terminal |
| `Completed`, `Graduated`, `Archived` | — | terminal |
| **`For Partner Confirmation`**, `Waiting for Partner Approval` | — | **partner_action** |

Things to take from that table:

- **Ready For Reimport / Credit Update is Client Success / Support**, not
  Dispute — and it **closes** the Dispute department. That is the sequential
  close: moving forward in the workflow ends the previous department's
  involvement rather than leaving a stale queue row.
- **Round Sent / Awaiting Results is `waiting`** — the client is in the Dispute
  department but there is **no active assignee** and it is not in anybody's My
  Work. Nobody is idle on it; the bureaus are.
- **For Partner Confirmation is `partner_action`** — it leaves BES's queues
  entirely and becomes a `partner_action_items` row the Partner answers in their
  portal. See `docs/PARTNER-PORTAL.md`.

## Assignment

- **Department-level** assignment routes work to a department; `in_scope()` and
  partner assignment decide who in that department may see it.
- **Support individual assignment is Team Lead-controlled.** A Support agent
  does not self-assign; the lead distributes. Team surfaces follow
  `team_memberships.is_lead`.
- Historical attribution does not change when assignments change. Who did the
  work then stays who did the work.

## SLA

SLA is per department-status, swept hourly by `sla_sweep()` (see
`docs/BACKGROUND-JOBS.md`). A breach raises **Attention**, it does not reassign
anything — a machine deciding who should now own a late file is not a decision
BES wants made automatically. Design: `CREDITOPS_SLA_DESIGN.md`.

**Raw SLA numbers are internal.** A Partner never sees them.

## Billing suspension

When a Partner is suspended for nonpayment, their clients' work **leaves the
active queues** — it does not get deleted, archived or reassigned. Reactivation
puts it back. Nothing is lost, and the partner is told so in as many words: the
reminder emails say plainly that nothing is deleted.

The mechanics are in `docs/BILLING.md`; the rule here is that **suspension is a
queue-visibility change, never a data change.**

## Notes & Instructions

Lives on the **Work** tab, saved to `fulfillment_clients.description`, editable
by authorized CreditOps staff, read-only for everyone else, and shown even when
empty. It supports **@mentions** using the same rich-text model as activity
notes. Do not move it to Client Info: it is instruction about the work, not a
fact about the person.

## Verification

```bash
node supabase/scripts/creditops-routing-probe.mjs
```
