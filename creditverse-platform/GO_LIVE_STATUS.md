# Go-Live Stabilization — status

Brief: `GO_LIVE_STABILIZATION_PASS.md` (Dee, 2026-10-01). This file is the
running result: the role × module matrix and the four lists. Updated as the
pass proceeds; the date on each row is when it was last checked.

**How "Tested" is read.** Only one real account can be driven in a browser
(Dee, executive). Every other role is proven at the database, as that real
person, inside a rolled-back transaction (the same request-claims the app
sends), plus the matrix phases and persona probes named. A row that says
`DB proof` has had its data scope verified; its screen has not been walked
by that role. `HUMAN TEST REQUIRED` means a real person in that role must
walk it before it is called working.

Roles: **Agent** (Jet, Archie) · **Team Lead** (Allyssa — department seat,
leads one team; Daniel — two teams) · **Department Lead** (Allyssa, Daniel —
`department_manager` seats) · **Division Lead** (Rowell — `division_manager`
seats; also `agency_admin`) · **Executive** (Dee and Aaron, owners; Aaron
holds the `chief_operations` seat) · **Partner Portal User** (Kaori). Bryan
and the Tech account are `agency_admin`: an access role, not a management
level (Dee, 2026-10-01).

## Full review — 2026-10-01, 8–10 PM ET

What was checked, first-hand: every sidebar page (22) and sub-page (30)
loaded as Dee with request and error capture; eight daily pages at phone
width; every page function called as an agent (Jet), a lead and department
manager (Allyssa), a division lead (Rowell) and the partner contact (Kaori);
all 17 scheduled jobs' last 24 hours; queues, delivery and data hygiene in
the live database; every provider credential tested live from Settings ›
Integrations; migrations local ⇄ remote; deployed Edge Functions; the
tracking documents (backlog, deferred list, pilot issues, registers).

**Platform health — working.** 52 pages load with no failed request and no
error screen. 781 migrations, local and remote identical. 23 Edge Functions
deployed. All 13 enabled scheduled jobs ran in the last 24 hours with zero
failures (four billing jobs are switched off on purpose until payments are
connected). No stuck or failed EOD email, no EOD report error in 14 days, no
timer over the 10-hour cap, no pending leave or time-adjustment request. No
page scrolls sideways on a phone. Database 190 MB; storage 16 GB of real
client documents (about 30,000 files).

**Integrations, tested live 2026-10-01 8:26 PM.** Resend (email): WORKING,
sending as BES <noreply@bescrm.net>. GoHighLevel: agency credential WORKS
(52 locations known, 2 mapped), but the webhook secret is NOT set, so no GHL
event can arrive yet. Anthropic (AI): REFUSED. Lob (posted letters):
REFUSED. Authorize.Net (payments): REFUSED. Each refused key needs a fresh
key pasted by Dee; the documents' older claims that these worked are stale.

**Operational findings from the live data (not code defects).**
- Production is recorded only when somebody presses Complete Work. On
  October 1 only Ivan did (8 files; Dee 1). Everyone else logged 5–7.5
  hours with almost no work recorded in FullSuite, so their EOD reports,
  Output scores and production reports read zero. The engine is right; the
  work is happening somewhere FullSuite cannot see.
- CreditOps actionable queue: 425 of 651 Dispute files, 83 of 409 Support,
  11 Onboarding, 11 Complaints and 1 Bureau Calling have no assignee. 216
  Onboarding files are flagged for lead review.
- BES CRM: 65 open work units with no assignee; 37 are overdue (the
  Attention Center shows them).
- 12 of the 14 measured staff have no pay arrangement, so payroll would
  skip them entirely.
- Closed-app push: only Dee's laptop is registered. Nobody else has turned
  notifications on.
- Partner Portal: 1 of 25 partners has an active login (Kaori).
- 2,129 unread notifications, concentrated in a few people (Jet 510,
  Daniel 282, Allyssa 175) — mostly September assignment notices from the
  ClickUp import. A very long unread list slows the bell (1.1 s at 171).
- Four expired, never-accepted invitations remain (housekeeping).

**Security gate (full matrix, 8 PM–midnight).** Phases 1–70 ran in one
pass before its one-hour limit; 72–76 and every phase touched tonight were
re-run separately. Final state: every check passes except two —

1. the long-standing bootstrap mismatch (`org.owner attention=2, want 1`),
   untouched;
2. ~~CreditOps handoff, latent~~ — **FIXED 2026-10-02** (migration
   20261002001000, Dee: "fix the handoffs"). The handoff now writes its own
   entry before opening departments, and whoever holds a department of a
   client can always open that client (P-013 applied to departments). Two
   test files that automatic routing had given Nico and Paul on 09-23 were
   released. Proven: all nine people holding department work see exactly the
   same clients as before (identical fingerprints); matrix phases 47, 55,
   60–64 and 74 pass, including new checks for the department-holder rule.

**Fixed tonight — data exposure (migration 20261001019000).** The client
conversation functions (`client_feed`, `client_posts`) checked access with a
helper that is only honest under the caller's own row rules; inside those
privileged functions it answered "yes" for every client, leaving only the
partner check. Two people who see no client files could read client
comments by calling them directly with a client's id: JM 13,661 comments on
2,146 clients, James 1,510 on 111. No screen offered it. Both now ask
`fulfillment_client_readable()`, an exact copy of the client-file rule that
works inside privileged functions; matrix phase 47 proves, for seven kinds of
reader, that it always agrees with the table's own rules. Proven after the
fix: JM and James read nothing; Jet, Allyssa, Rowell and Dee read the same 45
feed entries and 15 posts as before.

Six other failures were stale checks, each updated with its reason: two
structure checks that predated the September 28–29 performance rewrites, the
realtime allowlist (notifications joined deliberately today), a partner
reason label, the handoff check written for the pre-September-28 assignee
model, and a due-date check that became false on the calendar, not in code.
The three End of Day computations flagged by the privileged-helper check are
deliberate (they compute the caller's own day or team report) and are now
named exceptions in that check; every other pair still fails it.

## 2026-10-02 — Partner Portal: Projects & Services (step 5)

Done to PARTNER_PORTAL_DOCTRINE.md's list ("what BES is doing for them …
builds/projects · start date · progress · milestones · deliverables ·
approvals needed"):
- **Services** stay one card per live engagement (CreditOps, BES CRM,
  TalentOps, FundingOps, Sales & Marketing) with status, start and end date,
  and the module's own summary.
- **Builds now appear on this page.** The builds section existed but was
  mounted nowhere. Each build shows its scope, journey stage, overall
  progress, target or live date, **progress by area** (one bar per engine:
  percent and Not started · In progress · Complete), **milestones** (coming
  up and reached), **deliverables** (a reached milestone with a link opens
  it), and what BES still needs from the partner.
- **Approvals needed:** a callout at the top counts the build requirements,
  agreements and approvals waiting on the partner and opens Actions Needed
  — one place to act.
- Server (migration 20261002004000): `my_partner_project_engines()` returns
  counts only, the same count the project's own progress uses;
  `my_partner_milestones()` returns only milestones BES marked client-visible,
  never notes or who completed them. Both are behind the partner gate.
  Proven with a temporary contact on 8F Solutions: 13 of 13 engines (intake
  33%, matching the BES CRM board), 12 published milestones, the 1
  unpublished hidden; a BES owner gets nothing. Matrix phase 77 holds four
  new checks.
- Not verifiable live: Kaori's partner has no active build, so a real
  partner has not seen the section yet.

Next in the doctrine's order: Billing.

## 2026-10-02 — Partner Portal: Messages (step 4 of the doctrine's order)

Done to PARTNER_PORTAL_DOCTRINE.md's Messages list:
- **Channels are General · Support · Projects · Billing · direct messages to
  the assigned BES team.** Projects is offered when a build or campaign is
  live; General, Support and Billing always. CreditOps and Marketing are no
  longer offered for new conversations, but one that exists keeps its place
  and history (one Marketing conversation does). The server accepts the two
  new topics and still refuses another partner's and any unknown topic
  (migration 20261002003000; proven as Kaori).
- **Who wrote it is always labelled:** "BES team" on staff messages, and now
  "Partner" on the partner's own, in partner conversations and their threads.
- **Header links to where the subject lives:** Billing → View invoices,
  Projects → View projects, General → Actions needed.
- **Channel details closed by default on smaller screens** (open from
  1,280 px); a person's own choice, once made, still wins. Applies to BES
  Communication too. Verified at 1,315 px (open) and 1,024 px (closed).
- Already in place and unchanged: unread counts per conversation, partner
  conversations separate from internal ones, @mentions only of people the
  partner may contact, no staff directory.
- Not verifiable live: no partner has written a message yet, so the Partner
  badge is proven by its test; a real partner login is the human check.

Next in the doctrine's order: Projects & Services, then Billing.

## 2026-10-02 — Dee's three follow-ups, done

- **Old notifications cleared.** 1,968 unread notices from before October 1
  (Eastern) were marked read for the 25 people they belonged to; nothing was
  deleted, and each still appears on that person's Notifications page.
  Unread total 2,129 → 161 (Jet 510 → 11).
- **Handoffs fixed** — see the security gate section below.
- **Finished clients are out of Active** (migration 20261002002000). 55
  clients carried a closing status with an active lifecycle, mostly from the
  ClickUp import: Program Completed 24, Graduated 14 (Dee confirmed
  Graduated belongs here), Inactive / Canceled 17. Each moved to its matching
  lifecycle with a history entry; from now on a closing status closes the
  client and a working status reopens it. Both client lists share one "Show"
  rule: Active · All · Not active, where "Not active" holds completed,
  graduated and archived clients, so a finished client is never in neither.
  Active count 1,468 → 1,413; none of those 55 had open queue work. Verified
  in the browser as Dee.

## Payroll — who can view and edit whose (corrected 2026-10-01 PM)

Scope comes from the person's seat, team leadership or an explicit payroll
key. `agency_admin` by itself grants nothing. The BES side (BES cost, margin,
Bryan's managing-partner settlement, internal cost calculations) answers only
to `compensation.bes_cost.view`, held by the owners and Bryan.

| Person | Placement | Agent payroll: view | Agent payroll: edit (generate, adjust, direct rate, time corrections) | Release / settings / FX / cutoffs | BES side |
|---|---|---|---|---|---|
| Dee, Aaron | Owners (payroll key by definition); Aaron also chief operations | Everyone (25) | Everyone | Yes | Yes |
| Bryan | `agency_admin` + explicit payroll and cost keys; managing partner | Everyone (25) | Everyone | Yes | Yes |
| Rowell | Two `division_manager` seats; `agency_admin` | His two divisions' people (14) | Same 14 | No | No |
| Daniel | Two `department_manager` seats; leads two teams | His departments' people (7) | Same 7 | No | No |
| Allyssa | One `department_manager` seat; leads one team | Her department's people (2) | Same 2 | No | No |
| Tech account | sample account — deactivated 2026-10-01 | — | — | — | — |
| JM | `executive_assistant` seat (corporate, no scope) | Nobody | Nobody | No | No |
| Agents (Jet, Archie, …) | — | Own released payslips and own rate | — | No | No |

Counts are from the rolled-back per-person proof on 2026-10-01 after
migration 20261001015000. A person never appears in their own placement
scope; their own pay is the released-payslip self branch.

## Matrix — 2026-10-01

| Role | Module | Can View | Can Edit | Scope | Tested | Issues Remaining |
|---|---|---|---|---|---|---|
| Agent | Home / Attention / Notifications | Yes | Own items | Own | matrix phases 2–77 (bootstrap), DB proof; Attention rows link to their record (fixed 2026-10-01) | none known |
| Agent | My Work | Yes | Own work items | Own + team reach | matrix (`work_items_select`) | HUMAN TEST REQUIRED on phone |
| Agent | End of Day | Yes | Own EOD | Own | matrix phase 70, EOD tests, browser as Dee | HUMAN TEST REQUIRED (real agent submit) |
| Agent | Time & Attendance (Overview, My Time, My Attendance, My Time Off, **My pay**) | Yes | Own clock, own requests | Own; payslips only once released | DB proof (Jet: 0 others' rows; Archie: own rate only), phase 70 | My pay shows "Nothing released yet" until a cutoff is released — correct today |
| Agent | People & Teams | No | No | — | people-sections tests, DB proof (`managed_people()` empty) | none |
| Agent | CreditOps | Assigned queue | Status within department | directory ∩ partner scope | matrix phases 55–75, latency gate | none known |
| Agent | Finance / Payroll management / Settings admin | No | No | — | DB proof (0 payslips of others, 0 cutoffs), phase 37 | none |
| Agent | Partner Portal | No | No | — | phase 77 | none |
| Team Lead | People & Teams: Overview, Members, Schedule, Attendance, Time Off, EOD, Performance | Yes | Within scope | Teams they lead | people-sections tests, `management-placement-probe`, `profile-access-matrix-probe` | screens not walked as a lead — HUMAN TEST REQUIRED |
| Team Lead | People & Teams: **Pay & Payroll** | Yes (new today) | Generate, adjust, set direct rate | Team members only; never BES cost | DB proof (Allyssa scope=2, Daniel scope=5, internal views 0), `compensation-probe` 21a/21b, phase 70 | HUMAN TEST REQUIRED as a lead |
| Team Lead | Time adjustment requests / attendance corrections | Yes | Decide for their people | Team + placement | phase 70 (approve recomputes payslip), migration 014000 | none known |
| Team Lead | CreditOps / My Work / EOD | Yes | Team scope | Teams led | matrix, latency gate | none known |
| Team Lead | Finance, Structure, Positions, BES-side pay | No | No | — | DB proof, probes | none |
| Department Lead | Everything a Team Lead has | Yes | Within department | Department (seat) | DB proof (Allyssa, Daniel), `management-placement-probe` | HUMAN TEST REQUIRED |
| Department Lead | Pay & Payroll | Yes | Agent side | Department; never BES cost | DB proof | none known |
| Division Lead | Everything above + Org Chart | Yes | Within division | Division (seat) | DB proof (Rowell), `management-placement-probe`, `profile-access-matrix-probe` | none known |
| Division Lead | Pay & Payroll | Yes | Agent side | His two divisions only (14 people), from the seats, not the admin role; never BES cost | DB proof (Rowell: scope 14, 0 internal, 0 settlements), phase 37 | none known |
| Executive | Every module | Yes | Yes | Company | browser sweep as Dee over 44 routes (all 21 sidebar + 23 sub-routes), 0 failed requests after fixes | CreditOps cold load 4.3 s (18 requests) — investigate per §26 |
| Executive | Finance (Overview, Invoices, Payments, Billing, Expenses, Payroll, Reports) | Yes | Yes | Company | browser as Dee (was 400 on every tab — fixed) | none known |
| Executive | BES Partners | Yes | Yes | Company | browser as Dee (was 400 — fixed), DB proof 20/1,468/2,144 | none known |
| Executive | Payroll: agent side organization-wide | Owners, Aaron (chief operations seat), Bryan (payroll key) | Same | seat or explicit key, never `agency_admin` | DB proof (Tech account, admin alone: 0), phase 37, `management-placement-probe` | none |
| Executive | Payroll: BES side (cost, margin, settlement) | Owners + Bryan only | Owners + Bryan | `compensation.bes_cost.view` | DB proof (Dee, Bryan see 4 internal rows; Rowell, Tech, leads see 0), `compensation-probe` 37/37 | none |
| Executive (Bryan) | Payroll + compensation, no finance | Yes | Yes | Company | `release-personas-probe` 46/46 | none |
| Partner Portal User | Overview, Clients, Actions Needed, Messages | Yes | Respond, sign, message | Own partner only; no internal fields | phase 77 (12 checks), DB proof as Kaori (earlier today) | Projects & Services, Billing, Updates, Account Settings not re-walked today; **Files waits** on the shared-document storage rule |
| Partner Portal User | Any BES internal surface | No | No | — | phase 77, `partner_services` staff-only policy | none |

## BLOCKING

None open after today's fixes. (Before: Finance and BES Partners failed to
load for the executive; any signed-in user could read BES cost and margin
through two pricing functions; no payroll adjustment could be saved.)

## NEEDS FIX

- Notification bell for people with many unread rows: 1.14 s per poll
  (every page, every minute) for Allyssa (171 unread). Over the 300 ms
  target; the fix is bounding the unread query, not the policy.
- CreditOps cold load as the executive: 4.3 s, 18 requests (§26 says 3–5 s
  is "investigate"). Not measured as an agent today; the latency gate run is
  recorded below when it finishes.
- Full security matrix: today's run crawled (phase 2 after 20 minutes under
  machine load) and was stopped before applying migrations; phases 37, 70,
  71 (payroll) and 77 (portal) were re-run clean. The full gate must be
  re-run at a quiet hour before the next release. Known pre-existing
  bootstrap mismatch untouched: `org.owner attention=2 (want 1)`.
- A Team Lead who holds neither `ops.manage` nor a seat cannot read their
  agents' `eod_submissions` rows directly (`eod_submissions_select` is self
  or `is_manager_of`); the rollup function still serves them. No real lead is
  in that position today (all three hold management access). Watch it when
  a plain team lead is appointed.
- Production units read 0 on every report tonight; minutes are right. Not
  yet determined whether that is correct for the day or a derivation gap.
- `managed_people()` excludes fixture profiles by design; authorization that
  must also work for the matrix's fixture leads keeps the direct team-lead
  branch (migration 20261001014000). Any future "in scope" check must do the
  same or the matrix goes red for the wrong reason.

## WORKING (verified today)

- Communication (Dee, 2026-10-01 night): web addresses and emails in a
  message are links (new tab, no referrer); every attachment opens over the
  conversation by what it is — image, PDF (browser reader), HTML (rendered
  in a sandboxed frame: no scripts, no access to the app; the storage
  service serves HTML as plain text, which is why "open in a tab" showed
  source), text and CSV, video, audio — and anything else says it has no
  preview and downloads. Download sits beside every attachment and inside
  the viewer. Any file type can be sent (five per message; the project's
  storage size limit applies). Verified as Dee on the CRM Team conversation:
  the 2.1 MB EDP website mock-up renders, the PDF opens in the reader.
- Dee's three instructions of 2026-10-01 evening, done:
  (1) the "Tech Support Team" sample account is deactivated through the
  canonical member-status path as Dee (audited); its login row is kept only
  so its 38 history entries still name who did them — say the word and the
  login itself goes; (2) Bryan, the managing partner, is outside workforce
  management like the owners (no schedule expected, no attendance score, no
  End of Day expected, no reminders, not in any management list; his pay
  arrangement untouched) — the rule is the live `managing_partner` seat
  (migration 20261001017000); (3) a lead is measured by their scope: Quality,
  Output and Compliance average the people they lead, Attendance stays their
  own (`leaderScore`, `leadership_scopes()`, migration 20261001018000), on
  the Performance section and the profile's Performance tab, with the rule
  stated on both. Daniel's scope: Alvaro, Archie, Ivan, Julius, Paul.
- End of Day is filed for the Eastern workday (found 2026-10-01 evening):
  six people in Manila submitted between 5 and 6 PM Eastern with the
  device's date (October 2) and an empty snapshot, and six lead emails said
  "0 minutes". The page now names the Eastern business day, the database
  clamps a future date and takes the snapshot itself at submission
  (migration 20261001016000), the six reports were re-dated and
  re-snapshotted (449–457 minutes each) and their emails re-queued. Matrix
  phase 70 holds the rule.
- Every page function walked as Jet (agent), Allyssa (lead and department),
  Rowell (division) and Kaori (partner): 103 calls, no errors; scopes as
  expected (partner reads 0 rows of any staff table).
- Phone width (375 px): My Work, Time & Attendance and Communication render
  with no horizontal scroll and reachable controls (as Dee).
- Attention Center rows open the thing that needs attention (Dee's report,
  2026-10-01 PM): the client file, the funding file or the BES CRM project
  the work is about, otherwise the work item on My Work. Rows were plain
  boxes before. Real click verified as Dee: an overdue CRM work unit opened
  its project board.
- Finance: every tab loads for the executive (`useFinancialInputs` is
  disabled for sections that do not use a month instead of sending a
  placeholder date).
- BES Partners: partner counts read the client lifecycle (`active`), not an
  archived enum value.
- Payroll scope per the PAYROLL RULE, proven for nine real people:
  Dee, Rowell, Allyssa, Daniel, Bryan, Jet, JM, Tech, Archie.
- BES / Bryan side: column revokes re-asserted, internal views gated, pricing
  functions no longer callable by `authenticated`, bes_only adjustments and
  the release event carry nothing BES-side into agent-payroll eyes, a
  managing-partner arrangement refuses anyone without the cost key.
- Payroll adjustment saves (constraint accepts the type the function writes).
- Attention Center, Notifications, People sections, Time sections, Clients,
  Funding files, Workspaces, Commissions, Compliance, Settings sections —
  load for the executive with no failed requests.

## NOT APPLICABLE

- Agent: People & Teams, Finance, Structure, Positions, Org Chart, BES-side
  pay. Partner user: every internal module. Leads: BES-side pay, release
  payroll, payroll settings, exchange rates, manual cutoffs (payroll key).

## DECIDED BY DEE, 2026-10-01 PM — DONE

- **`agency_admin` is not Executive.** Payroll scope now comes from the
  seat, team leadership or the explicit payroll key (migration
  20261001015000). Rowell: his two divisions. Tech account: nobody.
- **Production partners on the fixture team.** Seven live assignments of
  real partners (Approve with Tiff, Business Made Fair, Credit by Nainoa,
  EDP Management Group, Kevin Hernandez, Vanquish Ventures, Wavy One
  Solutions) to **[TEST] Team A** were ended on 2026-10-01 with the reason
  written on each row. Division visibility for those partners comes from
  the division seats and live engagements, which `can_see_partner()`
  already honours; nothing a real person could see was lost.

## Test runs recorded today

- Unit suite 2,583/2,583 (236 files), typecheck clean, lint clean, production
  build clean (commit 9c026e4).
- Latency gate (`npm run probe:latency`): PASS, 154 paths within guard across
  Owner, Division Manager, Department Manager, Team Lead, Agent and a
  zero-visibility user. Above target, under guard: bell unread notifications
  for people carrying ~170 unread (1.14 s, guard 1.5 s), Reporting pivot and
  scope options (1.3–1.8 s, guard 2 s), CreditOps queue counts (0.32–0.36 s,
  guard 0.8 s). Unchanged by today's work; listed under NEEDS FIX.
- Matrix phases 37, 70, 71: 226/228 → after the probe corrections 150/151 on
  phase 70 (the one remaining is the pre-existing bootstrap mismatch).
- Probes: management-placement 35/35, profile-access-matrix 26/26,
  release-personas 46/46, compensation 37/37.
- Browser (Dee): 44 routes, 0 failed requests after fixes.
