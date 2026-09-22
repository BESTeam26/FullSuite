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
| N-5 | **Seven department rows carry a status no queue recognises** | Needs one decision from Dee, listed below. Until then those files can sit in a queue they should have left — Bryan Rodriguez is in five at once. |

### N-5 in full — what each unrecognised status should become

The CreditOps Status Guide is the vocabulary every queue routes on. These
seven rows hold something else, so `departmentWorkState()` cannot tell whether
the work is finished. They are marked "unrecognised" on the case page rather
than guessed at, because the guess decides whether somebody has work.

| Department | Stored | Rows | The question |
|---|---|---|---|
| Onboarding | `Complete` | 2 | Onboarding has no COMPLETED. Is this **OB READY FOR R1** or **PARTNER ENDORSED**? Both close the queue. |
| Onboarding | `Ready for Round 1` | 1 | **OB READY FOR R1** (onboarding finished), or the Dispute status of that name on the wrong department? |
| Complaints | `CFPB Needed` | 2 | A complaint to raise. **LETTERS PENDING**, or a new guide code? |
| Complaints | `FTC Needed` | 1 | Same question. |
| Complaints | `For Complaints` | 1 | Looks like "hand this to Complaints" — probably **CM NOT NEEDED**'s opposite, i.e. the entry status. |
| Dispute | `In Progress` | 1 | **READY FOR PROCESSING**, or something the guide is missing? |
| Support | `Not Started` | 1 | **SUPPORT NEW**? |

Casing alone is not the issue: the comparison already uppercases. These are
different words. Once Dee answers, one migration normalises them and the
queues correct themselves.

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

   Still open in this area: the two disconnected letter pipelines
   (`RoundLettersPanel` persists to the database; Print & Download reads an
   in-memory list that is always empty for a live client), and the CreditOps
   department checklist being a second engine beside `work_checklist_items`.
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
