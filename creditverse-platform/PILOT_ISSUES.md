# Pilot Issue Log — Real BES Operations Pilot

Opened 2026-09-10 on Dee's instruction. **This file is the bug tracker for the
pilot; chat history is not.** Every real issue the BES team reports lands here
first, with its classification, and is closed only by a human.

Release state at pilot start: commit `0ec98a8`, schema through
`20260910000200`, full security gate **1559/1559 (70 phases)** — AUTOMATED
PASS and SECURITY PASS. Every P0 workflow is DEPLOYED and **UNTESTED LIVE**
until a real operator walks it.

## How to use this log

**Classification** (decided first, before any code):
`A PILOT DEFECT` · `B SIMPLE PILOT UX CORRECTION` · `C SECURITY / DATA-INTEGRITY`
· `D NEW FEATURE` · `E ARCHITECTURE CHANGE` · `F DEFERRED IDEA`

A, B (when it materially affects the workflow) and C are fixed now — smallest
canonical cause, tested, deployed. D, E and F go to `DEFERRED_AGENCY_WORK.md`
with enough detail that Dee never has to explain them twice, and the pilot
continues.

**Severity:** `S1` blocks a P0 workflow for a real user · `S2` wrong result or
lost data in a P0 workflow · `S3` friction that slows the workflow · `S4`
cosmetic.

**Status:** `OPEN` → `FIXED AWAITING LIVE RETEST` → `LIVE VERIFIED`, or
`DEFERRED`. A passing test, build or deploy never closes an issue; Dee or the
operator who hit it does.

## Issues

| ID | Date | Reported by | Module | Actual | Expected | Class | Sev | Root cause | Fix commit | Live verified by | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P-008 | 2026-09-19 | Dee, previewing a Complaints & Mailing agent | CreditOps / Authorization | A department agent saw every CreditOps client (18) and every department queue, the Management band and an Admin badge; production could be logged on a client of an unassigned partner | Directory limited to the partners assigned to them or their team; only their own department's queue; no management surfaces; filters within their scope | C — data scope (the directory and a mutation crossed partner scope); B for the rendering | S1 | RLS: the `creditops_directory_visible` arm of `fulfillment_clients_select` granted every client regardless of partner (Dee's own 2026-09-13 rule, superseded 2026-09-19). Rendering: the CreditOps space read the previewer's role and teams, not the previewed person's; Dashboard was universal; filters unscoped | `(this batch)` | — | FIXED AWAITING LIVE RETEST |
| P-007 | 2026-09-19 | Claude, building People & Teams → Overview; visible to every lead on Attendance | Attendance / Team Management | Every person's quarterly attendance score read **15 · Good standing** with zero incidents — Rowell, absent on eight scheduled days, included | Scores derived from the real days: Rowell 7 · Management review | C — data integrity (scores and the quarter-close reward sweep read an empty quarter) | S1 | Two silent truncations: `attendance_for` returned no rows for a range ≥ 62 days (the app asks for 92), and PostgREST caps a response at 1,000 rows (a quarter is 1,472) | `7973a29` | — | DEPLOYED · FIXED AWAITING LIVE RETEST |
| P-006 | 2026-09-11 | Dee | CreditOps / Complete Work | The credit status could only be changed in a separate control, away from the work being finished | Offer it inside Complete Work before submitting — keep the current status, or move to the new stage | B pilot UX correction | S3 — an extra step in the most-used P0 workflow | Design decision from 02xx deliberately removed the selector after an earlier one logged status changes it never wrote | `9fda507` | — | **FIXED AWAITING LIVE RETEST** |
| P-004 | 2026-09-11 | Dee | Access / Finance | Bryan and every agency admin could open **Finance** and **Organization billing**, and read payroll data | Money is the owner's alone, and the owner can switch it on for one person (e.g. a billing specialist) | **C security / data-integrity** | S1 — agency financials exposed to all administrators | `resolve_agency_capability` opened with `role in ('agency_owner','agency_admin') then true`, so an admin resolved TRUE for every capability including money, and no override could take it back | `cae687d` | — | **FIXED AWAITING LIVE RETEST** |
| P-005 | 2026-09-11 | Phase 70 probe, during the pilot | My Time / Timer | One real time entry (Dee's, 2026-09-11) carried the retired division `general`, two days after it was renamed to `admin` | Only the six live divisions are storable | A pilot defect | S2 — splits division totals on My Time, EOD and production reporting | `time_entries.division_id` is TEXT with no constraint, so a browser tab running the pre-rename bundle kept writing the old value | `cae687d` | — | **FIXED AWAITING LIVE RETEST** |
| P-002 | 2026-09-11 | Dee (and Bryan Breva, first real invited user) | Invite Users / Login | After choosing a password, the page looked unchanged — only a small green line appeared inside the still-complete form. Bryan then wandered to `/app` and hit **"No workspace access"** | A clear "we sent you a confirmation email" state that says what to do next | A pilot defect | S1 — the first real invited user believed activation had failed | Sign-up sets a `notice` string rendered as one `text-xs` line between the password field and the button; the form stays fully visible, so nothing reads as progress | `18999b8` | — | **FIXED AWAITING LIVE RETEST** |
| P-003 | 2026-09-11 | Dee | Invite Users / Login | The internal team invitation used generic copy and the platform tagline ("Credit + Funding Operations. One Connected Platform.") | BES's own branding and voice for internal team members, distinct from the partner emails | B pilot UX correction | S3 | The `isTeam` invitation shared a generic branch with customer-organization invites; only the two partner branches carried Dee's verbatim branded copy | `18999b8` | — | **FIXED AWAITING LIVE RETEST** |
| P-001 | 2026-09-10 | Dee | Invite Users / Login | The activation email from `noreply@bescrm.net` landed in Gmail **Spam** | It reaches the inbox so a new team member can activate | A pilot defect | S1 — blocks the Invite Users P0 flow | See below | `bfd6f7c` (reply-to) + `app.bescrm.net` cut over 2026-09-11; DNS re-verified in Resend 2026-09-20 | Dee, 2026-09-20 | **LIVE VERIFIED** — two invitations received in the inbox, mailed-by send.bescrm.net, signed-by bescrm.net |

### P-008 · A department agent was offered all of CreditOps

Measured as a REAL Agency User authorization context (`complaints-agent-matrix-probe.mjs`, the agent built onto the Complaints & Mailing team with Partner A assigned to the team and Partner B unrelated):

| Check | Before | After |
|---|---|---|
| Directly / team-assigned Partner A | ALLOW | ALLOW |
| Unrelated Partner B | DENY | DENY |
| Clients under Partner A | ALLOW | ALLOW |
| Clients under Partner B | **ALLOW (2 visible)** | DENY |
| The list is not every CreditOps client | **FAIL (18 of 18)** | PASS |
| Only the Complaints queue visible | PASS | PASS |
| Queue rows only over Partner A's clients | PASS | PASS |
| Onboarding / Dispute / Support / Bureau Calling queues | DENY | DENY |
| Log Complaints work on a Partner A client | ALLOW | ALLOW |
| Log work on a Partner B client | **ALLOW** | DENY |

8/11 → 11/11. Root cause at the database: the directory arm of the client policy granted every client to any CreditOps user with `creditops.clients.view`; it now intersects with `can_see_partner()` (unchanged), so queues, checklists and production writes — which all check the client row — narrowed with it. Rendering: the CreditOps space now reads the previewed person's role and team placement; the Dashboard is a management view; department and agent filters follow the person's scope; the title reads "CreditOps" for non-management. Live retest: preview or sign in as a department agent and open CreditOps.

### P-013 · An agent could not see the client assigned to them

**2026-09-19 · reporter: the full RLS gate (phase 3 production insert
refused), confirmed on live data · module: CreditOps client visibility ·
class C authorization regression · severity: P0, live.** Actual: Ivan
Olympia is the assigned agent of a real client (partner Kevin Hernandez);
neither he nor his team is assigned that partner, so under AD-004 (016000)
the client was invisible to him, and any production he logged on it would
be refused. Expected: your own assignment is always yours to see. Fix:
migration 20260919026000 adds one arm to `fulfillment_clients_select` —
assigned agent and BES staff of the agency — and widens nothing else
(`can_see_partner` and `in_scope` untouched, as Dee asked). Verified live:
Ivan reads and may update the record. Status: DEPLOYED · FIXED AWAITING
LIVE RETEST — Ivan opens CreditOps and finds the file.

### P-017 · Starting a timer hid its own controls behind "Choose manually"

**2026-09-20 · reporter: Dee · module: My Time / Timer · class B · severity:
S3.** Dee: *"I need this to be visible instead of just stating choose
manually, it causes unnecessary friction that agents will guess where to click
or how to track the first time."* Quick Start only offers work somebody has
already tracked, so a person clocking in for the first time had nothing to
click and had to discover that a small green link was the way in. The division
and partner pickers, the note field and the Start button are now on the screen
from the start, each with a visible label. Fix:
`src/components/time/StartWorkCard.tsx`; the test now asserts the controls are
present with no click and that no toggle remains. **Status: LIVE VERIFIED**
(Dee, 2026-09-20: "My Time confirmed Good").

### P-021 · People & Teams read as a pile of eleven tabs

**2026-09-20 · reporter: Dee · module: People & Teams · class B · severity:
S3.** Dee: *"team members, compensation, payroll, and all under people and
teams are a bit chaotic and messy and not clear to me, not friendly
navigation."* An executive sees every section, and eleven equal tabs in one
wrapping row is a pile rather than a menu. The same eleven destinations, in
Dee's locked order (§20c), are now drawn under the question each answers: Our
people · How we are organized · Day to day · Pay. Empty clusters are not
drawn, so a Team Lead sees two headings where an executive sees four. Slugs,
audiences and the sidebar are unchanged; the test asserts the grouping did not
reorder or hide anything. Status: FIXED AWAITING LIVE RETEST.

### P-020 · No direct way to see what people are paid

**2026-09-20 · reporter: Dee · module: People & Teams → Pay & Payroll · class
B · severity: S3.** Dee: *"I don't see a direct way I can easily see the
compensation."* Compensation was reachable only by opening a person and
finding their Compensation tab, which answers "what is this one person paid?"
and never "what are we paying?". Pay & Payroll now opens on a roster of
everyone's current arrangement, and names the people with no rate on file
rather than leaving them silently absent.

This exposed a real defect behind it: the arrangement row was gated entirely
on `compensation.bes_cost.view`, so payroll could not read the table and
nobody could see their own rate. Migration `20260920004100` opens the row to
payroll, to the person themselves and to the managing partner, and revokes
`bes_cost_cents` alone at the column level. Status: FIXED AWAITING LIVE
RETEST.

### P-019 · Position was typed by hand

**2026-09-20 · reporter: Dee · module: Team Member Profile → Organization ·
class B · severity: S3.** Dee: *"Position & reporting should be dropdown and
not manual type."* Reports To was already a dropdown; the job title was a free
text box, so "Processing Team Lead" and "Processing team lead" became
different positions and the Positions registry, the Org Chart and the team
list could never agree. The field now offers the Positions registry, labelled
with each seat's division. A title recorded before the registry existed stays
selectable and is marked as not in the list, so nobody's record loses its
title. Status: FIXED AWAITING LIVE RETEST.

### P-024 · The full security gate, classified — 1595/1661

**2026-09-20 · reporter: Claude, running the gate after the day's changes ·
module: authorization.** Up from 1435/1587 on 2026-09-19. The 66 failures, each
looked at rather than counted:

1. **Fixed today (4).** Phase 63's owner-capability checks encoded "the owner
   holds `partners.financials.view` BY ROLE", which stopped being true the
   moment that key became owner-gated at Dee's instruction. Rewritten to pin
   the rule that replaced it: a role-held key still says "by role", the
   owner-gated one says the owner holds it, and an ordinary member is refused
   it BY NAME rather than by silence. Phase 59's "a manager sees no partner
   they are not assigned" encoded the pre-D-021 rule Dee deliberately
   replaced. Phase 63 and 59 are now 139/139.

2. **A real gap, fixed (P-025 below).** `partners_visible_to_user` had not
   learned the D-021 branches its own gate had.

3. **Deliberate rule changes the harness never learnt (7).** Phase 2's
   "restricted sees nothing" and "credit sees exactly own clients", already
   recorded in P-011 as the next rewrite. Note that today's `entity_visible`
   fix moved "restricted sees no activity" from 99 to 107: eight rows about
   agency members, agency settings and payroll settings became readable, all
   of them `bes_internal` visibility, which every BES staff member has always
   been meant to read. The money fields are gated separately and restricted
   sees none of them.

4. **The division-manager fixture and department upserts (15).** Phases 5, 7,
   26, 28 and 62. Identical before and after today's helper refactor, so
   nothing here moved. Documented in P-011.

5. **Partner portal, communication and engagement placement (~40).** Phases
   55, 56, 57, 60, 61, 64 and 72, recorded in P-011 as "seen and not yet
   examined" and still not examined. The Partner Portal is frozen for the
   sprint (D-007), so these are not pilot blockers.

Status: the four in (1) and the gap in (2) are DEPLOYED. The rest are OPEN and
classified.

### P-025 · The partner list did not know what the partner gate knew

**2026-09-20 · reporter: the full gate (phases 59, 63) · module:
authorization · class A · severity: S3.** `can_see_partner()` gained its D-021
branches — a partner reached through a department you manage, and a partner
with a live engagement in a service your division owns. The parameterised copy
the interface and the access report read, `partners_visible_to_user()`, never
did. A division manager who manages CreditOps could open any of the 22
partners with a live CreditOps engagement while the list said "no assignment"
for every one of them.

The list was the NARROWER of the two, so nothing leaked. What it produced was
worse in a quieter way: an access report that understates access, which is not
a control anybody can trust.

Fixed in `20260920005300`. The scope helpers all read `auth.uid()`, so the
list could not ask them about somebody else; rather than restate the seat
rules a second time — the exact drift that caused this — each helper gained a
`_for(user)` form and the original became a one-line call with `auth.uid()`.
The list now names each route in its reason. Verified: phases 59 and 63
139/139, the placement probe still 31/31, and phases 5, 7, 26, 28 and 62
unchanged. Status: DEPLOYED.

### P-023 · The first payroll release will refuse: no PHP→USD rate on file

**2026-09-20 · reporter: Claude, dry-running payroll against the real team ·
module: Finance → Payroll · class A · severity: S1 the day payroll runs, none
before.** Generated a throwaway cutoff for 16–30 September against the real
roster, inside a transaction that was rolled back. The chain works: Bryan's
monthly package produced the correct half-month share, and the two hourly
people produced nothing because nobody has clocked time yet, which is right —
an unpriced period should pay nothing rather than guess.

Release then refuses, correctly and by name:

    No exchange rate recorded for PHP→USD. Set it under Finance → Payroll,
    then release.

Everyone is paid in PHP and `payroll_settings.payout_currency` is USD, so
every payslip needs a conversion and none exists. Two ways out, and it is
Dee's call which:

1. **Record the PHP→USD rate** under Finance → Payroll. Right if BES books the
   expense in dollars.
2. **Set the payout currency to PHP.** Right if BES pays and books in pesos —
   no conversion is needed at all for a PHP-only team, and no rate can go
   stale.

Not a defect: the refusal is the safeguard working. Logged because it would
have stopped the first real release and the fix was a decision, not code.

**Resolved 2026-09-20.** Dee: *"Set all payouts and agent pay in PHP as again
I pay them in peso."* BES's income is in dollars, but that is the income side;
what leaves the bank for the team leaves in pesos. Migration `20260920005400`
sets the payout currency to PHP and makes PHP the default for new pay records.
The conversion is now the identity, so there is no rate to record, go stale,
or quietly restate somebody's pay months later. Verified end to end: the same
throwaway cutoff now releases and books an expense of PHP 10,000 in PHP.
Status: LIVE VERIFIED by the decision itself — no operator step remains.

### P-028 · Google sign-in failed on the first click

**2026-09-21 · reporter: Dee · module: Login · class A · severity: S1 for
anybody using Google.** Dee: "Login via google don't work on the first click,
need to refresh again then try again to work."

A race, and the page lost it every time. The flow is PKCE, so Google returns
to `/auth/callback?code=…` and supabase-js exchanges that code for a session
asynchronously. The auth provider boots in parallel, calls `getSession()`,
finds nothing stored — because the exchange has not finished — and reports
`signed-out`. `AuthCallback` treated that as the answer and navigated to
/login, abandoning the code mid-exchange. The retry usually won the race,
which is precisely the "refresh and try again" behaviour.

Fix: while a `code` is in the URL, `signed-out` is not an answer, it is the
state before the answer. The page waits for the exchange or for a 15-second
timeout, whichever comes first, and never longer. A provider-side refusal
(`?error=`) is not waited on at all, and its reason is now carried to the
login page instead of bouncing somebody back to a silent form.

Six cases covered in `auth-callback.test.tsx`, including that a visit with no
code still leaves immediately, so the old correct behaviour is unchanged.

**Second cause, 2026-09-21, after Bryan reproduced it.** The callback knew two
statuses and there are three. `unavailable` — session real, identity not yet
readable — matched neither branch, so the page span to the timeout and sent a
signed-IN person back to the login form. Now forwarded into the app. Also
closed: the call THROWING (button stuck on "Please wait…" for ever) and the
call returning while the browser never navigates (8-second watchdog with a
message). 25 tests across `auth-callback.test.tsx` and `google-signin.test.tsx`.

**Dee's acceptance condition (2026-09-21) — CLOSED only when ALL of:**
- first click succeeds
- no refresh is required
- no second attempt is required
- a new / invited user lands in the correct FullSuite account
- a returning user lands correctly
- cancel / provider error returns a clear message
- a callback refresh does not break the session
- Agent / Manager / Executive routing still resolves correctly after
  authentication

Status: FIXED AWAITING LIVE RETEST — Bryan, fresh tab, first click.


### P-029 · The Google consent screen shows the raw project domain — DEFERRED by Dee

**2026-09-21 · reporter: Dee · module: Login · class D · severity: S4
cosmetic, but it is the first screen a new team member sees.** The consent
screen reads "to continue to wiojlgkzxlaiajwwrzuj.supabase.co" instead of a
BES domain, because that IS the OAuth callback host.

The only fix is Supabase's Custom Domain add-on, which is $10/month per
project and, per the doctrine's verified list, is NOT covered by the Spend
Cap. So it is a recurring cost decision, not a code change, and it is Dee's.
With it, the callback host becomes something like `auth.bescrm.net` and the
consent screen says that instead. Status: OPEN, awaiting Dee.

**The distinction Dee wants kept, so the $10 domain is never later offered as
a substitute:**

- **Custom Supabase domain** → changes the authentication HOSTNAME
  (`auth.bescrm.net` instead of the project host). $10/month. Cosmetic.
- **Google OAuth verification** → enables the verified BES app IDENTITY —
  name and logo on the consent screen. Free, needs a privacy policy and terms
  on bescrm.net and a Google review of days to weeks. Google's own docs: "In
  order for your app name and/or logo to be displayed, you must submit your
  app for verification."

They solve different problems. **Long-term plan is Google verification**,
after launch, with no change to the authentication architecture.


### P-027 · A file can sit ACTIONABLE in two department queues at once — OPEN, needs Dee's call

**2026-09-21 · reporter: Dee, asking whether handoffs are automatic · module:
CreditOps · class A · severity: S2 (two agents can work one file).**

The handoff itself IS automatic and needs no choice from the agent. Changing
"Credit status after this work" fires `creditops_route_on_status` →
`creditops_route_client`, which opens the destination department at its entry
status. Verified live, rolled back:

    Ready for Processing  →  Dispute = READY FOR PROCESSING
    Round 8 Sent          →  Dispute = ROUND SENT - AWAITING RESULTS (unassigned)
    CMS Issue 2           →  Support = MONITORING ISSUE

The gap is what happens to the department the file LEFT. Only 3 of 57 routing
rows set `closes_department`, all of them the "Ready for Reimport" family
closing Dispute. So:

    Ready for Processing → CMS Issue 2
      Dispute = READY FOR PROCESSING (ACTIONABLE)
      Support = MONITORING ISSUE     (ACTIONABLE)

A dispute agent still sees that file as theirs to work while Support is
chasing a monitoring issue on it. Where the source department is WAITING —
which is every "Round N Sent" — this is correct and is the parallel work §17b
intends. Where it is ACTIONABLE it is not parallel work, it is a department
that was never told the file moved.

**Not fixed: which moves finish the previous department is a product decision
across 57 statuses, and rule 21b says the CreditOps status model is not
altered casually.** Two ways to settle it, for Dee:

1. **Per status** — set `closes_department` on the specific moves where the
   previous department is genuinely done. Precise, and 57 decisions.
2. **One rule** — when a file moves to a DIFFERENT department, any actionable
   row it leaves behind stops being actionable. Nothing is marked complete,
   because it was not completed. One decision, and no queue keeps a file that
   has moved on.

Recommend (2). **Dee rejected (2)** and wrote the specification instead —
`CREDITOPS_QUEUE_DOCTRINE.md`, CLAUDE.md rule 23. Built 2026-09-21 to her
locked cases; the generic rule was never implemented. Proof:
`creditops-queue-probe.mjs`, 13 checks, including two that exist solely to
stop the rejected rule creeping back. Status: CLOSED.

### P-026 · A productivity report by department cannot be trusted yet — OPEN

**2026-09-20 · reporter: Dee, asking whether full per-department visibility
exists · module: Reports · class A/E · severity: S3.** It half exists. Reports
carries a pivot builder over `report_pivot()` with 20 measures and six row
dimensions, and grouping by Department returns real figures today. Four things
stop it being the full visibility Dee asked for, each verified live:

1. **A division is split in two by a hyphen.** The timer books to
   `TIMER_DIVISIONS` (`bes-crm`) and the org structure uses the service enum
   (`bes_crm`). Grouped by Service, BES CRM comes back as two rows — 15
   production units under one spelling and 57 minutes under the other. The
   divergence is *documented* in `division-label.ts` and reconciled for
   DISPLAY; nothing reconciles it for reporting.
2. **Hours are always zero per department.** Time is booked to a division,
   never a department, so every department row reports 0 minutes worked. A
   productivity report whose time column is structurally zero is misleading
   rather than incomplete.
3. **Department names are ambiguous across divisions.** `report_facts.
   department` is a name, and "Support" exists under CreditOps (as Client
   Success, keyed `support`) and under FundingOps (keyed `funding_support`).
   Two different departments add up into one row.
4. **No filters are offered.** `report_pivot` accepts organization, service,
   department and employee filters. The screen exposes a row dimension and a
   month count, and nothing else.

There is also no `division` dimension at all; Service is the nearest thing and
is the one broken by (1).

Not fixed: (1) is a small, clear defect, but (2) and (3) are data-model
decisions — what division does an hour belong to, and should a department be
identified by key rather than name — and reporting is deferred under §21a
until Dee says otherwise. Status: OPEN, awaiting Dee's call.

### P-022 · The compensation audit event told the worker what BES pays — SECURITY

**2026-09-20 · reporter: Claude, diagnosing P-018 · module: audit trail ·
class C · severity: P0 for the money boundary.** The compensation trigger
writes the whole arrangement into the event text — "managing_partner agent
8000 cost 10000". That event is an ordinary `profile` row, so Archie could
read, in plain language, that BES pays PHP 100 for him while he receives PHP
80. Every column grant and gated view built earlier the same day was undone by
one sentence in an audit log.

The value is NOT trimmed: an auditor with the capability must see what changed
(rule 10). The READ is gated instead, in `activity_events_select` — a
`compensation` field needs `compensation.bes_cost.view`, and a `rate` or
`adjustment` field is the subject's own or payroll's. Migration
`20260920004200`. Probe checks 15g–15k. Status: DEPLOYED.

**The lesson, for next time:** a capability that hides a column has to hide
every rendering of that column, and an audit event is a rendering.

### P-018 · Five kinds of history were written and unreadable by anybody

**2026-09-20 · reporter: the RLS gate (phase 70), diagnosed same day · module:
audit trail · class A · severity: S3.** Three phase-70 checks and one phase-37
check failed on the same root cause, and it was not the Documents module at
all. `entity_visible()` had no branch for `agency_member`, `pay_rate`,
`agency`, `payroll_cutoff` or `invitation`, so it answered false and the row
policy refused those events to EVERYONE — the person, an admin, the owner.
Eight member events, six rate changes and an invitation acceptance were
written and could not be read. `client` events point at `fulfillment_clients`,
a table that branch never checked, so all 29 were invisible too.

Fixed in `20260920004200`, in the same migration as P-022 deliberately:
making `pay_rate` visible would have turned six salary rows into a new leak,
so the entity became visible and the money field became gated in one change.
Status: DEPLOYED.

The remaining phase-70 check, "a document FILE row follows the document rule",
is a separate probe expectation and is still OPEN.

### P-016 · Payroll probes collided with the first real cutoff

**2026-09-20 · reporter: the RLS gate (phase 70) · module: Payroll · class A ·
severity: minor.** Five checks began failing with `23P01` the moment Dee
created a real September cutoff: they insert a cutoff at `current_date - 7 ..
current_date`, and two cutoffs cannot overlap. One also generated payroll for
`(select id from payroll_cutoffs limit 1)`, which with real data picked Dee's.
No product defect — fragile probes that assumed an empty payroll calendar. Each
now clears the calendar inside its own rolled-back transaction and addresses
its cutoff by id. Status: DEPLOYED (probe only; nothing in the product
changed).

### P-012 · An organization's own staff could not read their own CreditOps clients

**2026-09-19 · reporter: the full RLS gate (org.owner fclients=0, want 2) ·
module: Organization platform / CreditOps clients · class C authorization
regression · severity: P0 in principle, no live impact (zero real
organization users exist).** Actual: since 20260913004300 rewrote
`fulfillment_clients_select` around the shared directory, the arm "the
customer's own staff, in their own workspace" (0907) was gone; 0919's
rewrite inherited the omission. Every organization-side probe downstream
(create client, department status, rounds, letters, mailing, archive) failed
with 42501 because the record was invisible. Fix: migration 20260919025000
restores the arm exactly as 0907 wrote it, beside the unchanged 016100 arms.
Status: DEPLOYED to the database; the organization platform is paused (rule
16b) so the live retest waits for its first real user.

### P-015 · Team Lead invitations lost their two validations

**2026-09-19 · reporter: the full RLS gate (phase 37) · module: Invite Users ·
class A · severity: minor.** A Team Lead invitation with no team, and a led
team on a non-lead invitation, were refused (22023) until the 0912 rewrite of
`invite_agency_member` dropped both checks. Restored in migration 029000,
generated from the live definition. Status: DEPLOYED.

### P-014 · The client portal could not read borrower funding files

**2026-09-19 · reporter: the full RLS gate (phase 27) · module: Client Portal
· class C · severity: P0 for the portal, no live impact (portal not in
pilot).** `borrower_funding_files` — a definer view already filtered by
`portal_user_id = auth.uid()` — had no SELECT grant for authenticated, so a
borrower got 42501 on their own file. Grant restored in 029000. Status:
DEPLOYED.

### P-011 · The RLS matrix: first full run since Sep 10 — 1435/1587, classified

**2026-09-19 · reporter: Claude, running the full gate before a push · module:
test harness and authorization · severity: gate reporting.** The 141
failures fall into five kinds, each verified live rather than assumed:

1. **Real regressions, fixed today:** P-012 (organization staff could not
   read their own clients, 025000), P-013 (an agent could not see the client
   assigned to them, 026000), P-014 (borrower view grant, 029000), P-015
   (lead invitation rules, 029000), phase 47 (two derivation helpers ran
   under caller RLS, 027000), phase 37 (existing teammate re-invited, 028000).
2. **Deliberate rule changes the harness never learnt:** `in_scope` derives
   team and department reach (0913) and the directory is partner-scoped
   (AD-004). Base checks now use an independent reach oracle; the phase 2
   "restricted sees nothing" and "credit sees exactly own clients" checks
   still encode the old rule and are the next rewrite.
3. **Fixture drift:** `Gus Restricted` sits on Team B and is assigned the
   Cedar client (0170 + the 0912 backfill); fixture organizations and the
   BES organization row had no General channel (created through
   `ensure_general_channel`); the credit fixture's first assigned client is
   partner-held; fixture recipients hold 34 notifications, so a blanket
   "mark read" touches rows the probe assumed did not exist.
4. **D-021 — the division-manager question:** `bes.manager` (ops.manage,
   division scope, no team, no assignment) reaches nothing under the current
   rules. Phases 5, 6, 7, 19, 26, 28, 41, 62 act as that fixture and fail
   for that one reason. Not a defect until Dee decides what a division
   manager's reach is.
5. **Fixtures never receive work (0912):** the routing trigger clears a
   fixture assignee on insert, so phase 37's "agent sees their ASSIGNED
   client" can no longer assign at insert time; phase 3's production probe
   picks whichever assigned client comes first.

Also seen and not yet examined: phase 70 (payroll adjustments hit an
exclusion violation, 23P01 — a real draft cutoff now overlaps the fixture
period), phase 72 (engagement placement moves), phases 55/60/61 (partner
portal contact sessions, realtime publication, a missing function 42883).
Status: OPEN for the harness rewrite; every product regression it exposed is
DEPLOYED. **Final full run, same day, after the fixes: 1584/1661 (77 failing
checks in 18 phases: 2, 5, 6, 7, 19, 26, 28, 37, 41, 55, 56, 57, 60, 61, 62,
64, 70, 72).** Of those, phases 5, 6, 7, 19, 26, 28, 41 and 62 are the
division-manager fixture (D-021); phase 2 is the pre-0913 reach model;
phases 55, 60, 61, 70 and 72 are not yet examined. NOT a pass.

### P-010 · Notifications page crashed for anyone holding an End of Day notice

**2026-09-19 · reporter: console during Dee's session · module: Notifications ·
class A pilot defect · severity: blocker for the page.** Actual: opening
Notifications rendered nothing and the console read "Element type is invalid"
from `NotificationRow`. Expected: the list. Root cause: migration 0916 added
the `eod` notification kind and the database has been writing it (2 live
rows); the frontend's `NotificationKind` union and `KIND_ICON` did not carry
it, so the icon was `undefined` and React threw. The guard test that exists
for exactly this (`notifications.kinds.test.ts`) knew only the `kind in (…)`
spelling of the constraint, so it compared against 0218 and kept passing.
Fix: `eod` added to the union, the icon map and the test; the row falls back
to a bell for any kind a build does not know; the test now reads both
spellings and asserts it found the 0916 file. Status: FIXED AWAITING LIVE
RETEST — open Notifications as Dee and as an agent with an EOD notice.

### P-009 · "Invite Team Member" failed: type "citext" does not exist

**2026-09-19 · reporter: Dee's session, inviting Aaron · module: Invite Users /
Login · class C security-adjacent pilot blocker · severity: P0.** Actual: the
invite dialog showed `type "citext" does not exist`; no invitation was
created. Expected: invitation created and emailed. Root cause: migration
20260912001700 redefined `invite_agency_member` with `set search_path =
public` while declaring `v_email citext` unqualified; the type lives in the
`extensions` schema, so the function failed to compile on first call. The
same fault sat in seven other functions — `accept_invitation`,
`accept_partner_invitation`, `provision_self_serve_organization`,
`diy_enroll`, `clickup_import_client`, `set_report_recipient`,
`signature_request_create_unchecked` — meaning acceptance of ANY invitation
and self-serve sign-up were also broken. Fix: migration 20260919024000
regenerates all eight from their live definitions with `extensions.citext`;
nothing else changes. Verified live: Aaron's invitation created and emailed
through the dialog immediately after. Status: DEPLOYED to the database;
FIXED AWAITING LIVE RETEST for acceptance — the next person who accepts an
invitation is the test.

### P-007 · Every attendance score was a clean 15

Two layers, each silent. `attendance_for` was bounded to `p_to - p_from < 62`
and answered an over-wide range with **no rows, not an error**; every reader
that thinks in quarters — the Attendance section, `scoreQuarter`, the
quarter-close reward sweep — asked for 92 days and received nothing, which
scores as a perfect 15. Raising the bound exposed the second layer: PostgREST
returns at most 1,000 rows per request and says nothing about the rest, and a
quarter for the team is 1,472 rows, so the last people's Septembers were cut
off. Both readers now page until a page comes back short
(`lib/attendance/page-all.ts`), `fetchAttendance` refuses a range the function
cannot answer, and the sweep was redeployed with the same loop and answers
`2026-Q2 closed, granted 0, skipped 2, exceptions 8` as before. Fix `7973a29`.
Live retest: open People & Teams → Attendance and confirm Rowell reads 7 with
8 absences, then any agent's own My Attendance.

### P-006 · Credit status now moves as part of finishing the work

Complete Work lost its status selector once, for a good reason recorded in the
file: the old one **logged an activity entry saying the status had changed
while the record stayed put**, and offered four values the enum did not even
have. So it was removed and status became a separate control.

Dee asked for it back. It is back, and it cannot repeat that failure:

- it writes through **`updateClientStatus`** — the same canonical writer the
  dedicated Status control uses — so there is no second write path;
- it offers only **`creditStatusOptionsFor(currentStatus)`**, Dee's locked
  ten-status list, so an impossible value cannot be picked;
- it **logs nothing itself**. The activity entry comes from the database
  trigger on `fulfillment_clients`, so a status entry cannot exist without the
  status change that caused it;
- it **defaults to the status the file already has**, so completing work
  changes nothing unless the operator deliberately moves it;
- **handing off still never changes status** — the matrix probe asserting that
  remains true, because a handoff does not reach this path.

The panel's banner said "Status change is separate"; it now says "The status
below moves only if you move it."

### P-004 · Finance was visible to every agency admin

**The flaw was one line.** `resolve_agency_capability` began:

```sql
when m.role in ('agency_owner', 'agency_admin') then true
```

Every capability, money included, and an override could not claw it back. All
four real BES staff are administrators, so all four could open Finance. The
profile defaults were already correct (`finance.dashboard.view` is `false` for
manager, team lead, agent and custom) — they were simply never consulted for an
admin.

**The rule now.** `permission_keys.owner_gated` marks a capability as money.
For those keys the admin shortcut does not apply:

> allowed = the person is the agency **owner**, or the owner has **explicitly
> granted** it to them.

Gated today: `finance.dashboard.view`, `expenses.view`, `expenses.manage`,
`payroll.view`, `payroll.manage`. It is a column, not a hardcoded list, so
gating another capability later is one `UPDATE`.

**Why this protects data and not just the menu.** Every money table already
asks `agency_can(...)` in its RLS — `payslips`, `payroll_cutoffs`,
`member_pay_rates`, `fx_rates`. Fixing the resolver therefore closes the data
path; the menu change merely stops offering a door that is already locked
(rule 1). Verified live: all three non-owner admins now read **zero** rows from
`member_pay_rates`, and the owner reads them.

**The gate has no handle on the inside.** `set_agency_permission` and
`clear_agency_permission` now refuse a gated key unless the caller is the
owner, so an administrator cannot grant themselves what they were just denied.
The old guard that refused *any* override on an admin was relaxed for gated
keys only — every real BES staff member is an admin, so without that the
feature would be unusable by exactly the people it exists for.

**Also gated:** `/app/billing` (Organization billing), on Dee's follow-up. Both
money surfaces now follow one switch, "Financial dashboard", and both moved
from `access: "admin"` to `access: "user"` so a granted billing specialist
reaches them without being promoted to administrator.

**Found on the way:** `resolve_agency_capability` never checked
`status = 'active'`. Every policy pairs it with `is_staff_of()`, which does
check, so nothing was exposed — but a resolver that answers TRUE for a
deactivated person is a trap for the next caller who forgets the pairing. Now
checked, and probed.

**Probes:** ten in phase 37 — owner holds money, admin does not, admin keeps
everything that is not money, admin cannot READ payslip rows, owner can, a
grant reaches exactly one person and one key, an admin cannot grant or
withdraw money, a granted Agency User gets money without management, and a
deactivated member holds nothing. Two in the menu tests. Phases 37, 48, 67, 70
all green.

**Probes corrected, not fixtures:** eleven payroll and currency probes ran as
an admin and asserted payroll *mechanics*. That assumption is now wrong, so
they run as the owner — the rule changed, so the tests follow the rule. The
refusal probes keep their own subjects, and phase 37 asserts the admin's
refusal explicitly, so none of them passes merely because everybody is denied.

### P-005 · A retired division came back through a stale tab

Phase 70's own probe caught it in production: one entry saying `general`, made
two days after 0283 renamed it to `admin`. `division_id` is TEXT with no
constraint, so a browser tab still running the old bundle kept writing a value
the current interface cannot offer — splitting the division totals for whoever
had that tab open.

Fixed at the database, where a stale client cannot argue: the row was
normalised, a trigger maps `general` → `admin` on the way in (a person's hours
are not the place to lose data over a cache), and a CHECK closes the set to the
six live divisions.

### P-002 · Sign-up gave no visible sign that anything happened

**What actually happened** (from `auth.users` and `invitations`, so this is the
record rather than a reconstruction):

| Time | Event |
|---|---|
| 03:11:35 | Bryan signs up; Supabase sends a confirmation email |
| 03:12:06 | He opens the confirmation link |
| 03:12:21 | Signed in |
| 03:12:22 | Invitation accepted — `agency_user · Manager`, 3 modules, **active** |

So the pipeline worked and **Bryan is a fully active member right now.** The
"No workspace access" screen was the gap between confirming his email and the
acceptance completing, reached because nothing on the sign-up page told him to
go and check his inbox — so he navigated away and landed somewhere that
correctly reported he had no membership *yet*.

**Fixed:** `signUp` now reports whether a confirmation is pending (Supabase
returns a user with no session in that case) instead of discarding it, and the
invitation page replaces the whole form with a "Check your email" panel naming
the address, saying the link brings them straight back and accepts
automatically, mentioning the spam folder, and offering "Back to sign in".

**Not changed:** the "No workspace access" screen itself is telling the truth
for someone genuinely uninvited. Making it detect a pending invitation would be
a new feature; recorded in `DEFERRED_AGENCY_WORK.md` rather than built here.

### P-003 · Internal team invitation was generic

The two partner branches carried Dee's verbatim branded copy; the internal team
invitation fell through to the same neutral branch as a customer
organization's own invite, so it inherited the platform tagline. Internal
invitations now carry their own voice and the brand line **"Freedom isn't
found, it's built with structure."** — the partner emails keep "Beyond
Outsourcing. Your Business Growth Engine.", and a customer organization's
invitation stays neutral in *their* branding, which is correct.

### P-001 · Invitation email delivered to Spam

**Re-opened and closed 2026-09-20.** Aaron's activation landed in spam with
"not authenticated": `resend._domainkey.bescrm.net` had disappeared and
`send.bescrm.net` carried Mailgun/LeadConnector records (GoHighLevel's
sending-domain setup). Dee re-ran Auto configure in Resend; the domain
verified at 5:45 AM and the next two invitations (Aaron, and a test to
dee+resendtest@) arrived in the inbox authenticated. `send.bescrm.net` now
belongs to Resend; GoHighLevel keeps `mail.bescrm.net`.

**Not an authentication failure.** Verified live against DNS:

| Check | Record | Verdict |
|---|---|---|
| DKIM | `resend._domainkey.bescrm.net` — 1024-bit key present | PASS |
| SPF (envelope) | `send.bescrm.net` → `v=spf1 include:dc-fd741b8612._spfm.send.bescrm.net ~all` | PASS |
| Return-Path / bounces | `send.bescrm.net` MX → `feedback-smtp.us-east-1.amazonses.com` | Correct |
| DMARC | `_dmarc.bescrm.net` — `p=quarantine; adkim=r; aspf=r` | Aligns on both, so it PASSES |

So Resend is set up correctly and the message is authenticated. What Gmail is
reacting to, in order of weight:

1. **Sender domain ≠ link domain.** The email comes from `bescrm.net` and the
   activation button points at `https://bes-full-suite.vercel.app/accept-invitation/…`.
   `APP_ORIGINS` is unset in the function environment, so the link falls back to
   the hardcoded Vercel default. A first-contact message from an unknown domain
   sending you to a *different* domain on free hosting, to create a password, is
   the exact shape of a phishing email.
2. **Cold domain.** `bescrm.net` has no transactional sending reputation; this
   is among its first messages.
3. **`noreply@` with no Reply-To.** A sender that cannot be replied to is a
   small negative signal on top of the two above.

**Fixed in code and configured (partial):** `sendEmail` takes an optional
`replyTo`; each mailer passes `MAIL_REPLY_TO` from its own environment, and the
header is omitted when there is none rather than pointed at an address nobody
reads. `MAIL_REPLY_TO` is set to `support@blessedempireservices.com` (Dee,
2026-09-11 — a monitored Gmail inbox); the three mailers were redeployed to
pick it up. This addresses (3) only.

The reply domain differs from the sending domain, which is normal and not a
meaningful spam signal — a real reply path is worth far more than domain
symmetry here.

### The cut-over, 2026-09-11 — signal (1) removed

Dee added `app.bescrm.net` to Vercel; it resolves and serves the app. Changed
the same day, all of it verified live:

| Setting | Was | Now |
|---|---|---|
| Supabase Auth **Site URL** | `https://bes-full-suite.vercel.app` | `https://app.bescrm.net` |
| Supabase Auth **redirect allow-list** | Vercel + localhost 5173/3000 | `app.bescrm.net` **and** Vercel **and** localhost 8080/5173/3000 |
| Edge Function **`APP_ORIGINS`** | unset — fell back to the Vercel default | `https://app.bescrm.net` |
| Fallback inside the three mailers | `https://bes-full-suite.vercel.app` | `https://app.bescrm.net` |
| Agency `branding.logoUrl` (0300) | the logo served from Vercel | the logo served from `app.bescrm.net` |
| `siteUrl` in the browser bundle | `VITE_SITE_URL`, baked to Vercel at build | the live browser origin, so each host returns you to itself |

An email from `noreply@bescrm.net` now links to `app.bescrm.net` and loads its
logo from `app.bescrm.net`. Nothing a recipient sees names another host.

**The Vercel address still works and was deliberately kept** — it is no longer
where BES points people, and it no longer appears in anything emailed.

**Live retest:** send one real invitation to a Gmail address and confirm it
arrives in the inbox. Cold-domain reputation (2) only builds with volume, so an
early message may still be filtered even now; the workaround below stands until
an invitation is seen to land.

**Immediate pilot workaround:** the pending-invitation row has **Copy link**.
Sending that link to the person directly, from Dee's own mailbox, activates
them today.

## P0 workflow gates (human)

| Workflow | Automated | Live |
|---|---|---|
| Invite Users / login (§9: email, branding, activation, production URL, password, membership, profile, team, module, partner access, landing page, refresh, logout/login) | AUTOMATED PASS | **BLOCKED — P-001, invitation delivered to Spam** |
| CreditOps (§10: assigned partner only, client opens, status, sticky context, actions, Complete Work, multiple handoffs, source/destination departments, production once, activity, EOD) | AUTOMATED PASS | UNTESTED LIVE — owner-only walks do not count |
| My Time / Timer (§11: start, refresh survives, stop, duration, association, history, EOD, no duplicate running timer) | AUTOMATED PASS | UNTESTED LIVE |
| Agent EOD (§12: work, actions, production, handoffs, QA, time, blockers derived; manual fields for context only) | AUTOMATED PASS | UNTESTED LIVE |
| Team EOD (§13: members, totals, submission state, exceptions, drill-down, Work Behind These Totals) | AUTOMATED PASS | UNTESTED LIVE — needs a real Team Lead |
| BES CRM (§14: assigned project visible, others hidden, My Work, units, actions, auto In Progress, parallel, handoff, QA, progress, production, EOD) | AUTOMATED PASS | UNTESTED LIVE — Dee's "Test" project walked by the owner only |
| Access (§15: CreditOps-only, CRM-only, lead scope, manager scope, agent scope, Finance restricted, admin controls restricted, partner inheritance, direct-URL denial) | SECURITY PASS (1559/1559) | UNTESTED LIVE through the real UI |

A row moves to LIVE VERIFIED only when the named real operator has walked
the whole list in production and said so.

### P-030 · "Database error loading user" on Activate my account — LIVE VERIFIED

**2026-09-21 · reporter: Dee (Roniel Pena's screenshot) · module: Invite Users /
Login · class A pilot defect · severity: S1 — five invited people could not
activate at all.** Roniel filled in his name and password, pressed Activate
my account, and got "Database error loading user".

**Root cause.** Migration `20260920001800` staged five invited people
(Roniel, Julius, Gile, Alyssa, Dmacasiab) as shell accounts by inserting
straight into `auth.users`, naming only the columns it cared about. Supabase
Auth reads its token columns (`confirmation_token`, `recovery_token`,
`email_change`, `email_change_token_new`) into non-nullable Go strings, so a
row with NULL there cannot be loaded — every sign-in, password set or admin
update for that person failed before it started. Accounts made through the
`create-team-member` function use `auth.admin.createUser`, which writes `''`,
which is why every other invitation worked. Nothing in the activation code was
wrong; the five rows were.

**Fix.** `20260921006000_shell_auth_rows_readable_by_auth.sql` sets the
empty strings Auth expects on any row that has NULLs (idempotent; five rows
changed; identities untouched). **Rule from here:** a shell auth account is
created through `auth.admin.createUser`, never by SQL insert. The
`invitation-uat-probe` keeps its SQL shell only because it rolls back.

**Verified.** A wrong-password sign-in for each of the five now answers
"Invalid login credentials" (row loaded, password checked) where it answered
"Database error loading user" before; `invitation-uat-probe` 16/16; all five
invitations still EMAILED, awaiting acceptance, expiring 2026-09-27.
**LIVE VERIFIED 2026-09-21 by Dee: "all agents are now good and active."**

Cost line: does this increase recurring infrastructure cost? No. Cost scales
with: nothing — a one-time data repair.

### P-031 · Owner cannot create a BES-internal workspace ("violates row-level security policy for table workspaces") — FIXED AWAITING LIVE RETEST

**2026-09-21 · reporter: Dee (live, TalentOps › New workspace "Test 123") ·
module: TalentOps · class A pilot defect · severity: S2.**

**Root cause.** The insert was allowed — `is_agency_manager_or_above()` is
true for Dee. The refusal came from the `returning id` step: the `workspaces`
SELECT policy (D-021 rewrite) reaches an agency-owned row through
`workspace_reach(id, null)`, a STABLE function that looks the row up, and
inside the inserting statement its snapshot predates the insert, so it finds
nothing. Postgres reports that as the same 42501 "new row violates row-level
security policy". Proved in a rolled-back transaction: the same insert without
RETURNING succeeds and the row is visible in the next statement.

**Fix.** `createAgencyWorkspace` mints the id client-side and inserts without
asking for the row back (`src/lib/data/agency-workspace.ts`). No RLS change
during the pilot — the policy is right about who may read; only the
same-statement read-back was wrong. If a second writer hits this shape, the
proper structural fix is a row-local clause in `workspaces_select` for
agency-owned rows, planned rather than done mid-pilot.

**Verified.** As Dee, in a rolled-back transaction: workspace + two statuses +
one board created and readable (the exact sequence the app runs). Live
verifier: Dee creating her workspace in TalentOps.

Cost line: no recurring cost change; one fewer round trip per create.

### P-032 · Communication day marker is a loud sticky pill — FIXED AWAITING LIVE RETEST

**2026-09-21 · reporter: Dee · module: Communication · class B pilot UX
correction · severity: S4.** "This date on the Communication is not subtle …
it does not disappear … a LOUD element." The day divider was a bordered,
shadowed pill pinned to the top of the scroll box for the whole day.

**Fix.** `ConversationPane.tsx`: the marker scrolls with the messages (no
`sticky`), and is a plain 11px muted label between two faint rules — findable
when scanning, silent otherwise. Every message already carries its own time.

Cost line: none.

### P-033 · Owner could not archive the Onboarding department — CLOSED (Onboarding archived by 20260921010000 on Dee's structure spec)

**2026-09-21 · reporter: Dee · module: People & Teams › Structure · class A
pilot defect · severity: S2.** "I can't delete this Onboarding … I should be
able to delete or archive all records from my user as Dee (owner)." The card
read "0 teams"; the confirm read "1 team"; the archive was refused with "Move
[TEST] Team B to another department before archiving this one."

**Root cause.** Not a permission. `[TEST] Team B` is an RLS-probe fixture
team that migration 20260907001100 parked inside Dee's real Onboarding
department. The structure page hides fixture rows (hence "0 teams"), the
confirm count and the archive guard (20260920007300) did not (hence "1 team"
and the refusal). A fixture standing in the way of a real action breaks
rule 20's "fixtures coexist with real data".

**Fix.** `20260921009000_fixtures_out_of_real_departments.sql`: a hidden
`[TEST] Fixture Department` now holds both fixture teams, and the archive
guard ignores fixture teams outright; `impactOfDepartment` counts what the
guard counts. The guard for REAL teams is unchanged and is integrity, not
permission: a department with a live team cannot be archived until the team is
moved, because an orphaned team loses its department in hours, production,
EOD routing and reports with nothing saying why. Owner included.

**Verified as Dee, rolled back:** archiving Onboarding now succeeds; archiving
Dispute Department is still refused naming its real team. Live verifier: Dee
pressing Archive on Onboarding.

**Caveat for Dee, not a blocker.** CreditOps routes "New Client Onboarded" and
"Incomplete Onboarding" to the Onboarding department's people. With the
department archived and nobody placed there, that work has no team to land
on until those statuses are routed elsewhere (Client Success is the likely
home). Say the word and the routing follows.

Cost line: none.

### P-034 · Reactions and the message menu "do nothing"; @everyone renders as @@everyone — FIXED AWAITING LIVE RETEST

**2026-09-21 · reporter: Dee (CRM Team channel) · module: Communication ·
class A pilot defect · severity: S2 — reactions are half the point of a chat.**

**Root cause (reactions and the "…" menu).** Not the database: a reaction
inserts fine as an agent and as Dee. `MessageRow` dismisses its picker and
menu on "any click on the window". React flushes that effect before the
opening click has finished travelling to the window, so the listener caught
the same click and closed the picker in the act of opening it. Reproduced in
the browser as Dee; covered now by a test that clicks Add a reaction and
expects the picker to still be there. Fix: "elsewhere" means outside the row
(a ref check), not anywhere.

**Root cause (@@everyone).** `channel_mentionable` names the group option
`@everyone` with its @ already; `mentionText` prepended another. It now adds
an @ only when the label has none. Messages already sent keep their text.

**Verified:** channels + mentions suites (63), typecheck, lint; live retest by
Dee or James in CRM Team.

Cost line: none.

### P-035 · "Sent. Unsend" bar under the conversation — REMOVED (Dee, second request)

**2026-09-21 · reporter: Dee · module: Communication · class B.** "REMOVE
THIS, this is not needed. This is the second time I ask that." The bar and
its 12-second undo window are gone, along with the plumbing behind them —
nothing else used it. A wrong message is deleted from its own "…" menu and
leaves the honest tombstone. Channels, portal and communication suites (122)
pass. DEPLOYED.

### P-036 · Mention: Enter chose the person AND sent the message — FIXED AWAITING LIVE RETEST

**2026-09-21 · reporter: Dee · module: Communication · class A · severity: S2.**
"Doing a mention to someone and Enter is sending the message right away."

**Root cause.** The mention picker handles its keys on the window in the
capture phase and closes itself with a state update. React flushes that update
before the textarea's own `onKeyDown` runs, so the guard that reads
"is the picker open?" saw it already closed and treated the same Enter as
"send". Fixed by honouring `defaultPrevented` — the mark the picker leaves on
a key it consumed — rather than the picker's state. Covered by a test that
reproduces exactly that order.

Cost line: none.

### P-037 · A new client's chosen agent was erased by routing — FIXED

**2026-09-21 · reporter: the full gate (phase 37), after onboarding statuses
moved to Client Success · module: CreditOps · class C data integrity.**
Creating a client WITH an assigned agent opened its first department row
unassigned — Client Success is `team_lead` mode — and
`creditops_refresh_headline` then copied that emptiness back onto the client,
silently discarding the person somebody had chosen. It surfaced the moment
`New Client` began routing to a team-lead department; it would equally have
lost an agent on any such department before.

**Fix.** `20260921010600`: on INSERT only, an explicit `assigned_agent_id`
seeds the first department record as a `manual_override`. A later status
change still follows the department's own rule. Verified as Dee with a real
agent, and phase 37 is 54/54 again.

Cost line: none.

### P-038 · Every "…" menu action needed a right-click to survive — FIXED (same cause as P-034)

**2026-09-21 · reporter: James Ivan Lazo, relayed by Dee · module:
Communication.** "Di po gumagana yung kahit anong buttons for interacting with
chat." The message menu closed on the same click that opened it (P-034's
listener), so Reply in thread, Save and Pin were unreachable by left-click —
only a right-click, which fires no `click` event, left the menu standing.
Fixed with P-034.

**Checked at the database for two people, as themselves:** react, save, reply
in thread, edit own and delete own all succeed for Dee and for James; pin is
refused for James and allowed for Dee, which is correct — pinning is a channel
manager's act — and the menu does not offer it to him, so there is no dead
control.

### P-039 · Break and Lunch punches were hidden in a ⋮ menu — FIXED (DEPLOYED)

**2026-09-21 · reporter: Dee · module: My Time · class B · severity: S2 —
pay depends on these punches.** "I missed the Break and Lunch punches on the
timer, I only see clock out / clock in now."

They existed, in the timer's ⋮ menu. A punch nobody can find is a punch
nobody makes, so Break · Lunch · Stop are now three visible controls, each
saying what it costs: **Break — paid up to your allowance**, **Lunch —
unpaid**. On a break the pair is replaced by **Back to work**.

**The pay rule Dee asked about was already correct and is unchanged**
(`payable_minutes`): work minutes are paid; break minutes are paid up to the
schedule's `break_minutes`; lunch is never paid. Every current schedule
allows 30 break minutes and 60 lunch minutes, 9am–6pm — if the allowance
should be 15 minutes, that is a schedule change under People & Teams →
Schedule, not a code change.

Cost line: none.

### P-040 · Managers could not see who is online, on break or on lunch — BUILT (DEPLOYED, UNTESTED LIVE)

**2026-09-21 · reporter: Dee · module: People & Teams.** Two surfaces, one
source: a compact **Who's on now** card on People & Teams → Overview, and the
full board at People & Teams → Attendance — counts for Working / On break /
On lunch / Clocked out / Not in yet / On leave (each a filter), search, team
and status filters, and a row per person with their team, status, clock-in,
current activity and today's minutes.

Everything is read off the canonical clock by `team_presence()`, which answers
only for `managed_people()` — an agent sees nothing, a team lead their team, a
division manager their division, the owner the company. No new table, no
polling loop: refetched on focus and every two minutes.

Cost line: no recurring infrastructure cost. Cost scales with: one bounded
query per open management screen.
