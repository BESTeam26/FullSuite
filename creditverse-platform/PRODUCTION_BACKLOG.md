# Production backlog

**Small on purpose** (Production Operating Mode §14). Four lists, no roadmap.
Anything speculative belongs in `DEFERRED_AGENCY_WORK.md`, not here.

Last reconciled: 2026-09-21, after the production release (`0014381`).

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
3. **Clock / attendance mobile** — clock in, break, lunch, out.
4. **CreditOps client workflow simplification** — work a file without knowing the model.
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

## HUMAN GATE — needs Dee or a real operator

| Item | Who | What is needed |
|---|---|---|
| Google first-click sign-in (P-028) | Dee / Bryan | One fresh-tab sign-in against the eight-point list. |
| Per-role UI sign-in | An agent, a team lead | Confirm sidebar, queues and absent controls as themselves — the database side is proved (personas probe 46/46). |
| Mobile gestures | Anyone on a phone | Nothing automated can confirm a real touch surface. |
| Presence exceptions (P-041) | Dee | No real unscheduled shift or leave conflict exists yet; only the probe has exercised them. |
| Reactions, mentions, punches (P-036, P-039, P-043) | The team | Verified as Dee on production; the team's own use closes them. |
