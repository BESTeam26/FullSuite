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
  order: all nine pages done 2026-10-02 (Account Settings last; header
  search fixed). Open: D-024 partner email alerts, D-025 partner
  self-service users REJECTED (BES approves every portal access). Cleanup: `PortalClients` in
  PortalSections.tsx is no longer routed (PortalClientsPage is) and is
  kept only by its tests — remove with them.

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
- ~~**EOD cutoff is unset.**~~ SET 2026-10-15 on Dee's decision: **midnight
  Eastern**, stored as `24:00:00` (end of the work date; `00:00` would have
  made the overdue nudge fire at the start of the day). The Agent EOD header
  reads "Due today by midnight"; the reminder goes out at 11:30 PM ET. The
  cutoff's own "overdue" nudge cannot fire for a midnight cutoff (the sweep
  compares the time of day) — the next-morning nudge is a small follow-up if
  Dee wants it. **Auto-submit: DECIDED by Dee 2026-10-15 — YES, "then tag
  as AUTO Submitted so management and the agent is aware."** Built in
  `20261015001000`: the flag goes on, `eod_auto_submit_sweep()` runs every
  15 minutes by cron, submits drafts left past the cutoff from 2026-10-15
  onward (four older real drafts stay as they are), marks them
  Auto-submitted (already labelled so on Agent EOD, Team EOD, member
  profile and rollup), and notifies the agent and every lead of their
  teams. Proven in rolled-back transactions; two named checks in phase 70.
  DEPLOYED 2026-10-15 (the sweep has run live since `20261015001000` was applied).

| # | Item | Why it matters today |
|---|---|---|
| N-1 | ~~**Bureau Calling team has no members**~~ — **DECIDED by Dee 2026-10-15: "leave it empty on purpose."** Later the same day Dee set the team: *"Dee — primary Team Lead, everybody reports to me; Aaron — Admin; Danicko — Lead Processor; Daniel — Lead Processor; Kaori — Support; Ivan — Complaints."* PLACED 2026-10-15 as Dee: Dee is lead on all four CreditOps teams (she receives no production work), Danicko is a lead on Dispute Processing alongside Daniel, Ivan stays on Complaints & Mailing (Daniel stays its lead until Dee says otherwise). **Kaori Gallardo has a profile and an old external (portal) invitation from 2026-09-12 but no staff membership**, so she cannot be placed on Client Success / Support until Dee says "invite Kaori as staff" (Claude runs the staff invitation as Dee) or does it under People & Teams › Invite Team Member. | Bureau Calling stays unstaffed except for Dee. |
| N-2 | ~~Pay arrangements~~ — **SET 2026-10-15 by Dee's instruction**, as Dee, through `set_compensation_arrangement`: Danicko and Daniel ₱25,000/month, Ivan ₱20,000/month, direct BES, PHP, effective 2026-10-01 (the current Oct 1–15 cutoff — Dee: "following same cutoff of the payroll"). Dee and Aaron skipped ("we'll have their payroll later"). **Open:** Dee also said "with hourly rate and Overtime Approve" — the engine has no overtime concept (nothing in code or schema); a monthly arrangement already yields a derived hourly rate for partial days. Overtime: DECIDED, BUILT and LIVE the same day (D-027, `20261015002000`, applied 2026-10-15; phase 70 164/164). HUMAN TEST REQUIRED: a lead approves a real day worked past 8 hours from People & Teams › Attendance and the amount shows on the payslip. **Still open: Danicko has NO work schedule**, so the engine cannot derive his daily/hourly pay — his payslip would be empty and overtime cannot be priced. Daniel and Ivan have schedules. Dee to give Danicko's shift (days, start, end, lunch) or set it on People › Danicko › Schedule & Time. | Payroll skips anyone without one: they get no payslip at all. Set from People › a person › Compensation, or give Claude per person: arrangement (direct BES / via managing partner), basis (hourly · daily · monthly · per cutoff), rate, start date. |
| N-4 | **Four expired, unaccepted invitations remain** (live count, 2026-10-01; everyone named on 09-21 is now active) | Housekeeping only: revoke them or resend if any is still wanted. |


## NEXT — Dee's production focus order

**Open performance work (Dee, 2026-09-30, in this order — the latency suite
guards every fixed path; the gate is not the only truth: a screen the team
says feels slow is profiled as a real session):**
1. ~~Reporting pivots at 1–3 s~~ — FIXED 2026-10-03 (GO_LIVE_STATUS.md "Reporting for leads"; latency suite: pivot 119–124 ms)
2. BES CRM board around 1.1 s (`crm_project_board` per-project helpers) — latency suite 2026-10-14: 15–16 ms for the probed accounts; re-measure on a project-heavy account before calling it done
3. ~~High-unread notification bell around 1.1 s~~ — FIXED 2026-10-02 (GO_LIVE_STATUS.md "the notification bell poll"; suite: 8–10 ms)
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

   **Finished 2026-10-03 to Dee's spec** — header carries Next Action and
   Complete Work · Report Blocker · More; Complete Work is a right drawer on
   desktop and a full-screen sheet on a phone (handoff inside); tabs Work ·
   Client info · Documents · History; checklist shown only when one exists;
   blocker panel reads the STORED blocker. Found on the way and fixed: the
   checklist was unusable in production (policies matched nothing; table
   read-only) and blockers accepted any staff member. Verified live at 360 /
   390 / 412 and desktop. HUMAN TEST REQUIRED: an agent working a real file.

   Still open in this area: the two disconnected letter pipelines
   (`RoundLettersPanel` persists to the database; Print & Download reads an
   in-memory list that is always empty for a live client), and the CreditOps
   department checklist being a second engine beside `work_checklist_items`.
   Neither matters while BES is on DisputeFox.
5. **Notifications / Attention** — the system says what needs action.
6. **Partner Portal** — after the internal workflow is stable (D-007).

## LATER — useful, not currently blocking operations

- **`fulfillment_client_readable()` costs ~90 ms per call for an agent**
  (measured 2026-10-15: 50 rows 5.9 s, 200 rows 18.5 s as bes.credit). It is
  called once per request in the definer readers (client feed, timeline),
  so a screen pays ~90 ms, within target; but anything that calls it per
  row would be slow, and the matrix's whole-table comparison had to be
  bounded to a sample. Worth a look at the partner/team scope subqueries
  it repeats per call. Not blocking.

- ~~**Route/code prefetch audit** (recorded 2026-10-03, Dee)~~ — DONE
  2026-10-14. Measured on the production build (static imports beyond the
  shell): idle warming of every menu route pulled **323 files / 2.6 MB**
  after any page; `prefetch-visible.ts` now warms only the first five menu
  screens (Home, Attention, Communication, My Work, End of Day — **103
  files / 0.7 MB**), hover/focus warming is unchanged for deliberate
  clicks, and a module opened by hand costs its own ~120 files / 0.5 MB
  once. Confirmed in the dev preview: after opening CreditOps, FundingOps,
  BES CRM, TalentOps, Reporting and Finance no longer download. Guarded by
  `prefetch-visible.test.ts`. HUMAN CHECK (optional): a cold load on a phone
  feels lighter; no screen feels slower on first click.

- **The notification bell mounts slowly in jsdom** (17–34 s per device-state
  case under load, 2026-10-01; the suite failed twice on the 30 s limit after
  passing three times earlier the same day). The test allowance is 90 s now.
  **Profiled 2026-10-14:** not the bell. A bare `<Popover>` from
  `components/ui/popover` costs ~5 s of CPU the first time it opens in jsdom
  (bell: 12–24 s per case = one open per case plus load). The CPU profile
  (`--cpu-prof` on the vitest fork) puts 4.5 of those seconds in jsdom's
  selector engine (`Element.matches` → nwsapi) called from jsdom internals
  with no app frame above it — not floating-ui, not React, not the queries
  (`getByRole` was 13 ms). Production is unaffected; a real browser opens
  the popover instantly. Options, none taken yet: (a) pin/upgrade jsdom or
  nwsapi and re-measure; (b) run the popover/dialog test files under
  `happy-dom`; (c) stub `@radix-ui/react-popper` in those two files. The
  time-off request dialog has the same cost (4.6–5.8 s per case,
  2026-10-02); its allowance is 30 s.

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

- **CreditOps · a status change now shows the work it opened (Dee,
  2026-10-15: "When I move them to any open-for-work status, I should have
  them in the open queue on whichever department they belong to … it did
  not open a work for Monitoring Issue").** The database DID open the
  Support row the moment Shanika Dessalines went to Monitoring Issue 2
  (activity: "Support status changed (none) → MONITORING ISSUE"); the
  client file's store reloaded the client but never its cached department
  rows, so the header kept saying "No open work · Unassigned" until a page
  reload. Fixed in `ops-client-store.tsx`: a status change reloads the
  file's department rows and the list's map. Regression test added.
  DEPLOYED 2026-10-15 (`e9a851f`). Support is now in automatic assignment
  mode (Dee: "all support sent them to Kaori"), so new Support work lands
  on Kaori; 329 open Support files re-routed to her. **Why the row showed no assignee:** the Support
  department is in team-lead assignment mode, so the row opens unassigned
  for the lead to hand out — that is the configured rule, not a defect.
  **Dee also asked to remove the Complete Work button.** NOT DONE, on
  purpose, and flagged: Complete Work is where an agent ticks the actions
  done on a file, which is what writes production, the EOD "what I did
  today" table and the handoffs. The status rule above now works without
  it; removing the button would stop production from being recorded. Dee
  to confirm what she wants gone.

- **CreditOps · Complete Work failed with "duplicate key value violates
  unique constraint client_department_statuses_pkey" (Dee, 2026-10-15,
  Joel Marte).** Kaori moved the file to Ready for Round 1 and handed off
  to Dispute in one Complete Work. The status change had already routed
  the file (Dispute row opened, assigned to Danicko); the handoff function
  runs with the caller's rights, and a Support agent cannot see Dispute's
  row, so its "already open?" check found nothing and the insert collided.
  `20261015007000` adds a definer helper that answers "is there a row" for
  a client the caller may write, past row security. PROVEN live in a
  rolled-back transaction as Kaori: the same handoff now returns opened
  Complaints, already open Dispute, no error; a zero-visibility user gets
  "no" from the helper. DEPLOYED 2026-10-15 (`20261015007000`). Joel Marte's file is already
  correct in the database (Onboarding closed, Dispute open with Danicko).

- **CreditOps · "Endorsed to Client" is a credit status (Dee, 2026-10-15:
  "removes the responsibility to the team, and will show to client portal
  as their something needed action").** DEPLOYED 2026-10-15: `20261015008000`
  and `20261015009000` applied; DATABASE VERIFIED: 23 files on Endorsed to
  Client, all lifecycle active, no open department row, one open
  endorsed_to_client action each. A new routing kind,
  client_action: every open department row takes its department's closed
  status, the file leaves every queue, one client-audience action
  (`endorsed_to_client`) is raised with the status it came from, the client
  stays active; the client's answer brings it back through routing exactly
  as For Client Confirmation does. The 23 ClickUp files imported as
  "Program Completed" from source status "endorsed to client" (Shanika
  Dessalines among them) are moved by the migration, their raised actions
  flagged for routing review because their real origin is unknown. Front
  end: the status is in Dee's list after For Partner Confirmation,
  coloured as a client-action status, counted as not-active volume. Unit
  tests pass with the enum value added by hand to `database.types.ts`;
  regenerate (`npm run db:types`) after release. NOT VERIFIED LIVE: a new
  enum value cannot be exercised in the transaction that adds it, so the
  routing branch is proven only by compile and by the For Client
  Confirmation pattern it copies; first live check is Shanika's file after
  release. **The client portal does not exist yet** (roadmap item); the
  action is recorded in `partner_action_items` (audience client) and
  will show the moment that portal is built. HUMAN TEST REQUIRED.

- **Accounts (Dee, 2026-10-15): Aaron uses support@; retire every other
  login of his; remove kaori@.** Script
  `supabase/scripts/accounts-2026-10-15-aaron-and-kaori.mjs`, RUN
  2026-10-15 with `--commit` on Dee's go. It moves the owner flag,
  14 permissions, the chief-operations seat (old ends today, new starts
  today), two teams and two channels from aaron@ to support@; makes aaron@
  inactive (releasing its one headline file) and disables its sign-in.
  Nothing is deleted: 257 foreign keys point at profiles and history must
  stay attributed. kaori@ is not Kaori's staff account — it is the "Test
  Partner" portal contact from 2026-09-12 — so its sign-in is disabled and
  the contact archived.

- **CreditOps locked for every active agent (Dee, 2026-10-15: "ensure all
  working functions are LOCKED and don't make them not working again").**
  `supabase/scripts/creditops-agent-walk.mjs` (`npm run probe:agents`, part
  of `npm run gate`) walks every write of an agent's day as every ACTIVE
  agent on the live roster against every partner with files — open a file,
  change credit status, set own department status, log production, hand
  off, post a note, attach a file, edit contact, clock in, submit EOD, add a
  client on each partner — all rolled back; one refusal fails the gate.
  2026-10-15: 116/116 across Kaori, Danicko, Daniel, Ivan and 18 partners.
  Two regressions from the same day's releases were found by the full
  matrix and fixed, DEPLOYED: (1) `20261015010000` — the inactive-person
  guard treated a customer organization's own processors (org membership,
  no agency membership) as inactive and refused every assignment to them;
  (2) `20261015012000` — the routing rewrite in `20261015004000` had
  dropped P-037 (a new client's chosen agent seeds its first department row
  as a manual override), so Add Client with an agent chosen lost the choice
  to the department's own rule. `20261015011000` makes the handoff row
  check self-contained (no definer leaning on an invoker helper). Matrix
  phases 37, 62, 70 green; 47 re-running after hours (its readable-rule
  checks time out under daytime load). **The full 78-phase matrix was
  stopped mid-run at 881 green / 10 red because it was loading the live
  database during the workday (Kaori: "app not loading properly"); the ten
  reds are the two regressions above, the scoped FundingOps-production
  probe, and statement timeouts. Re-run the full gate after hours only.**

- **Slow season team shape (Dee, 2026-10-15: "All support to Kaori. All
  dispute to Dan and Daniel. All complaints to Ivan. Everyone reports to
  Dee. We removed all other teams.").** RUN 2026-10-15 by
  `supabase/scripts/team-2026-10-15-slow-season.mjs` on Dee's go: Support
  department in automatic mode (329 files to Kaori, 1 left unassigned —
  its status routes elsewhere); Danicko and Daniel are members of the
  Dispute team, not leads (Dispute now 42 / 186 between them); Complaints
  automatic (148 with Ivan); Daniel's two department-manager seats and
  every seat held by an inactive person ended yesterday; Bryan inactive;
  Danicko, Daniel and Kaori's EODs route to Dee. Allyssa Mores (inactive)
  is still marked lead on a Client Success team row — harmless, hidden,
  left as history.

- **EOD · a lead's report is final at the cutoff and counts every lead
  below (Dee, 2026-10-15: "I keep seeing 0 when there should be some
  report. This is not accurate.").** DEPLOYED 2026-10-15 (migration
  `20261015006000` applied, `e9a851f` pushed, Edge Function `eod-email`
  deployed by Dee 2026-10-15 after the harness refused Claude's deploy).
  Found on Dee's live 2026-10-15 row: the Organization report is built the
  moment the lead presses Submit (Dee filed at 11:23 AM Eastern) and is
  frozen — email, stored copy and Team EOD screen all showed the team at
  zero for the rest of the day. Also: every team lead was excluded from
  every report, so Danicko's and Daniel's production could never reach the
  organization total; and a person in two teams of one unit (Aaron) was
  counted twice. Now: a person is a row of every report ABOVE the rung
  they file at; after the midnight cutoff the 15-minute sweep rebuilds each
  lead's documents and snapshot with the whole day and sends ONE "(final)"
  email (an auto-submitted lead report gets its document the same way —
  built by cron it had none); the lead's own screen shows a live build
  until then ("Submitted · updating" → "Final"); the mail filed before the
  cutoff says "Team figures as of 11:23 AM Eastern … final report follows".
  PROVEN against the live rows in rolled-back transactions: the
  organization report lists CreditOps with 4 members (Danicko, Daniel,
  Ivan, Kaori; executives are rows of nothing), Dee's row finalises once
  with one pending "(final)" mail, an agent's submission is untouched, an
  auto-submitted lead draft gets its team document. Unit tests 223/223.
  HUMAN TEST REQUIRED: on the first night after release, Dee receives
  "Organization EOD Report … (final)" shortly after midnight Eastern with
  the day's real figures, and the Team EOD page shows "Final".
  **The zeros on 2026-10-15 were also true at 11:23 AM:** nobody but Dee
  has logged production or an EOD since Julius on 2026-10-09; the new team
  went live that day.

- **CreditOps · Add Client pre-selected the Admin Team (found 2026-10-15
  from the matrix's count delta).** The form pre-selected the first team
  the user LEADS — for Dee, the Admin Team (Corporate) — so two of the
  three clients she added on 2026-10-15 sit on a management team while the
  other 1,451 live files have no team. Fixed in `use-teams.ts`: a team is
  pre-selected only when the user's ceiling requires one; otherwise "No
  team". DEPLOYED 2026-10-15; the two Admin-Team clients cleared by
  `team-2026-10-15-slow-season.mjs` on Dee's go. **Then broken for agents
  (Dee, 2026-10-15, Credit by Nainoa: "new row violates row-level security
  policy for table fulfillment_clients").** `in_scope()` with no team lets
  only an admin or somebody with management reach create; an agent creates
  only inside a team of theirs, so "No team" refused Kaori. Proven as each
  person in rolled-back transactions: Dee OK with any team or none; Kaori OK
  only on Support; Danicko only on Dispute; Ivan only on Complaints. Fixed:
  no team for an admin / agency / division scope, own team and a required
  choice for everybody else; five per-view tests in `use-teams.test.tsx`.
  AWAITING RELEASE.

- **Three CreditOps rules from Dee, 2026-10-15 — DEPLOYED 2026-10-15 on
  Dee's "Go, I want them all live now" (`c91318e`, migrations applied):** (1)
  Ready for Processing / Ready for Round 1 / Prio Processing close
  Onboarding with its own closed status and clear every blocker on the
  file (`20261015004000`; four already-ready files, Leslie included, caught
  up by the migration); (2) a GHL form pasted into Activity keeps its table
  shape; (3) adding a client opens its file instead of returning to the
  list. HUMAN TEST REQUIRED after release: Dee pastes a GHL form into
  Leslie's Activity and sees a table; adds a client and lands on its file;
  moves a file to Ready for Round 1 and sees Onboarding close.

- **Inactive people out of every picker and off every file (Dee, 2026-10-15:
  "remove from the options and all work everyone that is inactive").**
  `20261015003000` releases the 635 department rows and 585 client files
  still held by deactivated staff (Jet Manugas 395), refuses an inactive
  assignee from then on (a person's explicit choice is refused with a
  message; a system pick is released with the reason), and makes
  deactivation release the person's open work. Every picker reads
  `assignablePeople()` — active members only. DEPLOYED 2026-10-15.
  **Still Dee's:** Onboarding routes to the Client Success / Support team,
  whose three members are all inactive, so no Onboarding file (Leslie
  Caudillo Zamora included) can be assigned until Dee places an active
  person on that team (People & Teams › Structure), or tells Claude who.

- **CreditOps · Add Client inside a partner workspace (Dee, 2026-10-15:
  "FIX THE ADD CLIENT HERE. IT's not working!").** DEPLOYED 2026-10-15
  (`f288302`). The duplicate-email check threw on one of the 498 imported
  clients with no email and the click died before any request; fixed at the
  domain and in both live mappers (which also protects every search box).
  Verified in the preview on Credit by Nainoa without writing. **HUMAN TEST
  REQUIRED:** Dee adds Leslie Caudillo Zamora on Credit by Nainoa and finds
  her in the list.

- **CreditOps · a PDF in the client's Activity column opens (Dee,
  2026-10-14: "cant view PDF that's attached to the activity").** DEPLOYED
  2026-10-14 (`4c375ad`, live at app.bescrm.net). The rail drew a non-image
  file as a plain box; it is now a button that signs the object on the click
  and opens it in the in-app FileViewer. UI VERIFIED on Dee's own upload at
  desktop and phone width. **HUMAN TEST REQUIRED:** Dee opens the October
  progress report on Sterlin Cadet's file from the Activity column, on a
  laptop and on a phone.
- **FundingOps · lender creation (`b273a3c`, migration `20261014001000`)
  and Team Lead reads their people's EOD (`6b72fd2`, `20261014002000`).**
  Both APPLIED and DEPLOYED 2026-10-14 on Dee's go; matrix phases 22 and 70
  173/173 afterwards. HUMAN TEST REQUIRED (lenders, low priority while
  FundingOps is paused): an organization admin adds a lender on the Lenders
  page and sees it in the list.

- **CreditOps · Add Client from the Main Client List (Dee, 2026-10-12: "we
  cant add clients in Creditops").** DEPLOYED 2026-10-14 (`fb1fce3`, live at
  app.bescrm.net). The list has no partner in context and the CreditOps
  dialog never offered one, so Save threw before writing — silently; the
  default status "Onboarding" had also been retired from Dee's list, so the
  field showed blank. Now: a Partner field (same wiring FundingOps had),
  default "New Client", record filed under the chosen partner; the insert
  policy is unchanged and still decides who may file under which partner.
  Guarded by `add-client-partner-choice.test.tsx` (fails 4/5 on the old
  code). UI VERIFIED on the preview without saving. **HUMAN TEST REQUIRED:**
  a real operator adds one real client from the Main Client List, and once
  from inside a partner workspace, and finds it in the Onboarding queue.

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
