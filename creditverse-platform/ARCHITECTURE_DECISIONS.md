# Architecture Decisions

Decisions that shaped the system, with enough context that nobody needs to
re-derive them from commit history. Newest first. Small fixes do not belong
here — depth of record matches depth of change.

## AD-012 · 2026-09-21 — Presence precedence, and the two exceptions it must never hide

**Decision (Dee).** One order decides every badge on the presence board, so
two badges can never contradict each other:

```
approved leave → day off / no schedule → live clock → clocked out
              → not in yet → absent
```

with the stated exception that **a live clock must never silently coexist
with Day Off or Approved Leave.** Implemented as: the live clock always shows
as the live state, and the calendar is carried BESIDE it as an `exception` —

| Situation | Board reads |
|---|---|
| Clocked in on a scheduled day off | **Working** + *Unscheduled shift* |
| Clocked in while on approved leave | **Working** + *Leave conflict*, raised for management review |

Neither state overwrites the other. "On leave" for somebody currently working
is a falsehood; "Working" with nothing beside it is half a truth.

With no live entry, first match wins: approved leave → any time logged today
(Clocked out) → day off / no schedule → scheduled with the shift still
running (Not in yet) → scheduled with the shift ended (**Absent**).

**Absent is concluded when the shift ends, not at midnight.** The attendance
engine only calls a day absent once the day is over, because until then
somebody may still arrive; on a live board that is too late to be useful to a
team lead. Same conclusion, reached when it becomes true — and the engine
remains the only thing that decides what the day WAS, for scoring and pay.

**`exception` is derived, never stored, and never an authorization input.**
Proof: `supabase/scripts/presence-probe.mjs`, 13 cases including both
exceptions and the scope check (an agent manages nobody, so the board is empty
for them). Implemented in migration `20260921011000`.

## AD-011 · 2026-09-21 — Organizational units exist because BES has them, not because a type of work exists

**Decision.** The BES structure is the one Dee stated on 2026-09-21 and
corrected the same day:

```
CreditOps    Client Success · Dispute · Complaints & Mailing · Bureau Calling
             (one team each; Bureau Calling empty for now)
BES CRM      CRM Operations → CRM Team (Rowell, James, Mark) — roles in Positions
Corporate    Management → Management Team (the team leads) · Admin Team (Aaron, Dee, Bryan)
```

Three rules fall out of it, all permanent:

1. **Create an organizational unit because BES actually has one, not because a
   type of work exists.** Automation is work, not a department; Onboarding is
   a workflow stage, not a department. `New Client` and `Incomplete
   Onboarding` route to Client Success (`creditops_status_routing`, migration
   20260921010300). Do not recreate an Onboarding department because those
   statuses exist.
2. **Management access comes from placement, never from membership.** A
   manager is a member of ONE operational team (as its lead) and reaches the
   rest through `management_seats` (AD-008). Never add somebody to a team to
   give them visibility; if they formally lead a second team, that is a second
   seat.
3. **A department that still holds a live team cannot be archived** — move the
   team first (20260920007300). Fixture teams live in a hidden fixture
   department and never block the owner (20260921009000).

**Communication channels mirror groups by name** (Management Team, Admin
Team) and stay conversations; a channel is never an authorization source.

**Where the schema needs a department for a lone team** (division, hours,
EOD and reporting all derive through `teams.department_id`), keep ONE neutral
department — CRM Operations — rather than a department named after one kind
of work.

**Duplicates.** Archived duplicate rows that nothing references are deleted
by explicit id (20260921010100); rows that work items, partner assignments or
clients still record (Team Ally, Team Daniel) stay archived and hidden, because
deleting them would erase who did what (rule 4).

## AD-010 · 2026-09-20 — The CreditOps pipeline matches GHL, and the round follows the stage

**Decision.** The CreditOps credit-status list becomes Dee's GoHighLevel
pipeline: the twelve numbered round-sent stages, three CMS issue levels, In
Dispute Mailed and Results Available for Review, added to the five locked
stages that already stood for the start of her pipeline. A `Round N Sent`
status now SETS `fulfillment_clients.round` to Round N in the same statement.

**Context.** Dee: *"instead of just the regular credit status, we want to
match this with our GHL pipeline… Some of these statuses are already locked in
the system, follow what we have locked and add these new credit statuses."*

**Four stages were already here under other names**, and are reused rather
than added a second time — two spellings of one stage is how a pipeline stops
adding up:

| Dee wrote | The locked name |
|---|---|
| New Client Onboarded | New Client |
| Incomplete Onboarding | Incomplete Onboarding |
| Round 1 Ready | Ready for Round 1 |
| Ready for Processing | Ready for Processing |

**The concern, and what was done about it.** `fulfillment_clients.round` has
held Round 1–13 since long before this, so "Round 3 Sent" states in a second
place something the record already knows, and two places holding one truth is
how one truth becomes several (rules 2 and 5). The stages were not dropped —
Dee asked for them and a pipeline board needs a column per stage. Instead only
the status is set by hand and the round FOLLOWS it, through
`round_follows_the_status()`. They cannot disagree because only one of them is
written. A status that names no round leaves the round alone, so moving a
client to Support does not forget which round they reached.

**Routing.** Every new stage has a `creditops_status_routing` row, because a
status with no row there is a label nobody works. Rounds and In Dispute Mailed
are `waiting` in Dispute; CMS issues are `actionable` in Support at
MONITORING ISSUE; Results Available for Review is `actionable` in Support at
READY FOR REIMPORT.

**Not removed.** "Round Sent - Awaiting Results" stays for the clients sitting
on it, and the 39 legacy enum values from the ClickUp and GHL imports are
untouched. The offered list is a product decision, not the enum;
`credit-statuses.test.ts` holds that line and now tests the rule rather than
the count, which is what let the old "is ten long" check survive its own
premise changing.

## AD-009 · 2026-09-20 — One rate could not tell the truth

**Decision.** What a worker earns and what BES pays for them are two numbers,
recorded separately in `compensation_arrangements`, effective-dated and
append-only. The margin between them is derived and never stored. Payroll
prices each arrangement segment of a period with the rate that was true then,
and a released cutoff books BES's cost, not the workers' total.

**Context.** Dee, stating the case that broke the old model: BES pays Bryan
PHP 100 an hour for Archie's work, and Bryan pays Archie PHP 80. The PHP 100
was on file as *Archie's rate* because there was only one field for it. Every
figure downstream inherited that confusion — Archie's payslip overstated his
pay by a quarter, and the released expense understated what left BES by the
margin, because the margin was nobody's line.

**Shape.**

| Concept | Where it lives |
|---|---|
| Both rates, dated | `compensation_arrangements` (agent rate, BES cost, partner, basis) |
| Scoped changes | `compensation_adjustments` — `agent_only` / `bes_only` / `both` |
| The period's price | `compensation_segments()` → `compensation_for_period()` |
| The payslip | `payslips.gross_cents` (worker) vs `bes_total_cents` (BES); `margin_cents` generated |
| The worker's view | `my_payslips` — agent side only |
| The partner's invoice | `managing_partner_settlements` |

**Four rules Dee locked.**

1. An adjustment carries an explicit financial scope. A bonus that moves the
   worker's pay does not move BES's cost unless it says so — except under a
   direct arrangement, where BES *is* the payer and the two cannot diverge.
2. A monthly package prorates by **paid scheduled workdays**, never calendar
   days. A Mon–Fri contractor must not earn less because a month has more
   weekends.
3. Bryan sees payroll, compensation and settlements; company finance stays
   closed to him.
4. Aaron holds every money capability, explicitly granted (AD — see
   `20260920002500`).

**What this cost elsewhere.** `member_pay_rates` stopped being written
independently — it is now the agent-side mirror that
`set_compensation_arrangement()` maintains, because two writers for one number
is how the original confusion happened. `set_member_pay_rate()` kept its name
and now opens a direct arrangement. The single-rate editor was deleted rather
than left as a control that writes a table payroll no longer reads.

**The boundary.** `compensation.bes_cost.view` is owner-gated and separate
from payroll: holding payroll shows what a worker earns and not what BES pays
for them. Row permission was not enough — a worker may read their own payslip
row, so the internal columns are revoked from `authenticated` at the COLUMN
level and served only through `payslips_internal`. The table grant had to go
entirely first: a column revoke cannot carve a hole in `grant select on
table`, which the probe caught after the first attempt silently did nothing.

**Evidence.** `compensation-probe.mjs` — 26/26, including the equivalence
check that a direct arrangement pays exactly what the single-rate generator
paid, so nobody's pay moved on the day this shipped.

## AD-007 · 2026-09-08 — Two security roles; rank retired into facts

**Decision.** Collapse agency security roles to `agency_admin`/`agency_user`
(ownership = `is_owner` flag) and org roles to `org_admin`/`org_user`
(migrations 0233/0234, applied). The manager rank became the explicit
`ops.manage` capability; team-lead reach became the fact of leading a team.

**Context.** Dee's permanent model (GHL-style), delivered mid-sprint; her
governance rule then paused the wider Login As epic. The migration was already
applied and internally consistent, so the safe boundary was to finish frontend
coherence and park the rest (see DEFERRED_AGENCY_WORK.md D-001).

**Why it was safe to keep.** The repository-wide survey proved **no RLS policy
names a role literal** — every role decision flows through ~29 helper
functions, all rewritten in one migration; each affected member's exact
capabilities were carried as member overrides before the collapse; sanity
gates refuse a half-moved model; the full matrix certifies the result.

**Replaced.** The five-step ladder (owner>admin>manager>team_lead>agent),
`atLeast()`/RANK/minRole navigation, `default_scope_for_role` rank defaults.
Retired enum values remain in the type (Postgres cannot drop them) and are
normalized to fail SAFE (owner→admin, ranks→user).

**Invariants.** Nothing is granted by ladder position; ownership moves only by
`transfer_agency_ownership`; an old role value must never resolve WIDER than
what it encoded.

## AD-006 · 2026-09-08 — Login As designed, deferred (D-001)

Session-swap impersonation (minted target session, session_id-claim
disambiguation, both identities audited) is the chosen design; deferred by the
Live Operations sprint. Full design and analysis: DEFERRED_AGENCY_WORK.md.

## AD-005 · 2026-09-08 — The 140-row workbook is a library, not a task list

`crm_requirements` holds the standard; engines instantiate 5–10 work units;
optional scope is checklist actions. Completeness gate:
`crm_requirements_unmapped()` = 0, tested from the committed sheets.

## AD-004 · 2026-09-08 — Derived state over stored status (BES CRM)

Journey, engine state, unit state, health are computed
(`crm_project_journey` etc.) so a screen, a report and an EOD can never
disagree. `test the rule, not the example` applies to their vocabularies
(crm-domain tests read the migrations).

## AD-008 · 2026-09-20 — Management placement is scope (D-021 locked)

Dee: "Role = experience. Management placement = scope. Capability = action."
`management_seats` (chief operations · division manager · department
manager; effective-dated; many per person) is the one place a manager's
reach comes from; Team Lead stays `team_memberships.is_lead`. Canonical
helpers `has_operations_scope`, `managed_divisions`, `managed_departments`,
`managed_teams`, `management_reach` read seats and nothing else. `in_scope`
and `can_see_partner` each carry exactly one management branch; the agent
and team-lead branches are unchanged; `scope_division` /
`scope_department_id` no longer authorize. Money is orthogonal: no seat
grants `payroll.*` / `compensation.*` / `finance.*`; those are owner-gated
keys held by explicit grant. Design and phase mapping:
`ARCHITECTURE_PROPOSAL_MANAGEMENT_PLACEMENT.md`; proof:
`management-placement-probe.mjs`.

## AD-007 · 2026-09-19 — Hire date drives the Employee ID; owner first on a tie

`agency_memberships.hired_on` is the true join date. `employee_code_for`
takes its month and its sequence from `coalesce(hired_on, created_at)`, the
owner sorts first on a same-day tie, and any hire-date change recomputes the
whole agency in one audited pass (`recompute_employee_codes_internal`, two
passes because the codes are unique). The approved format stays
`INITIALS + MMYYYY + '-' + NNN`. Dee's roster IDs (`IO2023-0105`,
`DM2025-0615`) were read as join dates, not adopted as codes.

## AD-006 · 2026-09-19 — Private HR record, payout account, staged onboarding

Three protected tables beside the open `profiles` row, never on it:
`member_private_records` (full date of birth — Dee: kept internally to check
age, reversing 0073's month-and-day-only rule; address; WhatsApp; emergency
contact) read by the person and management in scope, date of birth written
by management only; `member_payout_accounts` (where payroll pays) read by
the person and payroll capability, audited with the last four digits only;
`invitation_onboarding` (HR facts staged against an OPEN invitation) that no
role may read — `accept_agency_invitation` applies it to the canonical rows
and deletes it. Age is derived (`lib/people/age.ts`), never stored. A session
flag that gates a guard defaults to `off` (`coalesce(current_setting(…),
'off')`); the unset-flag NULL let a person write their own date of birth
once (022000).

## AD-005 · 2026-09-19 — Two experiences of one person record

Settings › My Profile is identity and account only (header, Personal
Information, BES Profile read-only, Account & Security, Training, Rewards);
People & Teams › Team Member Profile is management (fifteen capability-gated
tabs). Same rows, no copies. Management intelligence is denied in the
database (`holds_management_view()`, `performance_policy` read restricted),
not hidden in the interface; opening your own management profile redirects
to Settings. Schedule is operational (a team lead may read and set it);
compensation is financial (payroll capability only) — the two never share a
card again.

## AD-004 · 2026-09-19 — The Main Client List respects Partner scope

Dee, after previewing a Complaints & Mailing agent who was offered every
CreditOps client: *"creditops.clients.view may allow the CreditOps
client-directory experience. It must NOT mean all CreditOps clients. Keep
directory permission separate from record scope."* Supersedes the
2026-09-13 rule that opened the directory to every CreditOps user.

The rule, as the database enforces it (`fulfillment_clients_select`,
migration `20260919016000`): a partner-held client is visible when the caller
may see THAT partner (`can_see_partner` — direct assignment, a live team's
assignment, a managed department; admins by role) AND either the record is in
scope or the caller holds the CreditOps directory. Department queues,
checklists and production writes check the client row under RLS, so the
department ∩ partner intersection Dee asked for follows without a change of
their own. `can_see_partner()` and `in_scope()` were not broadened.

Evidence: `complaints-agent-matrix-probe.mjs` — before 8/11 (Partner B's
clients visible, work loggable on them), after 11/11.

## AD-003 · 2026-09-08 — Partner credentials: pointer to Vault, audited reads

`partner_credentials` has no password column; reveal is a capability off by
default and writes the audit row before returning (0225/0227).

## AD-002 · 2026-09-06..08 — One capability call per session

`agency_can_all()` returns the whole capability map; it and `agency_can`
share one resolver (`resolve_agency_capability`), compared key-by-key per
role in matrix phase 67.

## AD-001 · 2026-09 — Engagements, not booleans

`fulfillment_engagements` + `bes_may_fulfil()/bes_engaged_with()/in_scope()`
authorize BES access to customer operations (CLAUDE.md rule 16). Recorded
here for completeness; the full doctrine lives in CLAUDE.md.
