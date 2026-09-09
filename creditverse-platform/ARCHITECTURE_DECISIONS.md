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
