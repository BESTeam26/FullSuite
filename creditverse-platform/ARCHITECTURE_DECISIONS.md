# Architecture Decisions

Decisions that shaped the system, with enough context that nobody needs to
re-derive them from commit history. Newest first. Small fixes do not belong
here — depth of record matches depth of change.

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
