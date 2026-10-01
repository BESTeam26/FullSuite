# Go-Live Stabilization Pass (Dee, 2026-10-01 — verbatim brief)

Supplied by Dee in chat on 2026-10-01. Recorded unchanged. The status of
the pass is kept in `GO_LIVE_STATUS.md` (the role × module matrix and the
BLOCKING / NEEDS FIX / WORKING / NOT APPLICABLE lists).

---

I want FullSuite to become fully functional and ready for daily team use before we add anything else.
Focus now on a complete Go-Live Stabilization Pass across every role and every existing module.
Test and fix the actual application as:
Agent
Team Lead
Department Lead
Division Lead
Executive / Management
Partner Portal User
I want every existing page, button, drawer, form, filter, table, status change, assignment, message, notification, EOD, attendance, performance and payroll workflow checked for actual functionality.
Do not spend time adding more features right now.
Fix what is already there.
ROLE AND SCOPE RULE
Use the real management hierarchy:
Agent → Team Lead → Department Lead → Division Lead → Executive
Scope should follow that hierarchy.
Agent
Agent sees and manages:

* own profile
* own schedule
* own attendance
* own time entries
* own EOD
* own performance
* own assigned work
* own payroll/payment information

Agent does not manage other employees.
Team Lead
Team Lead manages the people under their team.
They should be able to:

* open agent profiles
* edit appropriate employee/work information
* manage assignments
* review and correct hours
* review attendance
* review and correct attendance where authorized
* review EOD
* review performance
* add coaching/performance information
* manage schedules/time off where permitted
* view agent payroll
* manage agent payroll records
* make authorized payroll corrections/adjustments

Only for people inside their actual Team Lead scope.
Department Lead
Same management capabilities across their department.
Division Lead
Same management capabilities across their division.
Executive / Management
Organization-wide operational management according to their capabilities.
PAYROLL RULE — IMPORTANT CHANGE
Team Leads and management leads are allowed to work with their agents' payroll within their organizational scope.
That includes:

* viewing agent payroll
* reviewing hours used for payroll
* making authorized time corrections
* reviewing compensation
* creating/editing payroll adjustments
* reviewing payroll calculations
* preparing/processing agent payroll
* viewing payroll history
* correcting agent payroll records

Scope follows hierarchy:
Team Lead → own team payroll
Department Lead → department payroll
Division Lead → division payroll
Executive → organization-wide agent payroll
Do not force people into fake teams or assignments just to grant this access.
BRYAN / BES COST MUST REMAIN SEPARATE
There is one important exception:
BES's payment, settlement, compensation, margin, or amount payable to Bryan must NOT be exposed through normal agent payroll management.
Treat these as two different financial concepts:
Agent Payroll
versus
BES / Managing Partner Settlement
Team Leads, Department Leads and Division Leads may fully manage the Agent Payroll side for employees in their scope.
They must NOT see or modify:

* BES payment to Bryan
* Bryan's managing-partner settlement
* BES margin connected to Bryan
* private BES-side settlement calculations
* other restricted company-cost data associated with that arrangement

Do not hide normal agent compensation just because the record also participates in a BES settlement calculation.
Separate the fields/data properly so managers can do their job without exposing the restricted BES-side amount.
Never rely only on hiding a column in the UI. Enforce this server-side too.
AGENT FILE MANAGEMENT
Management should have one clean place to manage an employee within their scope.
From an Agent profile, an authorized lead/manager should be able to work with:

* Profile
* Role / Position
* Team / Placement
* Schedule
* Attendance
* Hours / Timesheets
* Time Off
* End of Day
* Performance
* QA / Coaching
* Payroll
* relevant work history

Respect the hierarchy and permissions at every level.
PARTNER PORTAL
Include the Partner Portal in this stabilization pass.
Test:

* Overview
* Clients
* Projects & Services
* Actions Needed
* Messages
* Billing
* Files
* Updates
* Account Settings

Verify real Partner permissions server-side.
A Partner must never see another Partner's records or internal BES-only information.
Do not add new Partner Portal features until the existing portal works end to end.
FUNCTIONAL TEST — NOT JUST CODE TESTS
For every role, actually verify:

* can they reach the page?
* does it load?
* is the data correct?
* is the scope correct?
* do buttons work?
* do saves actually persist?
* do edits actually update?
* do notifications work?
* does Back/navigation work?
* does refresh keep the correct state?
* do direct URLs obey authorization?
* are empty states understandable?
* are errors visible instead of silently swallowed?

Do not call something functional simply because the component exists or a unit test passes.
PERFORMANCE STILL MATTERS
Keep the FullSuite Performance Rule active.
Any known normal interaction above 10 seconds is a production defect.
Do not let this stabilization pass reintroduce:

* full list refetches
* per-row RLS latency
* huge DOM renders
* unnecessary polling
* eager loading of hidden tabs
* duplicate queries

Keep the existing latency gate running.
PRIORITY NOW

1. Broken functionality
2. Wrong permissions or data exposure
3. Navigation/loading problems
4. Agent and manager workflow
5. Payroll management permissions
6. EOD/Attendance/Performance
7. Partner Portal
8. Cosmetic cleanup
9. New features only after this is stable

FINAL GO-LIVE REPORT
When the stabilization pass is done, give me one simple matrix:
Role | Module | Can View | Can Edit | Scope | Tested | Issues Remaining
Cover:

* Agent
* Team Lead
* Department Lead
* Division Lead
* Executive
* Partner Portal

And separately list:
BLOCKING
NEEDS FIX
WORKING
NOT APPLICABLE
Do not keep expanding the app while doing this.
The objective is simple:
Make the FullSuite we already built fully functional, fast, secure and usable by the team every day.
One thing I would consider officially changed from the earlier design: Payroll is no longer restricted to only Dee/Aaron/Bryan. Operational leads can now manage agent payroll within their scope, while Bryan's BES-side settlement remains separately protected. That separation should be implemented in the data/auth layer, not just visually hidden.
