# Live Operations Readiness

The launch checklist for the current sprint — Dee's priority change,
2026-09-08: **make BES Agency HQ functional enough for the real BES team to
start daily operations.** Only the five P0 areas belong in this file. Each
item is `PASS`, `FAIL`, `BLOCKED`, or `NOT REQUIRED`, and an item is PASS only
when a real operator can use it end to end — a page existing is not the bar.

Future work lives in `DEFERRED_AGENCY_WORK.md`. Doctrine lives in
`CURRENT_PRODUCT_DECISIONS.md`.

**Status: IN PROGRESS.** Updated 2026-09-08 late evening — several rows moved
by DEE'S OWN live usage, which is the best possible tester. UNTESTED rows have
not yet been walked by a real operator.

## 1 · Invite Users / real team access

| Criterion | State |
|---|---|
| Admin invites with role Agency Admin / Agency User | UNTESTED (UI updated to the two-role model 2026-09-08) |
| Invitation email actually delivered (Resend SMTP) | UNTESTED — keys + SMTP configured and verified server-side; needs one real mailbox |
| Activation link is the production URL, not localhost | PASS — links are pinned server-side to the production origin (send-invitation/send-welcome); Supabase auth site URL and allowlist verified |
| Password creation and activation completes | UNTESTED |
| Membership active with correct team / department / scope | UNTESTED |
| Partner assignments give exactly the assigned partners | UNTESTED |
| Module access matches what was granted | UNTESTED |
| Duplicate email / expired invite / resend / revoke handled | UNTESTED |
| Login lands on the correct page | UNTESTED |

## 2 · Timer / My Time

| Criterion | State |
|---|---|
| Start / stop with correct user and date attribution | PARTIAL — clock-in verified; a WEEK-BOUNDARY DEADLOCK was found live (invisible unstoppable Sat timer) and fixed; Dee's stale Sat 1:08 PM timer awaits her stated stop time |
| Running timer survives refresh and re-login | PASS by construction (open entry now fetched unbounded); full walk after the stale entry is closed |
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
| Team EOD aggregates real members automatically | PASS — real roster only (fixtures excluded); 2 humans shown, submissions joined |
| Exceptions (absent/late/missing EOD) recordable | UNTESTED |
| Drill-down team total → agent → work | UNTESTED |
| Publishing to managers via Communication | DEFERRED unless trivially supported |

## 5 · BES CRM

| Criterion | State |
|---|---|
| Create project from purchased engines (13 published) | PASS — Dee created "Test" live |
| Website-only / Sales / Fulfillment / Full / Custom presets | PARTIAL — engines selectable; named presets UNTESTED |
| Work units assigned to a real user, visible in My Work | PASS — assignee select on the board writes canonical assigned_to; verified live into My Active Work Items |
| Complete & hand off; parallel next units | PASS — Dee completed two units live; dependants auto-derived READY |
| QA pass/needs-fix loop | PASS in probes; UNTESTED live |
| Progress/journey/health derive automatically | PASS — live: 15% · building · on-track after Dee's two completions |
| CRM work reaches EOD automatically | PASS — both of Dee's units appeared on her EOD untouched |

## Cross-cutting gates

| Criterion | State |
|---|---|
| Access isolation: pilot personas see only their scope | PASS in RLS matrix (68 phases); UNTESTED through the real UI |
| No dead visible controls in the five areas | PASS on sweep (no coming-soon/placeholder/dead buttons found); the pilot walk is the final judge |
| Production build deployed and smoke-tested | PARTIAL — deploys pushed; production serves the new shell; full smoke with a signed-in walk pending |
| Full RLS matrix green at the release commit | PASS at the role migration (all 68 phases; 13 stale probes updated to the new rules and re-run green). A fresh full run accompanies the READY declaration |


## Fixed during the audit (2026-09-08 evening)

- **Timer week-boundary deadlock** — a running clock left across the week
  start became invisible and unstoppable while blocking every new clock-in.
  The open entry is now fetched unbounded, and a stale timer asks the person
  when they actually stopped instead of promising an edit that did not exist.
- **CreditOps case Overview showed the SAMPLE data on live clients** — scores
  (+57, 654/660/635), a five-round journey, fake results/notifications/
  checklist, a hardcoded agent and affiliate, and "Round 5 · 32 deletions" on
  a client with no imported report. The tab now renders the client's own
  reports or an honest empty state, and the live snapshot shows only derived
  facts (rule 12).
- **Invite links pinned server-side** to the production origin.
- **EOD row labels** distinguish "Client file" from "Partner work unit".
