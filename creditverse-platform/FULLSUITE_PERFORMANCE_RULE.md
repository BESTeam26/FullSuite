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

---

## Addendum — Dee, 2026-09-30 (after the FullSuite audit), verbatim

Performance is a release requirement across all FullSuite modules.
No known 10-second interaction may ship.
Every fixed latency defect must stay covered by the FullSuite latency suite.
Performance must be measured by role, not just as owner/admin.
Security equivalence must be proven for any optimization touching RLS, views, policies, or authorization helpers.
New features must not regress protected paths.
FullSuite should feel responsive enough that users think about their work, not the software.

Remaining open performance work, in this order:
1. Reporting pivots at 1–3s
2. BES CRM board around 1.1s
3. High-unread notification bell around 1.1s
4. Any real-world path the team reports as slow even if the synthetic gate still passes

One important thing: do not let the gate become the only truth. If the team still says a screen feels slow, profile that real session. The browser/network/render path can still feel bad even when the DB query is fast.

---

## Addendum — Dee, 2026-09-30 (client list virtualization), verbatim

Lock the client list virtualization as a permanent performance rule:
* large lists must not render every row at once
* do not render hidden desktop/mobile duplicate lists at the same time
* only render what is visible plus a small buffer
* deep scroll must remain accurate
* filters, search, selection, status updates, bulk actions, and row height behavior must continue to work correctly

Add a regression test so the client list cannot quietly go back to rendering 1,000+ DOM rows.
Also add the real interaction paths to the INP/performance coverage:
* Main Client List
* Dispute Queue
* Support Queue
* Partner switch
* client open

Keep the target: normal click INP under 200ms and preferably under 100ms for common navigation.

Any FullSuite list expected to exceed a few hundred rows must use virtualization or an equivalent bounded-render strategy.
That should apply to CreditOps, People, Partners, My Work, EOD punch lists, reporting tables, and any future high-volume list.

### How this is enforced
* `src/components/dashboard/fulfillment/ops-client-list-virtualization.test.tsx` fails the release gate if the client list renders anything like its row count again (1,500 clients must render < 100 rows; no phone cards on a desktop).
* `supabase/scripts/inp-probe.browser.js` is the INP probe: pasted into the browser console on the live app (or driven by the browser tool with REAL clicks — synthetic `.click()` carries no interaction id), it reports click → next paint for Main Client List, Dispute Queue, Support Queue, a Partner switch and a client open, against the 200 ms / 100 ms targets. Run it as an agent account, not only as the owner.
* **The one primitive:** `src/hooks/use-virtual-rows.ts` (`useVirtualRows`) with `VirtualSpacer`. It finds the element that actually scrolls — nearest `data-scroll-region` (DashboardLayout's `<main>`, the CreditOps and FundingOps panes), else the nearest scrolling ancestor, else the document (Partner Portal) — measures rows, and keeps an estimate where layout is absent. Every bounded list uses it; do not write a second one.
* **Bounded today (2026-09-30):** `OpsClientListTable` (CreditOps / FundingOps main list and queues, table and phone cards); `OpsClientListGrid` (card view: 60 cards, then more as the reader nears the end, with a Show more button); `DivisionTable` (every queue view, My Work, department files, dashboards — one presentation per device); `OpsGlobalQueue` (management department queues); Clients directory (`ClientDirectoryPage`); `LiveClientsList`; Funding Files list; Reporting pivot table (`PivotBuilder`); Partner Portal clients; BES Partners list; Team schedule members (`TeamsAndMembers`); EOD "work behind these totals" (`EodProductionSummary`). Already bounded by paging: People › Team Members (`PeopleManager`, 10 a page), partner clients tab (25 a page).
* **Not virtualized, on purpose:** lists bounded by headcount or by a server limit under 200 rows (attendance boards, finance panels, notifications page, activity rails). Convert one the day its bound grows past a few hundred.
* Regression tests: `ops-client-list-virtualization.test.tsx`, `large-lists-are-bounded.test.tsx` (DivisionTable desktop and phone, the grid's reveal), `use-virtual-rows.test.tsx` (scroll-parent discovery).
