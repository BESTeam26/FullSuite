# Production backlog

**Small on purpose** (Production Operating Mode §14). Four lists, no roadmap.
Anything speculative belongs in `DEFERRED_AGENCY_WORK.md`, not here.

Last reconciled: 2026-10-01, after the full review (stale entries corrected against GO_LIVE_STATUS.md and the live database).

---

## NOW — affecting daily operations

- **Go-Live Stabilization Pass, day 1 (2026-10-01).** Status matrix and
  the four lists live in `GO_LIVE_STATUS.md`. Fixed: Finance opened with two
  400s on every tab (a placeholder month reached PostgREST as `0-01-01`);
  BES Partners 400 on `partner_client_counts` (an archived enum value —
  counts now read the lifecycle); `compensation_segments` /
  `compensation_for_period` / `payable_minutes` / `paid_scheduled_days`
  were callable by any signed-in user and returned BES cost and margin
  (execute revoked); `adjust_payslip` inserted a type the check constraint
  refused, so every non-zero adjustment failed; the release event and
  bes_only adjustment audit carried BES-side figures. **PAYROLL RULE
  implemented** (migrations 20261001012000–014000): leads work their
  people's agent payroll in placement scope, executives org-wide, agents see
  their own released payslips (My pay on Time & Attendance); BES side
  unchanged and re-proven. Decided by Dee the same evening and done:
  payroll scope comes from the seat or the payroll key, never `agency_admin`
  (20261001015000); the Tech sample account is deactivated; the seven live
  assignments of real partners to the fixture team "[TEST] Team A" are
  ended.

- **Partner Portal: doctrine recorded (CLAUDE.md §28), inventory done,
  exposure closed 2026-10-01 (migration 20261001008000).** A partner
  contact could read the full `outsourcing_groups` and `partner_services`
  rows (notes, health, account manager, team, processor, contract value)
  through the REST API, and @mentions / the roster handed partners six
  BES staff emails, roles and four team names. Now: the partner's profile
  comes from `my_partner_profile()` (named columns only), the services
  table has no partner branch (they read `my_partner_services`), mentions
  and roster show partners names as "BES team" / "Partner contact" with no
  email, role or team; a suspended partner's contact can still read their
  own row (the whole-portal lockout). Proven as the real partner contact
  before/after and as the owner (unchanged). **Overview rebuilt the same
  day** to the doctrine list — BES contact, services and build progress,
  important updates, message previews, next billing — all from the
  partner-scoped functions, with a render test. **Clients done the same
  day** (migration 20261001009000): the list is Client · Status · Round ·
  Last update · Next step · Action needed; the department and its status
  text left the projection, replaced by `creditops_partner_next_step()`
  (one rule over the department status, worded in `lib/portal/next-step.ts`);
  the timeline names a BES person only when they hold a live partner
  assignment; history and documents load on demand. Matrix phase 77 holds
  it. **Actions Needed done the same day** (migration 20261001010000):
  `my_partner_actions_needed()` is ONE list over four canonical sources —
  asks BES raised (documents, confirmations, approvals, information
  requests, monitoring login), unsigned agreements (signature_requests →
  the signing page), past-due invoices (→ Billing), open build
  requirements (→ Projects & Services) — and the badge counts the same
  list. Kinds `monitoring_login` and `information_request` exist; nothing
  raises `monitoring_login` yet — DEE TO DECIDE: should the Support status
  MONITORING ISSUE raise it automatically, or should an agent ask
  explicitly (a staff control)? Messages done 2026-10-02 (see
  GO_LIVE_STATUS.md); Projects & Services done the same day. Portal work
  order next (Billing, the client-document storage rule and Files done
  2026-10-02):
  Updates (Files (also: shared CLIENT documents live under
  clients/… and the partner storage rule covers only agency/partner/…, so
  downloads will fail once a client file is shared — none exists yet) →
  Updates → Account Settings.

- **Reminders and live delivery shipped 2026-10-01 (Dee: EOD / clock-in /
  clock-out reminders; Slack-style notifications).** `reminders_sweep()`
  runs every 5 minutes: "Time to clock in" (shift start + grace, until +2h,
  no work entry), "Your shift has ended — clock out" (timer still running
  past shift end), "Submit your End of Day" (cutoff − 30 min, or shift end
  when no cutoff is set), "Your End of Day is overdue" (at the cutoff), once
  per person per day, never on approved leave or a day off. Every new
  notification reaches the open app live: toast with Open, desktop
  notification when the tab is not in front (after "Turn on desktop
  notifications" in the bell), a chime for reminders/mentions/DMs (Sound
  on/off in the bell), the unread count in the tab title, and the bell
  rings for 8 seconds. First live run: 9:25 AM ET today, four people got
  the clock-in reminder.
  **Web Push shipped the same day (Dee: "Build Now"):** a device that
  turns on notifications in the bell is registered (`push_subscriptions`,
  own rows only); every new notification nudges the `push-notify` Edge
  Function (trigger `notifications_push` → pg_net, Vault secret), which
  sends to the recipient's devices with VAPID and deletes a device the push
  service reports gone. `public/sw.js` shows the message only when no
  FullSuite window is focused and opens the page on tap; it caches nothing.
  iPhones: Share → Add to Home Screen first; the bell says so. VAPID keys
  rotated 2026-10-01 (function secrets + `agencies.push_public_key`).
  Cost scales with: one push message per notification per subscribed
  device. The bell reads the device each time it opens and offers Turn on
  notifications only when a click can change something; a subscribed device
  is never asked again; a blocked browser gets its own unblock steps; an
  iPhone is told Share → Add to Home Screen first; a device with push does
  not also raise an in-page desktop alert, and the worker stays silent
  while a FullSuite window is in front. **Push delivery health** is
  event-driven: `push_delivery_events` (failed sends, dead devices removed,
  unauthorized attempts, function failures, hand-off failures) written as
  they happen, a trigger alerting the owners once an hour per kind, and the
  card on Settings › Integrations. Proven on production 2026-10-01.
  Laptop (Chrome on Mac), 2026-10-01 12:40 PM ET: steps 1–6 proven by the
  database (device row 12:11 PM; a real EOD reminder created; the sender
  answered sent:1 and the device's last successful push is recorded).
  Steps 7–8 confirmed by Dee: the OS push appeared and tapping it opened
  End of Day. **Closed-app push on Chrome on Mac: VERIFIED, 2026-10-01
  12:40 PM ET (message id 35996, tested destination: End of Day).** The
  earlier "verified" had come before any push had been sent to the device.
  Phone: still HUMAN TEST REQUIRED (all eight steps; iPhone: Share → Add to
  Home Screen first, then turn it on from the bell). As of the 2026-10-01
  review only Dee's laptop is registered: nobody else on the team has
  turned notifications on yet.

- **EOD hierarchy, next step after the Agent view (Dee, 2026-10-01).** The
  Agent EOD Submission View shipped on the existing engine (submit → locked
  snapshot → routed to the lead → email → notification → rollup). Still to
  build for the Team Lead view, in Dee's words: actual client count and
  action totals per person on the team report rows (today only on
  drill-in), a narrative team summary field, and an explicit "Submit to
  Department Lead" control (today the lead's own Submit routes the team
  document upward). Then the same shape for Department Lead → Division
  Head → Executive, which `eod_scopes_led` already routes.
- **EOD cutoff is unset.** `agencies.eod_cutoff_local` is null, so the
  Agent EOD header shows no "Due today by …" line and nothing auto-submits.
  Dee's mockup says 7:00 PM — confirm the time and whether unsubmitted
  days should auto-submit at that time (`eod_auto_submit`).

| # | Item | Why it matters today |
|---|---|---|
| N-1 | **Bureau Calling team has no members** | The queue routes work to a team with nobody on it; files would sit unassigned. Needs Dee to place somebody, or the queue stays empty by choice. |
| N-2 | **12 of the 14 measured people have no pay arrangement** (live count, 2026-10-01 review) | Payroll skips anyone without one: they get no payslip at all. Set from People › a person › Compensation. |
| N-4 | **Four expired, unaccepted invitations remain** (live count, 2026-10-01; everyone named on 09-21 is now active) | Housekeeping only: revoke them or resend if any is still wanted. |


## NEXT — Dee's production focus order

**Open performance work (Dee, 2026-09-30, in this order — the latency suite
guards every fixed path; the gate is not the only truth: a screen the team
says feels slow is profiled as a real session):**
1. Reporting pivots at 1–3 s (`report_pivot` over `report_facts_scoped`)
2. BES CRM board around 1.1 s (`crm_project_board` per-project helpers)
3. High-unread notification bell around 1.1 s (`can_view_activity` per row is the remainder)
4. Any real-world path the team reports as slow even if the synthetic gate still passes

1. ~~**Communication mobile**~~ — BUILT and deployed (P-046). Awaiting Dee's
   six human checks on the installed PWA: system back, keyboard over the
   composer, a real send, @mention insert, photo attach, notification tap,
   plus one unread clearing.
2. ~~**My Work + routing/assignment mobile**~~ — BUILT and deployed (P-047).
   Awaiting somebody with assigned work opening it on a phone.
3. ~~**Clock / attendance mobile**~~ — BUILT and deployed (P-048), with the
   day's accumulation (P-052) and the Eastern workday lock (P-051) on top.
   Awaiting a real punch from a Manila phone read back on a desktop.
4. ~~**CreditOps client workflow simplification**~~ — BUILT and deployed.
   Dee, 2026-09-21: *"I need it to be like ClickUp or monday.com."* A client
   now opens as a card in a panel OVER the list (`ca054b2`), with status,
   owner and due date editable on the card, and the eight credit-repair
   panels behind one Credit tools tab. The separate nine-tab page is gone and
   its URL redirects to the same card (`ab91bbc`). Awaiting a real agent
   working a file on it.

   Credit tools were REMOVED from the card on 2026-09-22 — Dee: *"I dont need
   the credit tools here yet. We're using DisputeFox for credit repair CRM for
   now."* The eight panels under `src/components/clients/` are preserved but
   unmounted, per rule 16b (a pause is not licence to remove the foundation).
   Nothing renders them; re-mounting is one tab.

   Still open in this area: the two disconnected letter pipelines
   (`RoundLettersPanel` persists to the database; Print & Download reads an
   in-memory list that is always empty for a live client), and the CreditOps
   department checklist being a second engine beside `work_checklist_items`.
   Neither matters while BES is on DisputeFox.
5. **Notifications / Attention** — the system says what needs action.
6. **Partner Portal** — after the internal workflow is stable (D-007).

## LATER — useful, not currently blocking operations

- **The notification bell mounts slowly in jsdom** (17–34 s per device-state
  case under load, 2026-10-01; the suite failed twice on the 30 s limit after
  passing three times earlier the same day). The test allowance is 90 s now;
  the real item is whatever the popover + portal mount does that costs
  seconds — profile `NotificationBell` under vitest and cut it. The time-off
  request dialog has the same cost (4.6–5.8 s per case, 2026-10-02); its
  allowance is 30 s.

- **Bounded rendering for every high-volume list (Dee's rule, 2026-09-30) — DONE 2026-09-30.**
  Every list past a few hundred rows now renders through `useVirtualRows`
  (the list is in `FULLSUITE_PERFORMANCE_RULE.md`); People › Team Members
  was already paged. What remains is the standing rule: a new list past a
  few hundred rows uses the same hook and gets a case in
  `large-lists-are-bounded.test.tsx`.

- TalentOps beyond the shipped workspace (D-022).
- **Retention classes for sensitive uploads** (credit reports, identity
  documents, payroll files) so old files expire on a schedule instead of
  relying on somebody deleting the message. Dee, 2026-09-21: worth doing,
  explicitly not today. The purge worker (P-050) is the mechanism it would
  reuse — it already deletes by queue, batch and retry.
- CreditOps Onboarding-queue wording and any further queue polish.
- Advanced reporting, dashboards, FundingOps depth — only if real operating need pulls them forward.

## ANSWERED BY DEE 2026-09-23, ALL THREE FIXED

The security gate's last open questions. None was a judgement a migration
could make on its own; all three were hers, and she answered them directly.

- **"if the file belongs to their team or department, they can access or view
  because it can be used as reference, but if the project like bescrm or
  talentops being shared to creditops, should not."** So an agent reaching an
  unassigned CreditOps file on their own team is CORRECT, and the probe that
  called it a leak had been wrong for months. The real boundary is between
  MODULES, it already holds (measured at zero for both an agent and a division
  manager), and it is now pinned by its own checks.
- **"Aaron has access to everything, I repeat, everything, he's an owner."**
  Every active owner now carries agency scope, written as the rule rather than
  the name so the next owner cannot land in the same state.
- **"no need for this because it's the same as round sent status."** So
  `mark_client_mailed` no longer overwrites the stage the agent chose; the
  round in the post survives, and the 30-day clock is untouched.

## HUMAN GATE — needs Dee or a real operator

- **Notifications are TWO delivery channels, verified separately (Dee,
  2026-10-01).** (1) In-app: toast, ringing bell, tab-title badge, desktop
  alert while a tab is open — LIVE VERIFIED. (2) Closed-app push — NOT
  VERIFIED until, on a real device, all eight steps pass, in order: user
  clicks Turn on notifications → browser permission granted → a
  `push_subscriptions` row exists for that user and device → the bell
  reads "Notifications are on for this device" → FullSuite fully closed or
  backgrounded → a real notification is created → the OS-level push
  appears → tapping it opens the correct FullSuite destination. One laptop
  and one phone, each all eight. Permanent safeguards, each held by a
  test or a database rule: registration failures are shown to the user
  (bell + console); a person registers and reads only their own devices
  (matrix phase 76); health and the device list are admin-only (phase 76);
  dead devices are removed by the sender (push_delivery_events
  device_gone); no OS push while a FullSuite window is focused (sw.js)
  and no in-page alert on a device that has push; deep links use the one
  canonical link rule (`notification-href.ts`, shared by bell, toast and
  sender). Management view: Settings › Integrations › Push delivery —
  registered devices (user, browser and system, registered, last push,
  last failure) and devices removed as dead, read on open, never polled.

- **Blank page after a search on 2026-10-01 — fixed, one refresh needed.**
  A tab open since before the day's deploys navigated to CreditOps and
  fetched a page chunk the deploy had removed; nothing caught it, so React
  unmounted everything. Now a stale chunk reloads the page once at the same
  address, and any other page error shows "This page hit a problem" with
  Reload and Home while the menu stays (`RouteErrorBoundary`). Tabs still
  running the old build need ONE manual refresh to pick this up; after that
  it protects them. FIXED AWAITING LIVE RETEST — the next deploy with staff
  signed in is the test.

- **Scores count from October 1, 2026 (Dee, 2026-09-30: September was the
  testing phase).** `attendance_policy.scoring_starts_on = 2026-10-01`
  (migration 20260930037000). Attendance points, lates, coaching alerts,
  Compliance and Quality all ignore days before it; the quarter-close reward
  sweep (Edge Function v6) skips 2026-Q3. Nothing was deleted: clock records,
  EOD filings and the ten September corrections remain as history. No pay
  deductions existed to reverse. DEPLOYED · DATABASE VERIFIED · UI VERIFIED
  as the owner — Dee, on or after Oct 1, open My Attendance as an agent and
  confirm Q4 starts clean at 15 points with no September lates.

- **Dispute / Support / Onboarding queue under ALL QUEUES snapped back to the
  Main Client List for managers (fixed 2026-09-30, `creditOpsMayOpenView`).**
  The sidebar drew the queues a manager may inspect; the page's guard only
  accepted queues the person is a member of, so the click was undone within
  a second. FIXED AWAITING LIVE RETEST — Dee, click Dispute Queue as the
  owner and confirm it stays.

| Item | Who | What is needed |
|---|---|---|
| Google first-click sign-in (P-028) | Dee / Bryan | One fresh-tab sign-in against the eight-point list. |
| Per-role UI sign-in | An agent, a team lead | Confirm sidebar, queues and absent controls as themselves — the database side is proved (personas probe 46/46). |
| Mobile gestures | Anyone on a phone | Nothing automated can confirm a real touch surface. |
| Presence exceptions (P-041) | Dee | No real unscheduled shift or leave conflict exists yet; only the probe has exercised them. |
| Reactions, mentions, punches (P-036, P-039, P-043) | The team | Verified as Dee on production; the team's own use closes them. |
