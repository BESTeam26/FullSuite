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
| Tech account | `agency_admin`, no seat, no team | Nobody (0) | Nobody | No | No |
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
- `managed_people()` excludes fixture profiles by design; authorization that
  must also work for the matrix's fixture leads keeps the direct team-lead
  branch (migration 20261001014000). Any future "in scope" check must do the
  same or the matrix goes red for the wrong reason.

## WORKING (verified today)

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
