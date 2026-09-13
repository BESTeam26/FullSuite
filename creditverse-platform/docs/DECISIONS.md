# Decisions

Settled decisions, with the reasoning. **These are not open questions.** If one
needs to change, that is a conversation with Dee, not a refactor.

The full records live in `ARCHITECTURE_DECISIONS.md` (implemented),
`CURRENT_PRODUCT_DECISIONS.md` (active doctrine) and `DEFERRED_AGENCY_WORK.md`
(the backlog, with IDs D-001 … D-012). `CLAUDE.md` is the constitution.

## Platform shape

| Decision | Why |
|---|---|
| **One agency, not a reseller platform** | BES is the agency. Customers may refer, never resell. Do not redesign for multiple agencies |
| **A Partner is not a subclass of an organization** | Model 3 exists — fulfillment without SaaS — so BES must be operationally independent of organizations |
| **A SaaS subscription never grants operational access** | Access requires a live `fulfillment_engagements` row naming partner, service, scope, dates and team |
| **One canonical record, authorized views** | No `organization_client` → `agency_client`. Two tables holding one truth is how one truth becomes several |
| **One task engine** | `work_items`. Customization is rows, never tables and never enums. CreditOps is the one deliberate exception, because its domain model is fixed |
| **The database is the authority** | Not the frontend. A UI change is never a security fix |

## Change control

**Classify before building** (`CLAUDE.md` rule 20). Corrections, current-scope
defects and completions: do them now. Security or data integrity: fix
immediately and **narrowly** — never as cover for unrelated expansion.
Architecture changes: plan and document, do not execute. Expansions and
roadmap items: record in `DEFERRED_AGENCY_WORK.md` and continue.

**VALID does not mean NEXT.** **One active epic at a time.**

## Product decisions worth knowing

| Decision | |
|---|---|
| **Approval is not publication** | A partner approving content means BES may schedule it. `Published` is the terminal state, `Approved / Scheduled` is not |
| **Account Credit is money; Processing Credits are units** | Two ledgers, never summed, never one table |
| **FullSuite is the billing source of truth** | Not a spreadsheet, not the provider, not GHL |
| **Suspension stops work, deletes nothing** | And the emails say so, because a partner who fears losing their data stops talking to you |
| **Reminders are balance-driven, not "N days elapsed"** | Day 7 asks what is outstanding, not what the calendar says |
| **No Google Sheets live sync for marketing** | Import once; FullSuite is then the source of truth. A live sync would create a second source for approval state |
| **Partner display is `Company · Person`** | Some agents know the person, some know the company. The pairing builds a shared memory of the account |
| **Plain dates in the interface** | Raw ISO timestamps belong in audit logs. Use `lib/format-date.ts` |
| **Dashboards are visual** | Charts and KPI tiles, not text grids |
| **Documents show as previews** | A list of five files called `Screenshot 2026-09-08…` tells nobody anything |
| **Permanent Delete is Owner-only** | And it requires a reason |
| **Admin ≠ financial access** | Owner gets it; a non-owner needs an explicit Owner grant |
| **Positions are not authority** | Manager, team lead and agent are positions. Authority is capabilities |
| **The partner can start the first conversation** | A portal whose messaging depends on BES remembering to open a door is not reachable |
| **Do not include Jezel anywhere** | She is no longer with BES |
| **Employee and portal identities stay separate** | Specifically Kaori's two accounts. One auth user belongs to one partner |

## The locked stack

GitHub · Vercel · Supabase · Resend · Anthropic · Lob · Authorize.Net ·
GoHighLevel. **Do not introduce an alternative and do not re-suggest a dropped
one.** Details and the "explicitly not used" list: `docs/INTEGRATIONS.md`.

Where a key is missing the feature **says it is not connected**; it never falls
back to a stub or a second provider.

## The roadmap, as Dee last set it

```
1. AGENCY HQ LIVE PILOT              ← observation mode
2. PARTNER PORTAL MVP                ← now in live validation
3. ORGANIZATION PLATFORM REFINEMENT
4. DIY CREDIT REPAIR                 ← documented, not started (D-009)
5. FUNDINGOPS / ADVANCED PRODUCT WORK
```

**Agency HQ is functionally frozen**: repair what breaks real usage; do not
casually alter authorization, canonical Work, Partner ownership, Team structure,
EOD, Production, the CreditOps status model or the BES CRM execution model
unless a real defect proves the model wrong.

## Status language, used exactly

**AUTOMATED PASS · SECURITY PASS · DEPLOYED · UNTESTED LIVE · FIXED AWAITING
LIVE RETEST · LIVE VERIFIED · DEFERRED · BLOCKED.**

Never "DONE" when the requirement needs a real-user test. **LIVE VERIFIED is a
human gate** — only Dee or the operator who hit the issue can close one.

## Current policy

- **Feature development is stopped.** Live validation
  (`LIVE_VALIDATION_CHECKLIST.md`).
- **Authorize.Net production charging is OFF** until Dee approves it
  separately, in writing.
- **A human technical lead is the deployment gatekeeper.** AI assistance may
  write code; it is not the final authority on whether production is safe.
- **Real use is the source of truth.** A passing unit test does not dismiss a
  real defect. If reality contradicts a test, inspect the test's assumption.
