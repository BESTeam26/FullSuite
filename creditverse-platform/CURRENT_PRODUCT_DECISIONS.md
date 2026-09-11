# Current Product Decisions

Active, approved doctrine that materially affects implementation — nothing
else. Brainstorming and future concepts go to `DEFERRED_AGENCY_WORK.md`;
completed history goes to `COMPLETION_REGISTER.md`; permanent build rules live
in `CLAUDE.md`.

## LOCKED ROADMAP (2026-09-10)

Agency HQ live pilot → Partner Portal MVP → Organization platform refinement
→ DIY Credit Repair → FundingOps / advanced. Agency HQ is functionally
frozen; Partner Portal is planned (D-007) and starts only after a clean
pilot checkpoint; DIY is documented (D-009), not started. Rules: CLAUDE.md
§21b.

## PILOT OBSERVATION MODE (2026-09-10, supersedes "build first")

Real BES operations pilot. No proactive development; fix real defects at the
root, capture ideas in `DEFERRED_AGENCY_WORK.md`, log issues in
`PILOT_ISSUES.md`, LIVE VERIFIED is a human gate. Full rules: CLAUDE.md §21a.

## The active program (2026-09-08)

**LIVE OPERATIONS READINESS.** P0 = Invite Users · Timer/My Time · CreditOps ·
Agent EOD / Team EOD · BES CRM. Everything else is deferred unless it blocks
one of these or is a security/data-integrity issue. Checklist:
`LIVE_OPERATIONS_READINESS.md`.

## Security roles (0233/0234, live)

- Agency: **AGENCY ADMIN / AGENCY USER**; ownership is the `is_owner` flag on
  the membership. Organization: **ORG ADMIN / ORG USER**.
- Manager, team lead, agent, processor etc. are **positions and structure**
  (`job_title`, teams, `manager_id`, `position_assignments`) — never security
  authority.
- What the manager rank used to grant is the **`ops.manage` capability**;
  team-surface reach comes from **actually leading a team**
  (`team_memberships.is_lead`).
- Route gates are `user / lead / manage / admin` in `lib/agency/navigation.ts`
  — the menu and the door read the same spec; RLS remains final.

## CreditOps (locked)

- Master statuses: New Client · Incomplete Onboarding · Ready for Round 1 ·
  Ready for Processing · Prio Processing · For Complaints · Round Sent -
  Awaiting Results · Ready For Reimport/ Credit Update · On Hold (Non
  Workable) · For Partner Confirmation. **Do not redesign.**
- COMPLETE WORK = work recording + actions + handoffs. Never an automatic
  master-status mutation.
- Parallel handoffs: source stays open, an active destination is not reset,
  production never duplicates.
- 1 client file worked = 1 production unit; checked actions are a separate
  count.

## BES CRM (locked)

- Old ClickUp = project journey + milestones · 140-row tracker = the build
  standard (`crm_requirements`, fully mapped, NOT 140 live tasks) · Work Units
  = execution · automation = progress/handoffs/QA/EOD/notifications.
- Unit states PLANNED/READY/IN PROGRESS/WAITING/BLOCKED/QA/COMPLETED; journey
  info_gathering→…→complete; both **derived, never stored**.
- A project contains only purchased engines; optional scope is checklist
  actions.

## EOD (locked)

The system reports; the agent does not. Auto-derived: files/actions/
production/time/handoffs/QA. Manual: only what the platform cannot know
(context, blockers, tomorrow). Team EOD aggregates automatically; leads add
exceptions only.

## Tenancy (permanent — see CLAUDE.md 16/16b/17 for the full doctrine)

One BES agency; organizations are customers; a SaaS subscription is never
fulfillment authorization; canonical records with authorized views, no copies.
