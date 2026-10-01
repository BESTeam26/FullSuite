# Production backlog

**Small on purpose** (Production Operating Mode §14). Four lists, no roadmap.
Anything speculative belongs in `DEFERRED_AGENCY_WORK.md`, not here.

Last reconciled: 2026-09-21, after the Eastern workday lock (`1f6b8e7`).

---

## NOW — affecting daily operations

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
  HUMAN TEST REQUIRED → BROWSER PUSH = VERIFIED once Dee confirms one real
  laptop and one real phone.
- **EOD cutoff still unset** — the reminder uses shift end until
  `agencies.eod_cutoff_local` is set (Dee's mockup: 7:00 PM ET).

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
| N-2 | **Seven people have no pay rate** | Payroll cannot price their time. Dee is adding these. |
| N-3 | **No PHP→USD rate on file** (P-023) | The first payroll release refuses until Dee records the rate or switches the payout currency. |
| N-4 | **Five invitations unaccepted, two expired** | Julius, Gile, Alyssa, Dmacasiab, Roniel are staged but not in; two links have expired and need resending. |


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

- **Bounded rendering for every high-volume list (Dee's rule, 2026-09-30) — DONE 2026-09-30.**
  Every list past a few hundred rows now renders through `useVirtualRows`
  (the list is in `FULLSUITE_PERFORMANCE_RULE.md`); People › Team Members
  was already paged. What remains is the standing rule: a new list past a
  few hundred rows uses the same hook and gets a case in
  `large-lists-are-bounded.test.tsx`.

- Desktop / browser push notifications (brief: `docs/design-references/desktop-notifications-brief-2026-09-21.md`; VAPID keys already stored server-side).
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
