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
seats; also `agency_admin`) · **Executive** (Dee, Aaron; Bryan and the Tech
account are `agency_admin`) · **Partner Portal User** (Kaori).

## Matrix — 2026-10-01

| Role | Module | Can View | Can Edit | Scope | Tested | Issues Remaining |
|---|---|---|---|---|---|---|
| Agent | Home / Attention / Notifications | Yes | Own items | Own | matrix phases 2–77 (bootstrap), DB proof | none known |
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
| Division Lead | Everything above + Org Chart | Yes | Within division | Division (seat) | DB proof (Rowell), `management-placement-probe`, `profile-access-matrix-probe` | Rowell is also `agency_admin`, so his reach is the whole company (see BLOCKING/DECIDE) |
| Division Lead | Pay & Payroll | Yes | Agent side | Division; never BES cost | DB proof (Rowell: 4 payslips, 0 internal, 0 settlements) | none known |
| Executive | Every module | Yes | Yes | Company | browser sweep as Dee over 44 routes (all 21 sidebar + 23 sub-routes), 0 failed requests after fixes | CreditOps cold load 4.3 s (18 requests) — investigate per §26 |
| Executive | Finance (Overview, Invoices, Payments, Billing, Expenses, Payroll, Reports) | Yes | Yes | Company | browser as Dee (was 400 on every tab — fixed) | none known |
| Executive | BES Partners | Yes | Yes | Company | browser as Dee (was 400 — fixed), DB proof 20/1,468/2,144 | none known |
| Executive | Payroll: BES side (cost, margin, settlement) | Owners + Bryan only | Owners + Bryan | `compensation.bes_cost.view` | DB proof (Dee, Bryan see 4 internal rows; Rowell, Tech, leads see 0), `compensation-probe` 37/37 | none |
| Executive (Bryan) | Payroll + compensation, no finance | Yes | Yes | Company | `release-personas-probe` 46/46 | none |
| Partner Portal User | Overview, Clients, Actions Needed, Messages | Yes | Respond, sign, message | Own partner only; no internal fields | phase 77 (12 checks), DB proof as Kaori (earlier today) | Projects & Services, Billing, Updates, Account Settings not re-walked today; **Files waits** on the shared-document storage rule |
| Partner Portal User | Any BES internal surface | No | No | — | phase 77, `partner_services` staff-only policy | none |

## BLOCKING

None open after today's fixes. (Before: Finance and BES Partners failed to
load for the executive; any signed-in user could read BES cost and margin
through two pricing functions; no payroll adjustment could be saved.)

## NEEDS FIX

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

## DEE TO DECIDE

- **Executive = `agency_admin`.** The brief gives the Executive
  organization-wide agent payroll; rule 20b defines Executive as
  `agency_admin` / owner. That now includes Rowell and the "Tech" account.
  If the Tech account should not read company payroll, it should not be an
  admin.
- Real partner **Kevin Hernandez** has a live assignment to the fixture team
  **[TEST] Team A** since 2026-09-25 (a probe side effect). End it from BES
  Partners › Assignments if unintended.

## Test runs recorded today

- Unit suite, typecheck, lint: see the commit for this pass.
- Matrix phases 37, 70, 71: 226/228 → after the probe corrections 150/151 on
  phase 70 (the one remaining is the pre-existing bootstrap mismatch).
- Probes: management-placement 35/35, profile-access-matrix 26/26,
  release-personas 46/46, compensation 37/37.
- Browser (Dee): 44 routes, 0 failed requests after fixes.
