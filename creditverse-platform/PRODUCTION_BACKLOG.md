# Production backlog

**Small on purpose** (Production Operating Mode §14). Four lists, no roadmap.
Anything speculative belongs in `DEFERRED_AGENCY_WORK.md`, not here.

Last reconciled: 2026-09-21, after the Eastern workday lock (`1f6b8e7`).

---

## NOW — affecting daily operations

| # | Item | Why it matters today |
|---|---|---|
| N-1 | **Bureau Calling team has no members** | The queue routes work to a team with nobody on it; files would sit unassigned. Needs Dee to place somebody, or the queue stays empty by choice. |
| N-2 | **Seven people have no pay rate** | Payroll cannot price their time. Dee is adding these. |
| N-3 | **No PHP→USD rate on file** (P-023) | The first payroll release refuses until Dee records the rate or switches the payout currency. |
| N-4 | **Five invitations unaccepted, two expired** | Julius, Gile, Alyssa, Dmacasiab, Roniel are staged but not in; two links have expired and need resending. |


## NEXT — Dee's production focus order

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

| Item | Who | What is needed |
|---|---|---|
| Google first-click sign-in (P-028) | Dee / Bryan | One fresh-tab sign-in against the eight-point list. |
| Per-role UI sign-in | An agent, a team lead | Confirm sidebar, queues and absent controls as themselves — the database side is proved (personas probe 46/46). |
| Mobile gestures | Anyone on a phone | Nothing automated can confirm a real touch surface. |
| Presence exceptions (P-041) | Dee | No real unscheduled shift or leave conflict exists yet; only the probe has exercised them. |
| Reactions, mentions, punches (P-036, P-039, P-043) | The team | Verified as Dee on production; the team's own use closes them. |
