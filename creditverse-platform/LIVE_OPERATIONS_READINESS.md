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

> **Pilot observation mode from 2026-09-10.** Every "PASS" below that a real
> operator has not walked is AUTOMATED PASS + UNTESTED LIVE. Live results and
> defects are tracked in `PILOT_ISSUES.md`; a gate turns LIVE VERIFIED only
> when the named real operator confirms it.

## 1 · Invite Users / real team access

| Criterion | State |
|---|---|
| Admin invites with role Agency Admin / Agency User | PASS — walked live: invite created with role Agency User |
| Invitation email actually delivered (Resend SMTP) | PASS (send side) — Resend accepted a live send end to end ("Invitation sent"); inbox receipt still needs a real mailbox |
| Activation link is the production URL, not localhost | PASS — links are pinned server-side to the production origin (send-invitation/send-welcome); Supabase auth site URL and allowlist verified |
| Password creation and activation completes | UNTESTED LIVE |
| Membership active with correct team / department / scope | UNTESTED LIVE |
| Partner assignments give exactly the assigned partners | UNTESTED LIVE |
| Module access matches what was granted | UNTESTED LIVE |
| Duplicate email / expired invite / resend / revoke handled | PASS — duplicate refused (probe), pending list + Copy link + revoke walked live, malformed/dead token page is honest and helpful |
| Login lands on the correct page | UNTESTED LIVE |

## 2 · Timer / My Time

| Criterion | State |
|---|---|
| Start / stop with correct user and date attribution | PASS — walked live: clock in → refresh (still running) → clock out → 1m recorded. Dee's Saturday timer was auto-stopped at the 10-hour cap with a notification |
| Running timer survives refresh and re-login | PASS — verified live across a reload |
| No accidental overlapping timers | PASS — DB unique index; second clock-in inside the cap refused (probe); a stale one self-heals instead of blocking |
| History persists; durations correct | PASS — entry listed with duration after clock-out; auto-stopped entries capped at exactly 600 minutes and badged |
| Timer time reaches EOD automatically | PASS by wiring (EOD minutes band reads the same entries); visible on the next worked day |

## 3 · CreditOps

| Criterion | State |
|---|---|
| Master statuses are Dee's locked ten, unchanged | PASS (locked; regression-tested) |
| Partner → Client → File path for an AUTHORIZED user | UNTESTED LIVE as a non-admin |
| Complete Work = recording + actions + handoffs, never status mutation | PASS by design (unit + matrix probes); UNTESTED LIVE as agent |
| Parallel handoffs (no source close, no dest reset, no dup production) | PASS in matrix probes; UNTESTED LIVE as agent |
| 1 file = 1 production unit; actions counted separately | PASS (probes + EOD panel) |
| Sticky client context while scrolling | PASS (existing; re-verify in agent pass) |

## 4 · EOD / Team EOD

| Criterion | State |
|---|---|
| Agent EOD derives production/actions/time automatically | PASS for production+actions; timer line UNTESTED LIVE |
| Manual fields only for what the system cannot know | PASS |
| Team EOD aggregates real members automatically | PASS — real roster only (fixtures excluded); 2 humans shown, submissions joined |
| Exceptions (absent/late/missing EOD) recordable | UNTESTED LIVE |
| Drill-down team total → agent → work | UNTESTED LIVE |
| Publishing to managers via Communication | DEFERRED unless trivially supported |

## 5 · BES CRM

| Criterion | State |
|---|---|
| Create project from purchased engines (13 published) | PASS — Dee created "Test" live |
| Website-only / Sales / Fulfillment / Full / Custom presets | PASS — preset chips select 3/4/13 engines; editing checkboxes flips to Custom |
| Work units assigned to a real user, visible in My Work | PASS — assignee select on the board writes canonical assigned_to; verified live into My Active Work Items |
| Complete & hand off; parallel next units | PASS — Dee completed two units live; dependants auto-derived READY |
| QA pass/needs-fix loop | PASS in probes; UNTESTED LIVE |
| Progress/journey/health derive automatically | PASS — live: 15% · building · on-track after Dee's two completions |
| CRM work reaches EOD automatically | PASS — both of Dee's units appeared on her EOD untouched |
| Board reads Partner → Business → Project (2026-09-09 late) | PASS — `business_name` on the project, optional field on New build project, grouped board verified live with Dee's "Test" project |
| Due-date and go-live notifications (2026-09-09 late) | PASS in probes (7); hourly cron `due-date-sweep` live; first real sweep wrote one overdue notice for a fixture item. UNTESTED LIVE with a real due date |
| Partner sees their build and what BES needs from them | PASS in probes (4) and screen tests (4); UNTESTED LIVE by a real partner login |

## 6 · Documents & signatures (added 2026-09-09 late, Dee's request)

| Criterion | State |
|---|---|
| Build a template with merge fields and a signature block | PASS — Settings → Operations → Documents & Signatures, walked live |
| Send to a team member, a partner contact, or an email address | PASS — member path signed end to end in the browser; partner-contact and email paths PASS in probes; UNTESTED LIVE |
| Signer opens the link with no account, views, signs | PASS — walked live as the fixture agent; signed copy filed on the profile |
| Refusals: unfilled field, draft template, no consent, sign twice, void after sign, unknown/voided token | PASS — 14 probes in phase 70 |
| Document history private to the person and document-capability holders | PASS — 0294, found by the gate and fixed the same night |

## Cross-cutting gates

| Criterion | State |
|---|---|
| Access isolation: pilot personas see only their scope | PASS in RLS matrix (68 phases); UNTESTED LIVE through the real UI |
| No dead visible controls in the five areas | PASS on sweep (no coming-soon/placeholder/dead buttons found); the pilot walk is the final judge |
| Production build deployed and smoke-tested | PASS (content-verified) — the deployed MyTimePage chunk carries tonight's adjustment UI and auto-stopped badge; boot frame served. Signed-in production walk happens with the pilot |
| Full RLS matrix green at the release commit | PASS — clean full run 2026-09-10 at commit `644b1be` (migrations through `20260910000200`): **1559/1559 across 70 phases**, 27m22s, no throttled checks (the harness now retries 5xx/timeouts with a run-wide cooldown) |


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

- **Timer governance (Dee's rule, 2026-09-08 late):** agents never write a
  custom time. Clock-out means NOW (DB-enforced); a forgotten timer is
  auto-stopped at the 10-hour cap by a cron sweep every 10 minutes — or by
  the agent's own next clock-in — with notifications to the agent and their
  team lead. Corrections go through `time_adjustment_requests`: the agent
  states the true stop time and reason, a lead/admin decides (never their own
  request), both identities audited. Matrix phase 69: 17 probes green.

---

# Go-live state — 2026-09-09 (evening)

Measured, not assumed. Every line below was checked against the live project
tonight rather than carried forward from an earlier pass.

## The blocker that turned out not to be one

**Email is LIVE.** The read-only provider check reports Resend
**working** — "Verified: bescrm.net, noreply.bescrm.net. Sending as
BES <noreply@bescrm.net>." Invitations can be emailed today; the screen's
"copy the link instead" fallback is no longer the only path. This had been
carried as a blocker for two days and was not re-tested.

The other three providers still refuse their keys, and none of them stops the
team starting:

| Provider | State | What it costs while refused |
|---|---|---|
| Resend | **working** | — |
| Anthropic | rejected | AI report reading and letter drafting |
| Lob | rejected | **Posting dispute letters** — the one that limits CreditOps |
| Authorize.Net | rejected | Paid sign-up and consumer billing — not needed internally |

## What exists right now

- **People:** 3 real members, all Agency Admin (Dee, Rowell, Dian). Rowell has
  a position, a team, a schedule and a rate; the other two have neither
  schedule nor rate.
- **Invitations pending:** 1 (Alyssa, Agency User · Team Lead) — **granting no
  module**, so she would activate able to log time with no CreditOps or BES
  CRM. The pending list now says so, and the module can be granted on her
  Access tab after she joins.
- **Teams:** Team Daniel, Team Ally, Team Leads, CRM Team — one member each.
- **Partners:** 28, of which 21 carry their ClickUp notes. One GHL location
  mapped to a partner, one marked BES's own.
- **No locked routes and no dead controls** anywhere in the five P0 areas.

## What Dee does to start the team

1. **Invite them** — People → Invite team member. Pick the access AND tick the
   module they work in; the invitation now carries it through activation, so
   nobody lands unable to work.
2. **Set schedules and rates** — on each person's profile, Schedule & Time.
   Attendance, lateness, paid breaks and payroll all derive from the schedule;
   payroll skips anybody with no rate.
3. **Assign partners** — on the person's Assignments tab (one, or all), or by
   assigning the partner to a team. Assignment is what makes a partner
   visible at all.
4. **Fix the Lob key** if letters must go out; Anthropic and Authorize.Net can
   wait.
5. **Send the agreements** — build the NDA / contractor agreement once in
   Settings → Documents & Signatures, then Send for signature from each
   person's Documents tab. They sign from the email; the signed copy files
   itself.

The profile's onboarding checklist now reads exactly this list per person —
activated, position, team, access profile, **module access**, schedule, rate —
so "who is ready to work?" is answerable at a glance.
