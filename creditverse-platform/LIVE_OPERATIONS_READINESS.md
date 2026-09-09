# Live Operations Readiness

The launch checklist for the current sprint — Dee's priority change,
2026-09-08: **make BES Agency HQ functional enough for the real BES team to
start daily operations.** Only the five P0 areas belong in this file. Each
item is `PASS`, `FAIL`, `BLOCKED`, or `NOT REQUIRED`, and an item is PASS only
when a real operator can use it end to end — a page existing is not the bar.

Future work lives in `DEFERRED_AGENCY_WORK.md`. Doctrine lives in
`CURRENT_PRODUCT_DECISIONS.md`.

**Status: IN PROGRESS — audit pass not yet run.** Every UNTESTED row below is
exactly that: not yet walked as a real operator.

## 1 · Invite Users / real team access

| Criterion | State |
|---|---|
| Admin invites with role Agency Admin / Agency User | UNTESTED (UI updated to the two-role model 2026-09-08) |
| Invitation email actually delivered (Resend SMTP) | UNTESTED |
| Activation link is the production URL, not localhost | UNTESTED |
| Password creation and activation completes | UNTESTED |
| Membership active with correct team / department / scope | UNTESTED |
| Partner assignments give exactly the assigned partners | UNTESTED |
| Module access matches what was granted | UNTESTED |
| Duplicate email / expired invite / resend / revoke handled | UNTESTED |
| Login lands on the correct page | UNTESTED |

## 2 · Timer / My Time

| Criterion | State |
|---|---|
| Start / stop with correct user and date attribution | UNTESTED |
| Running timer survives refresh and re-login | UNTESTED |
| No accidental overlapping timers | UNTESTED |
| History persists; durations correct | UNTESTED |
| Timer time reaches EOD automatically | UNTESTED |

## 3 · CreditOps

| Criterion | State |
|---|---|
| Master statuses are Dee's locked ten, unchanged | PASS (locked; regression-tested) |
| Partner → Client → File path for an AUTHORIZED user | UNTESTED as a non-admin |
| Complete Work = recording + actions + handoffs, never status mutation | PASS by design (unit + matrix probes); UNTESTED live as agent |
| Parallel handoffs (no source close, no dest reset, no dup production) | PASS in matrix probes; UNTESTED live as agent |
| 1 file = 1 production unit; actions counted separately | PASS (probes + EOD panel) |
| Sticky client context while scrolling | PASS (existing; re-verify in agent pass) |

## 4 · EOD / Team EOD

| Criterion | State |
|---|---|
| Agent EOD derives production/actions/time automatically | PASS for production+actions; timer line UNTESTED |
| Manual fields only for what the system cannot know | PASS |
| Team EOD aggregates real members automatically | UNTESTED |
| Exceptions (absent/late/missing EOD) recordable | UNTESTED |
| Drill-down team total → agent → work | UNTESTED |
| Publishing to managers via Communication | DEFERRED unless trivially supported |

## 5 · BES CRM

| Criterion | State |
|---|---|
| Create project from purchased engines (13 published) | PASS (verified in browser; real "Test" project created by Dee) |
| Website-only / Sales / Fulfillment / Full / Custom presets | PARTIAL — engines selectable; named presets UNTESTED |
| Work units assigned to a real user, visible in My Work | UNTESTED |
| Complete & hand off; parallel next units | PASS in matrix probes; UNTESTED live as CRM user |
| QA pass/needs-fix loop | PASS in probes; UNTESTED live |
| Progress/journey/health derive automatically | PASS |
| CRM work reaches EOD automatically | PASS in probes; UNTESTED live |

## Cross-cutting gates

| Criterion | State |
|---|---|
| Access isolation: pilot personas see only their scope | PASS in RLS matrix (68 phases); UNTESTED through the real UI |
| No dead visible controls in the five areas | UNTESTED (sweep pending) |
| Production build deployed and smoke-tested | UNTESTED for this sprint |
| Full RLS matrix green at the release commit | RUNNING (post role-migration certification) |
