# FULLSUITE PERFORMANCE, NAVIGATION & UX RULE

Dee, 2026-09-30 — supplied verbatim; permanent.

This rule applies to the entire FullSuite application.
Speed, navigation responsiveness, loading behavior, and user experience are release requirements.
FullSuite is an operations platform used all day by real teams. Slow navigation directly reduces productivity.

## 1. NAVIGATION MUST FEEL IMMEDIATE
Any click on:
* sidebar items
* tabs
* Partner folders
* queues
* client rows
* buttons
* filters
* dropdowns
* drawers
* modals

must give immediate visual feedback.
The user should never wonder whether their click worked.

## 2. LATENCY STANDARD
Target experience:
* simple navigation: ideally under 300 ms
* normal page/list load: ideally under 1 second
* heavier workspace/report: preferably under 2 seconds
* 3–5 seconds: investigate and optimize
* 5–10 seconds: unacceptable unless caused by a documented external dependency
* 10+ seconds: production defect and release blocker

No known 10-second interaction may ship.

## 3. KEEP THE APP SHELL MOUNTED
Do not reload the entire application when moving between:
* Partners
* queues
* client records
* tabs

Keep the FullSuite shell and module navigation mounted where possible.
Only change the content area that actually needs to change.

## 4. LOAD ONLY WHAT THE USER NEEDS
Heavy secondary areas must be lazy-loaded:
* Activity
* History
* Files
* Identity & Access
* Credit Tools
* detailed EOD punch lists
* assignment rosters
* large reports

Do not fetch hidden tabs during the initial page load unless they are required for the visible screen.

## 5. NEVER BLOCK THE WHOLE PAGE FOR SECONDARY DATA
If one panel is slow, only that panel should show a loading state.
The rest of the workspace should remain usable.
Do not freeze the entire screen because:
* Activity is loading
* files are signing
* a secondary report is loading
* a roster is loading

## 6. USE CACHED DATA SAFELY
When data is already available and still valid, use it immediately.
Small mutations should update the affected row locally instead of refetching entire lists.
Example:
Status change on one client:
`update one cached row`
NOT:
`reload 1,000 clients`

## 7. QUERIES MUST BE BOUNDED
Avoid:
* unbounded list queries
* giant ID lists
* loading all clients when only one Partner is open
* fetching all departments when only one queue is needed

Use:
* scope-based queries
* pagination
* bounded lists
* virtualization where needed

## 8. PARALLELIZE INDEPENDENT WORK
Do not run unrelated requests sequentially if they can safely run together.
Example:
Partner details + queue counts + visible columns
can load independently where appropriate.

## 9. SECURITY MUST NOT BE TRADED FOR SPEED
Every performance change touching:
* RLS
* policies
* security views
* authorization helpers
* visibility functions

must prove before/after visibility is identical for real roles.
Never improve speed by:
* bypassing RLS
* using owner privileges incorrectly
* broadening scope
* weakening Partner boundaries

## 10. TEST REAL USER ROLES
Performance must be measured as:
* Owner / Executive
* Division Manager
* Department Manager
* Team Lead
* Regular Agent
* Non-module / zero-visibility user

Admin performance alone is not enough.

## 11. PERFORMANCE REGRESSION LOCK
Once a slow path is fixed, add it to the permanent FullSuite latency suite.
Track:
* target latency
* regression guard
* real production baseline
* role tested
* request count

A future release that causes a major regression must fail the release gate.

## 12. USER EXPERIENCE RULE
The app should always communicate state clearly:
* immediate click feedback
* skeleton/loading state where appropriate
* no dead buttons
* no silent waiting
* no layout jumping
* no losing scroll/filter state unnecessarily
* no unnecessary full-page reloads

## 13. PERFORMANCE PRIORITY
For FullSuite development, priority is:
1. Speed
2. UI responsiveness
3. Stability
4. Security
5. Operational workflow
6. Reporting
7. New features

If a new feature makes the app noticeably slower, fix the performance regression before shipping it.

## 14. PRODUCT PRINCIPLE
FullSuite should feel fast enough that users think about their work, not the software.
The system should reduce friction, not create it.
