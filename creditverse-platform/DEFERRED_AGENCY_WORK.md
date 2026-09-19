# Deferred Agency Work

The backlog Dee's governance rule requires (2026-09-08): everything valid but
**not next**. An item here is preserved with enough analysis that a future
session can execute it without re-deriving the groundwork — and without Dee
having to remember she asked.

Rules for this file: one entry per item, status always `DEFERRED`, and nothing
in here is licence to build. The active program and its scope live in
`LIVE_OPERATIONS_READINESS.md`; product doctrine lives in
`CURRENT_PRODUCT_DECISIONS.md`.

---

## D-001 · GHL-style Login As (true effective-user impersonation)

- **Requested by:** Dee, 2026-09-08 (72-section directive), then deferred by
  Dee's governance rule the same day (§0, §39, §50) unless required for pilot
  invites.
- **Category:** Architecture change
- **Status:** DEFERRED — Priority: Future Architecture.
  Dependency: after Live Operations testing.

### Problem / goal
Every Agency Admin gets **Login As** automatically (no permission key, no
Super Admin): pick any Agency User / Organization Admin / Organization User,
and the entire application becomes that person — menu, data scope, search,
files, communication, writes — enforced by the DATABASE, not by hiding menus.
Actor and effective identity are both audited on every write (better than
GHL, whose audit can attribute impersonated changes to the target). Exit via
"Back to Agency Admin". Sessions short-lived and revocable.

### What already happened (do not redo)
- **The role collapse is DONE and LIVE** (migrations 0233/0234, applied and
  certified 2026-09-08): security roles are `agency_admin` / `agency_user` and
  `org_admin` / `org_user`; ownership is `agency_memberships.is_owner`; the
  manager rank became the `ops.manage` capability; every affected person kept
  their exact prior capabilities via member overrides. Frontend speaks the
  same language (`navigation.ts` gates: user / lead / manage / admin).
- **The old View As / Access Preview is SUPERSEDED but still present**
  (parked): `/app/access-preview`, `view-as-context`, `AccessInspector`,
  `ViewAsBanner`, permission key `access.preview_as_user`, DB functions
  `can_preview_as_user`, `access_capabilities_for_user`,
  `access_profile_for_user`. Remove them only when Login As lands (§69 of the
  directive), and keep `agency_can_for_user` — it is the generic per-user
  capability resolver `announcement_notifiable` now depends on.

### Designed approach (validated against the live schema, not yet built)
1. **Session swap, not a parallel context.** An Edge Function `login-as`
   (service role) validates the caller's JWT is an ACTIVE agency admin, the
   target is active and not an admin, then mints a real Supabase session for
   the target (`auth.admin.generateLink(magiclink)` → server-side `verifyOtp`).
   The whole app then IS the target — RLS fidelity for menu, data, search,
   files, writes with zero per-feature work.
2. **Hard expiry without revocation infrastructure:** hand the client only the
   access token (≤ 60 min), never the refresh token. Manual exit = restore the
   saved actor session + mark the row ended.
3. **`agency_impersonation_sessions`** row written only by the function:
   agency, actor, effective, **`auth_session_id` (the `session_id` claim of
   the minted JWT)**, started/expires/ended, reason, status. The session_id
   claim is what disambiguates the minted session from the target's own
   genuine sessions — audit triggers join on it, so Daniel working while
   impersonated is never misattributed.
4. **Audit enrichment:** `activity_events` (+ production_logs for §41 EOD
   hygiene) gain `impersonated_by` / `impersonation_session_id`, filled by
   trigger from the active session row matching the JWT's session_id. EOD
   marks impersonated production ("recorded via Login As") rather than
   silently counting it.
5. **Tab model:** the Supabase client persists the session in localStorage, so
   Login As applies to EVERY tab; exit restores every tab. Deterministic and
   documented (§32 satisfied).
6. **Frontend:** profile menu → "Login As" → searchable picker (targets served
   by the same Edge Function, grouped Agency / Organization); lightweight
   indicator "Daniel · via Dee Gallardo"; "Back to Agency Admin".
7. **Matrix phase:** impersonation probes (start/refuse/expiry/audit both
   identities/suspended target ends) + full run (§68).

### Migration analysis (already performed, still valid)
- **No RLS policy names a role literal** — all role logic flows through ~29
  functions; the 0234 rewrite carried the whole database at once. The same
  survey lists every function body in the session transcript of 2026-09-08.
- `in_scope` was already data-driven (`scope` column) — rich scope survived
  the collapse untouched. `assigned_only` on org memberships is the existing
  "Only Assigned Data" (§27).
- `organization_role_access` has zero rows and only frontend consumers — org
  department access is presentation; per-member department access is part of
  the §56 Access-page redesign, also deferred.

### Remaining sub-items when this resumes
- Edge Function + session table + audit columns (the actual impersonation).
- Access page simplification (§55/§56): security role + owner flag + module
  access + Only Assigned Data + granular permissions; positions shown
  separately.
- Remove the parked Access Preview surface and its permission key.
- Per-member org department access (replace role-keyed
  `organization_role_access`).
- Deeper capability keys if `ops.manage` proves too coarse (split into
  workspaces.manage / calendar.manage / ai.economics.view / org config).

### Risk if ignored
Low while the team is small: admins hold full access, and the parked View As
gives read-only inspection. The GHL-style support experience is a product
gap, not a security gap.

---

## D-002 · ClickUp Partner + Logins migration

- **Requested by:** Dee (partner database + logins), deferred by sprint §49,
  then green-lit ("proceed") and executed 2026-09-09.
- **Category:** Data migration
- **Status:** PARTNERS DONE (migrations 0243–0245, 26 partners with services
  and engagements). CLIENTS: Dee handles herself later — her ruling
  2026-09-09; the status-mapping proposal and email options are in
  `docs/MIGRATION_READINESS.md`. Canceled partners stay out (her ruling).
  LOGINS: always by hand into the vault; never imported by tooling.

`lib/migration/clickup-partners.ts` (25 tests) scrubs credentials and
proposes partner imports; the ClickUp **Logins** list (901815950300, zero
custom fields, credentials in task descriptions) maps onto the credential
vault (0225/0227): username/url/code destination in the clear, passwords
re-entered into the vault — never imported from plaintext, marked
`CREDENTIAL_MIGRATION_REQUIRED`. Workspace hierarchy already surveyed
(BES MAIN CLIENTS / OUTSOURCING CLIENTS / TalentOps Only / Canceled).

## D-003 · Org-side hub/portal expansions, Finance, integrations backlog

Everything under sprint §5 (Zoom/Meet, advanced reporting, DIY, portals,
SmartCredit, Metro 2 intelligence, marketing systems, template libraries).
Each was already tracked in `COMPLETION_REGISTER.md`'s needs list (B5/B6/B7,
A5/A6/A7, decisions C1–C16); nothing new is recorded here to avoid a second
list of the same items — that register remains their home.

## D-004 · Shared Template Engine — Custom Values + Merge Fields

**Recorded 2026-09-09 (Dee's directive, verbatim intent). VALID approved
product direction; NOT an active epic during Live Operations Readiness.**
Dee never has to re-request this — activating it is one sentence.

**Problem.** Emails, invitations, and eventually contracts, agreements,
invoices, SMS, notifications and portal messages each need business values
and record fields filled in. Building a placeholder mechanism per feature is
how one truth becomes several (rules 2/5). GHL solved this with one variable
system; BES needs its one canonical equivalent.

**Architecture (planned).**
- **One renderer.** A single module (target: `src/lib/templates/engine.ts`,
  shared with Edge Functions via `supabase/functions/_shared/`) that resolves
  `{{namespace.field}}` tokens from an ALLOWLISTED registry. Data resolution
  only — never JavaScript, SQL, HTML script, or any expression evaluation
  from a token. Unknown token = unresolved, never silently blank.
- **Two concepts, kept apart.** CUSTOM VALUES are stored reusable
  configuration (`{{custom_values.support_email}}`); MERGE FIELDS resolve
  from the current record context (`{{contact.first_name}}`,
  `{{invitation.activation_link}}`). Users may never create a custom value
  named into a system namespace (`contact.*`, `invitation.*`, …).
- **Custom values storage.** `custom_values` table: stable machine `key`
  (never keyed by display label), value, label, description, scope,
  updated_by/at, audited changes. Scopes: platform default → agency →
  organization (→ partner only where genuinely needed), with EXPLICIT
  per-field inheritance rules — no global inheritance invention. Keys whose
  canonical home already exists (company_name → agencies.name, tagline /
  logo_url / primary_color → agencies.branding) resolve READ-THROUGH from
  that home rather than duplicating it (rule 2). NEVER store secrets
  (passwords, API keys, tokens) in custom values — secrets live in the
  integration/secret layer and the Logins vault.
- **Field registry.** One catalogue describing every supported token: token,
  label, category (Business/Contact/Partner/Organization/User/Service/
  Agreement/Invitation/Date/System), data type, supported contexts,
  sensitivity, required-vs-optional, fallback, preview availability.
  Namespaces per Dee: contact.*, user.*, partner.*, organization.*,
  invitation.* (activation_link, expires_at, role, portal_name),
  agreement.*, service.*, {{today}}, {{current_year}} — preserving any
  existing date tokens (e.g. right_now.*) rather than inventing a parallel
  date syntax.
- **Safety.** HTML-escape dynamic values per output context (a partner name
  must never inject script); detect unresolved REQUIRED tokens and BLOCK
  send/generation, listing exactly which tokens failed; optional tokens go
  blank only when the registry marks them optional. No fallback syntax until
  a real need names one.
- **Editor & preview (future).** Every template editor gets an "Insert
  Custom Value / Merge Field" picker (search + categories, insert at
  cursor); preview with sample data always, preview with a real record where
  authorized — never "send one to test formatting".
- **Template library (future).** One library for Email/SMS/Agreement/
  Contract/Notification/Document: name, type, scope, subject, body, context,
  version, status, created_by, updated_at.
- **Immutability (CRITICAL future rule).** Generating an agreement RESOLVES
  the template and stores the rendered snapshot; once signed, the content
  NEVER changes because a custom value or contact field changed later.
  Templates are versioned: sent messages and signed v1 agreements are
  untouched by v2. Audit template create/update, custom-value change,
  document generation, send, signature — with template version references,
  without logging message bodies into generic audit noise.

**Why deferred.** The invitation emails already carry Dee's copy verbatim
(deployed 2026-09-09), so the narrow renderer slice is not NECESSARY to
improve the current invite flow — and everything beyond it (tables, editor,
preview, versioning, agreements) is a new epic. §26 of Dee's directive says
exactly this: document, defer, do not distract from CreditOps / EOD / Timer /
BES CRM / Invite Users.

**Dependencies.** None hard. First activation slice: engine + registry +
`custom_values` table + convert send-invitation to the renderer.
**Risk if rushed.** A second placeholder dialect in one corner of the product
that contracts later have to stay compatible with.

## D-005 · Document Builder with e-signature (DocuSign-style)

**Recorded 2026-09-09 (Dee's directive). BUILT the same day, when Dee said
"proceed with building all requests based on their priorities". Live in
migrations `20260909005200_document_builder` + `005300`, the
`send-signature-request` function, Settings → Documents & Signatures, the
public `/sign/:token` page, and "Send for signature" on a team member's
Documents tab. Fourteen matrix probes in phase 70. Register entry: "A
document is written once, frozen per person, and signed by a link". Kept
here for the design record; the partner-contact and client signer kinds are
wired in the database and data layer but have no button yet — see the
register entry for the exact remaining edge.**

**What Dee asked for, verbatim in intent:** create documents in Settings with
**folders** (Partner documents, Agent documents, Credit-repair documents,
proposals, agreements, anything else), containing **custom values / merge
fields** and a **SIGNATURE field** plus the **date they signed**; then select
a document on a person or partner, and an email goes out asking them to sign
— "just like DocuSign or GHL Documents".

**What already exists and must be reused, not rebuilt:**
- `member_documents` (0273) — the per-person signature lifecycle (draft →
  pending_signature → signed/acknowledged → expired/superseded/archived), the
  `people.documents.manage` capability, files-row and storage-byte gating, and
  the audit onto the person's history. The builder FILLS this, it does not
  replace it.
- The partner file model (`files` + `shared_with_partner` +
  `set_partner_file_shared`) for the partner-facing half.
- `send-invitation`'s branded mailer and the `invitations` token pattern — a
  signature request is the same shape: a tokenised link, valid for a window,
  usable only by the addressee.
- D-004's renderer, registry and custom values — the merge fields ARE that
  system; building a second placeholder dialect here is the thing to avoid.

**The new pieces, when activated:**
1. `document_folders` (name, kind, parent) and `document_templates` (folder,
   name, body, version, status, created_by) — templates are versioned and a
   v2 never rewrites a v1 already sent.
2. A field model: merge fields (resolved at generation) versus **signature
   fields** and **date-signed fields** (filled by the signer, positioned in
   the body).
3. `document_signature_requests`: document, signer (a member, a partner
   contact, or a client), tokenised link, sent/opened/signed timestamps, IP
   and user-agent captured at signature, and the **rendered snapshot** taken
   at generation.
4. A signing surface at `/sign/:token` — outside the app shell, no account
   required, the addressee's email verified the way partner invitations are.
5. Completion writes back: the signed PDF/HTML into `files`, the
   `member_documents` row to `signed` with its date, the audit event.

**The rule that must not be lost:** once signed, the content NEVER changes
because a custom value, a rate, an address or a contact was edited later. The
snapshot is the document. This is the same immutability D-004 records for
agreements, and it is why the builder cannot simply re-render on read.

**Why deferred.** It is a full epic — folders, an editor, a field placer, a
public signing surface, e-signature evidence and a template library — and the
current P0 (Invite Users, CreditOps, EOD, Timer, BES CRM) does not depend on
it. Uploading and tracking already-signed documents works today on the Team
Member profile, which covers the operational need until this is built.

## D-006 · Referral portal inside the Partner Portal

**Recorded 2026-09-09 (Dee's request, alongside the BES CRM Partner →
Business → Project presentation). VALID; NOT built — an architecture
change, classified under rule 20 and documented rather than started.**

**What Dee asked for.** A partner opens the Partner Portal and can refer new
customers to BES from inside it — see their referral link, who they sent,
and what that earned.

**Why it is an architecture change and not a screen.** The referral model
that exists (0130 `referral_codes` / `referral_attributions` /
`referral_events`, and the commissions ledger's second reason to owe money)
is owned by a **SaaS organization**: `referral_codes.organization_id` is NOT
NULL, attribution is to an organization, and payout follows an
organization's referral plan. A BES Partner in model 3 is an
`outsourcing_groups` row with **no organization**. Giving partners a
referral portal therefore means one of:

1. widening `referral_codes` to an either-or owner (organization **or**
   partner group — the same shape `fulfillment_engagements` and
   `crm_projects` use), with the ledger, plans and `my_referrals` reading
   through both; or
2. a partner-specific referral table, which is the second-engine mistake
   (rules 2, 5) and is ruled out.

Option 1 touches the commissions ledger (who is owed), the DIY sign-up
attribution path (whose code was used), the referral plan model (which plan
prices a partner's referral) and the partner portal's authorization surface.
Every one of those is a question Dee has to answer before code: **does a
partner's referral pay a commission, on which plan, and to whom at the
partner?** None of that is derivable from the repository.

**Proposed shape, when activated.**
- `referral_codes.partner_group_id uuid null` + a CHECK that exactly one
  of `organization_id` / `partner_group_id` is set; `referral_plans` gain
  the same either-or.
- `my_partner_referrals()` — SECURITY DEFINER, gated by
  `partner_group_of_user()` like `my_partner_clients()`: the partner's code,
  its attributions (first name + status only; being attributed a consumer
  grants NO access to their records — the 0130 rule stands), and the ledger
  lines that name the partner.
- A "Refer a business" section on `/partner` with the link and the list.
- Matrix probes in phase 55: a partner sees its own referrals and nobody
  else's; a SaaS organization's code cannot be read through the partner path.

**Dependencies.** Dee's three answers above; the DIY sign-up path accepting a
partner-owned code; the commissions ledger already supports a
`referral_event_id` cause, so the payout side needs only the plan lookup.

**Risk if built without the decision.** A partner could be shown "you
earned $X" from a plan that was never agreed with them — a commercial
promise the software made up.

## D-007 · Partner Portal MVP — NEXT ACTIVE EPIC after the Agency pilot checkpoint (frozen until then)

**Dee's change-control correction, 2026-09-10.** Commit `c4c3964` (partner
onboarding as the Partner Profile, the vault gates, Partner Information, the
agreement hand-off) stays exactly as shipped. **No further Partner Portal
work during the current sprint.** New Partner Portal ideas are recorded here
and not built.

**Backlog (valid, not next):**
1. Partner file uploads / sending a requested document through the portal
   (today: conversation or email; BES marks received).
2. Partner-submitted client intake (needs Dee's rule: draft that BES
   approves, or straight in?).
3. Partner-facing monthly reporting (rounds sent, results, hours).
4. Portal notifications by email (file shared, update posted, requirement
   asked).
5. Billing / invoices on the portal (depends on Authorize.Net).
6. Self-service change of a contact's sign-in email.
7. Onboarding form accepting more than one CRM / GHL / ESP / monitoring /
   domain in the first pass (today: one each, more from Partner Information).
8. D-006 referral portal (own entry above).

**DEFERRED LIVE VALIDATION — Partner Portal onboarding first-real-user
test.** The flow is probed (phase 55, 151/151) and screen-tested; no real
partner has walked it. Not required for the Agency operations sprint. Do not
invite a partner merely to run this test.

**Partner onboarding agreement configuration required before Partner Portal
rollout.** "Continue to Agreement" hands over the template flagged in
Settings → Documents ("Use as the partner onboarding agreement"). None is
flagged yet. Flagging one is configuration, not development; building more
document-system features is not.

**Governance note.** This epic is the worked example of "a request can be
VALID without being NEXT": an architecture/feature expansion outside P0 that
was built because it was asked for, kept because it shipped coherently, and
the reason the rule now reads: new non-P0 request → classify → document →
defer, unless it is a security or data-integrity issue.

## D-008 · Non-P0 mobile findings (from the 2026-09-10 responsive pass)

Recorded per Dee's mobile standard §62: found during the P0 mobile audit,
outside the pilot's P0 surfaces, not blocking the operational shell.

1. **FundingOps client list and deal tables** use `OpsClientListTable` /
   `FundingDealListPanel` / `RecordTable`: the shared client list now has
   phone cards, the deal and record tables do not. FundingOps is paused.
2. **Agency Settings sections** (Roles & Permissions matrix, Organization
   Teams roster, GHL bridge cards, Documents editor's side-by-side picker)
   are usable but dense at 375; the Documents editor stacks its preview but
   the field picker column could become a bottom sheet.
3. **Partner portal** (`/partner`) is single-column already; the onboarding
   form's three-column address row should stack under 375. Portal is frozen
   (D-007).
4. **Finance / Payroll panel** tables (payslips, FX rates) render through
   their own tables, not `DivisionTable`; phone cards not built. Finance is
   deferred.
5. **Org chart** is a wide canvas by nature; horizontal scroll inside its
   own container is deliberate and should stay.
6. **Sticky stack on the CreditOps client view**: partner header + "CreditOps
   Space" bar + module tabs + client Back row all scroll away except the tab
   strip, but on a 812-tall phone the first screen is chrome-heavy. A collapsed
   partner header under `md` would give the first screen to the client.
7. **View As** stays off the phone header (deferred D-001 anyway).

### D-007 MVP map (Dee's execution plan §8–§23, 2026-09-10) — planning only

Inspected on current `main` (commit `37dddf7`). Nothing here is rebuilt;
the MVP is the gap column.

| MVP capability (§8) | Exists today | Gap for MVP |
|---|---|---|
| Log in / activation | Partner contact invitation + activation (`accept_partner_invitation`), `partner_group_of_user()` boundary | — |
| Company / profile | Onboarding form → Partner Information (edit company + own contact) | Other contacts read-only list |
| Active BES services | `partner_services` exists; portal shows one "Service" string | **Services list** via a definer fn (service type, status, since) — §11 |
| Service / project status | BES CRM builds with progress, journey, go-live | CreditOps partner view (§12): active client count, high-level status, actions needed — mostly `my_partner_clients()` already |
| Partner-facing clients | `my_partner_clients()` | — |
| Shared files | `useMySharedFiles` + `set_partner_file_shared` | — |
| Upload requested files | none | **Partner upload** into canonical `files` (entity partner, `shared_with_partner` = true by the partner's own act), storage policy for `agency/partner/<group>/portal/` |
| Needed from you | `my_partner_requirements()` (CRM client requirements, read-only) | **Action Center** (§14): unify CRM requirements + signature requests + onboarding gaps; completing an action (upload, sign) satisfies the requirement deterministically where the link is explicit |
| Published updates | `activity_events` with `shared_with_partner` readable via `activity_partner_select` | Portal **Updates** list surface |
| Agreements / documents | Document builder + `/sign/:token`; onboarding agreement hand-off | Portal list of the partner's own signature requests (status, signed copy) — `signature_requests` needs a partner-side read fn |
| Team / access (§9, §16) | `partner_contacts` with status; BES invites contacts | **Partner Admin role** on `partner_contacts` (`is_admin boolean`), partner-side invite/deactivate fns, module grants per user kept minimal |
| Communication | Canonical channel surfaced in the portal (read/reply) | Partner cannot start a conversation (BES opens) — acceptable for MVP; DM to a BES contact deferred |
| Navigation (§21) | Single scrolling page | Tabs/sections: Home · Services · Clients · Needed from you · Files & Documents · Updates · Communication · Team · Profile — shown only when relevant |
| Home (§22) | — | Cards: Active services, Needs your attention, Recent updates, Shared files, Projects/clients status, Upcoming milestone |
| Security proofs (§23) | Phase 55 covers isolation for clients, files, credentials, profile, projects | Add: partner-admin vs partner-user, suspended user, deactivated relationship, search, documents |

**High-risk shared changes to plan first (§29):** the partner-admin flag and
partner-side invites touch `partner_contacts` policies; partner uploads
touch `files` and storage policies. Both wait for the stable checkpoint and
a full matrix run.

**MVP complete (§35)** = one real partner activates, logs in, sees the
correct partner, services, clients/projects, Needed from you, uploads,
shared files, documents/signing, updates, communication, manages their
users — and never sees BES internal data.

## D-009 · DIY Credit Repair — future product epic (documented, not started)

**Dee, 2026-09-10 (§5, §27):** not the next build. Fourth in the locked
roadmap, after the Agency pilot, the Partner Portal MVP and Organization
platform refinement.

Future scope, to be architecture-reviewed before execution: consumer
account; credit report import; credit analysis (deterministic, on the
existing `lib/dispute` engines); dispute planning; letter generation (the
Letter Library and Lob path); round tracking; document storage (canonical
`files`); education; status; billing/entitlement (plans + Authorize.Net);
white-label experience (organization branding); Partner/Organization
sponsorship (referral attribution, D-006); consumer portal (the client
portal identity).

Do not begin the DIY dispute engine, consumer report analysis, letter
generation, DIY client workflows, consumer billing, white-label DIY setup,
credit monitoring integration or a DIY SaaS portal during the Agency pilot.
Prior decisions that still stand: DIY referrals reference design and the
30-day trial / BES- ID / public sign-up decisions in memory.

## D-012 · Document previews on the funding deal panel (deferred, small)

**Found 2026-09-13**, while applying Dee's "I want all documents as preview
and not just names" across every document surface.

`FilePreviewGrid` now renders images, PDFs and text files everywhere a
document row carries a storage path: the CreditOps client Documents tab, the
client profile's own documents, the Partner Portal's shared files and the
partner's client detail.

`DealDocumentsPanel` is the one that stayed a list. `fetchDealDocuments`
selects `id, request_id, classified_type, classified_period, disposition,
shareable_with_lender, size_bytes, created_at, files(name), …` — no `path`
and no `mime_type`, so there is nothing to sign a URL for. The panel also has
no open/download action today: it is a compact disposition summary inside a
deal card, not a document browser.

**Why deferred:** the fix is a query change plus an open action in FundingOps,
which is PAUSED (rule 16b). Adding a preview grid there would be new
FundingOps UI work during a pause, not completion of Dee's request.

**When it resumes:** add `path` and `mime_type` to the `files(...)` embed,
give the row an open action through `signDocumentUrl`, and drop in
`FilePreviewGrid` — the components and the batched signing hook already
exist. Roughly an hour's work, no schema change, no new authorization.

---

## Status of this whole backlog — Dee, 2026-09-13

**This file is a record, not a queue.** Every item here is documented so it need
never be re-explained. **None of it is scheduled.**

Nothing in it is picked up until:

1. the **Product Charter** exists and Dee has approved it, and
2. the incoming technical lead's stabilization assessment is in, and
3. the relevant module has been classified **Core · Product Module · Later ·
   unnecessary**.

This applies to **D-012 specifically**, which an earlier draft of the first-week
plan proposed as a day-four task. It was withdrawn: it is legitimate technical
work, but whether FundingOps is in the immediate product milestone has not been
re-established, and picking up a deferred ticket before that is settled is
exactly how the scope got here.

**Nothing in this file is to be deleted either.** A documented deferral is
cheaper to keep than to rediscover.

---

## D-013 · TalentOps as a real project-management module (specified, NOT started)

**Dee, 2026-09-13**, in full. Recorded so it never has to be re-explained.

**Classification: major feature expansion + UI redesign.** It arrived during the
pre-handoff stabilization phase and the feature freeze, and Dee's own spec
(§24) asks for an inspection before any building. The inspection is below; the
build awaits her sequencing decision.

### What she asked for

TalentOps should stop being a passive dashboard of shared workspaces and become
**the operating system for BES human-delivered outsourcing work outside
CreditOps** — Virtual Assistants, Executive Assistants, Client Success /
Support, Appointment Setting, Sales Support, Back Office, Admin Support,
Operations Management, Voice / Non-Voice, Managed Departments.

**Not a separate Ops module per service type.** All of them live under TalentOps
as Partner workspaces and projects.

The mental model is ClickUp:

```
ClickUp Space → Partner Folder → Project / List → Tasks
FullSuite:  TalentOps → Partner → Project / Work List → Task (work_items)
```

Full requested scope, condensed from her 24 numbered points:

1. **Second sidebar** inside TalentOps: Dashboard · My Tasks · All Tasks ·
   Calendar · Workload, then PARTNERS A→Z — driven by live service engagement,
   never hand-maintained.
2. **Partner as folder** — opens that Partner's workspace: Overview · Projects ·
   Tasks · Calendar · Files · Activity · Team.
3. **Projects / Lists**, configurable per Partner (e.g. BMF: Client Success,
   Admin & Operations, Appointment Setting, Marketing Support, Daily Recurring;
   Selena: Executive Assistance, Calendar & Scheduling, Inbox Management,
   Follow-Ups, Research / Admin). **Not hard-coded globally.**
4. **Tasks** on canonical `work_items`: title, description, partner, project,
   assignee, status, priority, start date, due date, recurrence, checklist,
   comments, @mentions, screenshots, attachments, activity, estimated time,
   actual time. **Never `talentops_tasks`.**
5. **Views**: List, Board, Calendar; Timeline later. Same records, no duplicates.
6. **Statuses**: Backlog · To Do · In Progress · Waiting / Blocked · For Review ·
   Completed · Archived — configurable per workspace, **not hard-coded in React**.
7. **My Tasks** — only work assigned to the signed-in employee, across partners.
8. **All Tasks** for leads/management, filterable by partner, project, assignee,
   status, priority, due date, overdue; agents see only their authorized scope.
9. **Recurring tasks** — daily inbox review, weekly client report, Friday EOD.
   Reuse if the engine supports it; otherwise add the **smallest canonical**
   recurrence model.
10. **Workload** per employee: open, overdue, due today, estimated hours, actual
    hours, partners assigned.
11. **Team / assignments** on canonical `partner_assignments` — assignment says
    who is *eligible*; task assignee says who *owns that task*.
12. **Lead / Project Manager** may create, assign, reprioritise, change due
    dates, review and see workload; agents work their tasks without management
    permissions.
13. **Files** on canonical `files`, attachable to partner, project, task or
    comment; upload, drag-drop, screenshot paste, preview, download.
14. **Comments / activity** on the canonical systems.
15. **Checklists**, persisted and auditing who completed each item.
16. **Time tracking** — Start Timer on a task, linked to employee, partner,
    project and task. **No second timer engine.** Answers "how many hours are we
    spending on BMF?" and "how many hours is Alliana working for Selena?"
17. **Dashboard** in business language: Active Partners · Active Agents · Open
    Tasks · Due Today · Overdue · Waiting/Blocked, then Work by Partner, Work by
    Agent, Upcoming Deadlines, Recent Activity.
18. **Remove the database-administration wording** — "Shared workspaces", "Open
    shared items", "Distinct assignees" become Active Partners, Open Tasks,
    Active Agents, Overdue / Due Today.
19. **Partner workspace header** — name, active agents, open tasks, due today,
    then the tabs.
20. **Board view** with drag between columns updating canonical status,
    permissions respected.
21. **Project detail** — name, partner, lead, members, status, dates, progress
    **derived from tasks, never typed**; then List · Board · Calendar · Files ·
    Activity.
22. **Partner Portal visibility is selective.** Internal TalentOps work stays
    BES-only unless explicitly made partner-visible.
23. **Do not duplicate Sales & Marketing.** Same engine; different configuration
    and UI. Marketing is campaign/content/calendar oriented, TalentOps is
    partner/project/task/workload/time oriented.

### Inspection — what already exists (§24)

Carried out 2026-09-13 against the live database. **Most of this is already
built.**

| Requirement | Canonical support today | Verdict |
|---|---|---|
| Partner folder | `workspaces.partner_group_id`, `.partner_service_id`, `.module` | **Reuse** |
| Project / List | `workspace_boards` | **Reuse** |
| Task | `work_items` — title, description, stage, priority, `assigned_to`, `due_at`, `workspace_id`, `board_id`, `status_id`, `item_type_id`, `partner_group_id`, `partner_service_id`, `team_id`, `division`, `completed_at`, `archived_at`, `previous_assigned_to` | **Reuse** |
| Waiting / Blocked **with a reason** | `work_items.waiting_on`, `.waiting_note`, `.waiting_since`, plus `work_item_blockers` | **Reuse** |
| Configurable statuses | `workspace_statuses` — `key`, `label`, `colour`, `position`, `canonical_stage`, `is_terminal`. Proven by Marketing's 11-status ladder | **Reuse** |
| Custom fields | `workspace_fields` + `work_item_field_values` | **Reuse** |
| Checklists **auditing who completed** | `work_checklist_items` — `done`, `done_by`, `done_at`, `position` | **Reuse** |
| Files | canonical `files`, plus the new `FilePreviewGrid` / `useFilePreviews` | **Reuse** |
| Comments, @mentions, screenshots | Communication + the rich-text mention model | **Reuse** |
| Activity | `activity_events`, append-only, trigger-written | **Reuse** |
| Who is eligible on a partner | `partner_assignments` (person **or** team, live-dated) | **Reuse** |
| **Time per task AND per partner** | **`time_entries` already carries `work_item_id` AND `partner_group_id`** | **Reuse — the "hours on BMF" question is already answerable** |
| Partner-facing selectivity | the portal's definer projections | **Reuse** |

**Genuine gaps — four, and only one is structural:**

1. **No `start_date` on `work_items`.** Only `due_at`. One nullable column.
2. **No estimated time.** *Actual* time is already derivable
   (`sum(duration_minutes) where work_item_id = …`). Estimated needs one column
   or a `workspace_fields` row.
3. **No recurrence model anywhere.** `partner_billing_models.recurring` is
   billing-only. This is the one real design task: a small canonical
   recurrence table plus a sweep that generates the next instance, following the
   `billing_recurring_sweep` pattern — **including its hard-won lesson that a
   generated record must never be born already overdue** (`docs/KNOWN-ISSUES.md`
   §3).
4. **No TalentOps workspaces exist.** Only `module = 'sales_marketing'` ones.
   Provisioning from a live engagement is the same pattern Marketing already
   uses.

**Live TalentOps-family engagements today — three:**

| Partner | Service | Type |
|---|---|---|
| Business Made Fair | Operations Management | `OPERATIONS_MANAGEMENT` |
| Credit by Nainoa | TalentOps | `TALENTOPS` |
| K&A Consulting Group | Client Support | `CLIENT_SUPPORT` |

**Selena Alexander and BizHub, named in Dee's examples, have no TalentOps-family
service record.** The partner sidebar is engagement-driven by design, so they
will not appear until one exists. That is a data question for Dee, not a code
change.

### Shape of the work, if approved

- **Backend: small.** Two nullable columns on `work_items`, one recurrence
  table plus a sweep, workspace provisioning from live engagements, and status
  seeds. No new task engine, no new file/comment/activity/time system.
- **Frontend: large.** A second sidebar, partner workspace with seven tabs,
  project detail with five views, board view with drag-and-drop, calendar,
  workload, My Tasks, All Tasks with filters, and a rewritten dashboard.

### Why it is deferred

Dee set the current phase minutes before sending this spec: *"Feature freeze
stays in place. No new modules. No new major features. No UI redesigns unless an
existing workflow is unusable. This is a stabilization phase."*

TalentOps renders and is usable; it is passive, not broken. Building this now
would reopen the feature → change → fix → redesign cycle the freeze exists to
end, and would do it while fourteen employees are being activated for UAT.

**It waits for Dee's explicit sequencing decision.** The three candidates:
after UAT and before handoff; after handoff, as the new technical lead's first
substantial epic; or as part of the Product Charter's module classification,
where TalentOps' place in the product is settled before its UI is built.

### The mockup (Dee, 2026-09-13)

A full-screen visual followed the written spec. What it settles beyond the text:

**Global sidebar gains a grouping.** `MANAGED OPERATIONS` holds CreditOps,
FundingOps, BES CRM, **TalentOps**, Sales & Marketing, Finance, Team
Management, Reports, Settings. `MY WORK` holds My Work, My Time, End of Day,
Notifications. TalentOps is a peer of CreditOps, not a sub-screen.

**Second pane**, inside TalentOps: Dashboard · My Tasks · All Tasks · Calendar ·
Workload, then `PARTNERS` with a **search box** above an A→Z list, each partner
with its own avatar/initial tile.

**Partner header:** breadcrumb `TalentOps / Partners / Business Made Fair`, a
`BMF` tile, the partner name with an **Active** pill, the engagement line
("Virtual Assistant & Client Support Outsourcing"), and a **Partner Details**
button linking back to the canonical partner record. Tabs: Overview ·
**Projects** · Tasks · Calendar · Files · Activity · Team · **Settings** — two
more than the written spec.

**Five header cards:** Active Agents · Open Tasks · Due Today · Overdue · **On
Track %** (a donut). The last is new and must be *derived*, like project
progress — never typed.

**Overview body, three panels:** Recent Projects (name, `12 tasks · 75%
complete`, progress bar), Upcoming Deadlines (checkbox, title, Today/Tomorrow,
priority pill), Recent Activity (avatar, actor, what changed, relative time).

**Task table**, with a view switcher `List · Board · Calendar · Timeline
(Beta)` and `Filter · Group · Me · + New Task`. Columns: checkbox, Task (title
**plus a one-line description**), Status, Priority, Assignee (avatar + name),
Due Date (**red when overdue/today**), **Time**, **Labels**, row menu.

Two things the mockup adds that the written spec did not:

- **Labels/tags on a task** — not in the canonical model today. Nearest
  existing mechanism is `workspace_fields`, or a small canonical label table if
  Dee wants them filterable across partners.
- **A `Time` column on every row** (`1h`, `30m`, `1h 15m`) — consistent with the
  estimated/actual gap already recorded above.

**Partner names in the mockup are illustrative.** Lakeside Partners, Keystone &
Associates, Thrive Solutions, Elevate Capital, Prime Consulting and Summit
Enterprises are not partners in the system. The list is engagement-driven by
design, so it will show exactly the partners holding a live TalentOps-family
service — three today.

---

## D-014 · BES CRM as a project-delivery module (specified + inspected, NOT started)

**Dee, 2026-09-13**, with a full written spec, a phase-model correction, and a
mockup. **Classification: major feature expansion + UI redesign**, arriving
during the pre-handoff stabilization freeze alongside D-013.

**The architecture inspection she asked for is complete: `BES_CRM_INSPECTION.md`.**
Nothing in production was changed to produce it.

### The headline finding

**There are no phase records to preserve.** `phase` exists as one column —
`crm_work_unit_templates.phase` (integer) — and is **NULL on all 64 templates**.
No phase column on `crm_projects`, no phase table, no enum, no data. That is
deliberate: `CLAUDE.md` rule 17b says readiness comes from per-unit
dependencies, *never* from a phase counter.

What plays the role today is `crm_project_journey()` — a **derived**, never-stored
stage (Gathering information → Planning & designing → Building → Testing →
Launch → Support → Complete) with `journey_override` when a human disagrees.

So Dee's instruction to preserve phase data resolves to: **nothing to destroy,
and Phase-as-a-first-class-concept is new model work.** The open decision is
whether Phase is stored or derived. Recommendation in the report: **store it,
keep deriving a suggestion** — the same shape `suggestedLifecycle()` already
uses for partners.

### What she asked for

Project → **Phase** → Milestone → Task, with Status separate from Phase. Second
navigation pane (Dashboard · My Tasks · All Tasks · Calendar · Workload ·
**Approvals**, then PARTNERS A→Z, engagement-driven). Partner workspace
(Overview · Projects · Tasks · Calendar · Files · Activity · Team · Settings)
with five cards: Active Projects · Open Tasks · Due This Week · Overdue · On
Track %. Project detail with Overview · List · Board · Calendar · Timeline ·
Files · Activity · Team, progress **derived**. Project lifecycle states,
milestones per engine, task drawer, approvals through the canonical Partner
Action system, revisions, project templates, My Tasks / All Tasks, workload,
time tracking on existing My Time, canonical files and activity, and a
partner-safe portal projection that exposes no internal comments, QA notes,
workload, time, cost, internal files or raw audit.

The mockup adds: `MANAGED OPERATIONS` sidebar grouping, partner search, a
`Quick Actions` panel (Create Project · **Import from Template**), a Partner
Team panel with roles (Project Lead, Developer, Marketing Support, Account
Manager) and `+ Add Team Member`, and a task table with Project, Status,
Priority, Assignee, Due Date (red when near) and **Time** columns.

### Inspection summary

**REUSE (already built, suitable):** `crm_projects` · **`crm_milestones`**
(already first-class, already linked to a work item, already carrying
`client_visible`) · `work_items` with `crm_project_id` / `crm_engine_key` /
`crm_work_unit_template_id` · waiting-with-a-reason · **QA as a first-class step**
(`qa_result`, `crm_pass_qa`, `crm_fail_qa`, `requires_qa`) · dependencies
(`dependency_mode`, `crm_work_unit_ready`) · **versioned project templates**
(`crm_engine_templates` → 64 work unit templates → actions; 14 engines) ·
**derived progress and health** · checklists auditing who ticked · canonical
files, comments, mentions, activity · **`partner_action_items` for approvals** ·
`partner_assignments` + `lead_id` · **`time_entries` already carrying
`work_item_id` AND `partner_group_id`** · the full lifecycle (complete, archive,
reopen, **owner-only blocker-checked delete**) · `my_partner_projects()`.

**EXTEND (small):** the Phase decision · `start_date` on `work_items` ·
estimated time · revisions **derived from rejected approvals rather than a new
engine** · labels (no canonical home today).

**DO NOT DUPLICATE:** `work_items`, `crm_milestones`, the template chain,
`partner_action_items`, `files`, `activity_events`, `time_entries`,
`partner_assignments`, the `crm_project_*` lifecycle functions. No
`bes_crm_tasks`, no second approval engine, no second timer, no per-view task
copies.

**GAPS:** Phase as a concept, then **frontend** — second pane, partner folders,
partner workspace, board with drag, calendar, timeline, workload, approvals
view, My/All Tasks. **The backend is nearly done; the frontend is the work.**

### Two data facts

- `crm_projects` holds **1 row**; `crm_project_engines` holds **2**. The module
  is built but barely populated — real projects must be created before it can be
  meaningfully tested or demoed.
- Partner names in the mockup are illustrative; the sidebar is
  engagement-driven and will show only partners with a live BES CRM service.

### Relationship to D-013

D-013 (TalentOps) and D-014 share three extensions — `start_date`, estimated
time, labels — and the same principle:

```
TalentOps          Partner → Project/List → Task → People → Workload
BES CRM            Partner → Build → PHASE → Milestone → Task → QA → Approval → Launch
Sales & Marketing  Partner → Campaign → Content → Calendar → Approval → Publish
```

**One engine, three operating experiences.** If both are approved they should be
designed together and built in sequence so the shared extensions are made once.

---

## D-015 — Internal surfaces still report a failed load as an empty one

**Raised:** 2026-09-16. **Status:** PARTIALLY DONE — **22 remain**.

### The defect

```tsx
const rows = query.data ?? [];
if (rows.length === 0) return <p>Nothing yet.</p>;
```

`data` is undefined **while the request is in flight and after it fails**, so a
failure renders as a confident factual claim: *you have none*. This has shipped
before — it is the Partner-folder PostgREST error that appeared as empty folders.

### THE COUNT WAS WRONG FOUR TIMES

Reported as 89, then 79, then 39, then 32. It is **22**. Every correction was
the same mistake: the detector did not know a spelling this codebase already
uses.

| spelling | example | missed until |
|---|---|---|
| `isError` | the query object | — |
| destructured `error` | `ClientHistoryTab` | third count |
| a `somethingFailed` prop | `PartnerInvoiceList` | third count |
| a **prefixed** error | `wsError` in `TalentOps` | fourth count |

Each gap made *correct* files look broken. A backlog inflated to four times its
real size sends somebody chasing work that is already done.

### THE BLOCKER THIS ENTRY PREVIOUSLY CLAIMED DOES NOT EXIST

An earlier version said several read hooks never expose `isError`, so those
pages could not report a failure. Measured properly — brace-balanced extraction
rather than a fixed character window — of the 63 hooks the remaining surfaces
call:

- **39** return the query itself, handing over `isError` for free
- **12** reshape but pass a failure through
- **12** hide it, and **eight of those are mutation bundles** with no empty state

So nothing is meaningfully blocked. The remaining 22 are ordinary component
edits, not a refactor.

### Done

Every Partner Portal surface · Communication · the partner tabs · the finance
panels · `ClientDocumentsTab` (Dee's own example) · `ClientSecretsPanel` ·
`ClientProfilePage` · `BlockersPanel` · `ChecklistPanel` · `ClientWorkTab` ·
`CompanyFeedCard` · `AgencyHome`.

Chosen by harm rather than by count: the test is whether the empty state is a
claim somebody **acts on**. `ClientProfilePage` was the worst — on a failed
fetch it said *"This client does not exist, or you are not authorized to see
them"*, an existence and authorization verdict produced by a network blip.

### What remains

22 files, mostly FundingOps workspaces, reporting cards and settings sections.
Lower harm: a BES employee seeing "none" on an internal panel refreshes; a
partner told they have no invoices believes it.

Re-measure with the detector in `src/pages/portal/portal-states.test.ts`, which
knows all four spellings. Do not write a new one.

---

## D-016 — Evaluate the derived-`overdue` migration

**Deferred by Dee, 2026-09-17, after approving the billing architecture:**

> "Keep `overdue` stored for now. Do NOT refactor it to fully derived before
> payment UAT… do not open a 15-function / 4-view refactor just for
> architectural tidiness."

**Problem.** `partner_invoices.status` carries two things at once: payment
state (`paid`, `partially_paid`) and lateness (`overdue`). It cannot express
both, so a part-paid late invoice reads `partially_paid` and its lateness is
invisible in that column.

**Why it is no longer urgent.** The real defect was two writers fighting over
the value — the payment trigger and the hourly sweep each overwrote the other,
so an invoice's status depended on which ran last. That is fixed:
`partner_invoice_recompute` is the single writer and `mark_overdue_invoices`
now asks it rather than writing.

**Proposed architecture.** Stop storing `overdue`. Payment state stays stored;
lateness is answered by `invoice_is_overdue(uuid)`, which already exists, is
already correct for the part-paid case, and is already granted.

**Measured cost, 2026-09-17.** 15 database functions and 4 views read
`status = 'overdue'`: `billing_recurring_sweep`, `billing_reminder_sweep`,
`due_date_sweep`, `finance_overview`, `my_partner_autopay_schedule`,
`my_partner_billing`, `my_partner_portal_summary`, `partner_autopay_due`,
`partner_invoice_recompute`, `queue_reminder_email`, `mark_overdue_invoices`,
plus the `billing_attention` view, and the portal and Finance screens.

**Dependencies.** None. It is a pure refactor.

**Risk.** Every one of those is a money path, and the enum value must stay for
history even after nothing writes it. A missed `status in (...)` list silently
drops invoices out of a sweep — which is the failure mode that does not raise
an error and is not visible until somebody is not chased for a bill.

**Revisit:** after billing/payment UAT and production stabilization.

## D-017 — Automatic deductions and proration for monthly packages

**Deferred by Claude, 2026-09-19, when the monthly rate type shipped (migration
`20260919009000_monthly_pay_rate.sql`, probe `monthly-rate-probe.mjs` 15/15).**
Dee's ask was the rate: *"I have agents with monthly package and I only
calculate their hourly rate manually, I need a way to enter their monthly
package then the system will auto calculate that."* That is done — a rate may
be `monthly`, and `pay_rate_breakdown` derives the day and the hour from the
package and the schedule (Mon–Fri → 261 paid days a year; 6-day → 313; hour =
day ÷ paid shift hours). What is **not** done is using those derived rates
inside payroll automatically.

**Problem.** A monthly payslip pays its half of the package
(`monthly_share_cents`) regardless of attendance. Unpaid absences, late
minutes and a mid-period start or end are still the payroll manager's manual
`adjust_payslip`, priced by eye from the frozen `rate_basis` the payslip now
carries.

**Proposed architecture.** Inside `payroll_generate_internal`, for
`rate_type = 'monthly'` only:
- **Unpaid leave days** (approved `leave_requests` with `compensation =
  'unpaid'` on scheduled days) × `daily_cents` → a deduction line.
- **Absent scheduled days with no time and no approved leave** — the same
  `absent` / `ncns` facts `attendance_for` already derives — × `daily_cents`.
- **Late minutes** past grace × `hourly_cents ÷ 60`, if Dee wants lateness
  priced at all (many monthly arrangements do not; **Dee decides**).
- **Proration** for a person whose membership starts or ends inside the
  period: share × scheduled days worked ÷ scheduled days in the period.
Each as its own payslip line (new columns `deduction_cents`,
`deduction_detail jsonb`), never folded into `base_cents`, so the payslip
still reads as package − deductions + adjustment. The attendance facts must
come from `attendance_for` / the corrections chain — **not a second
derivation of lateness in payroll.**

**Why deferred.** It changes what people are paid. Dee has not stated the
policy (which absences deduct, whether lates deduct, rounding), and the
Philippine contractor-classification review is still open — the app derives,
it must not decide statutory treatment. Rule 20: expansions are documented,
not built beside the active epic (Team Management tabs).

**Dependencies.** `pay_rate_breakdown` (done), `attendance_for` +
`attendance_corrections` (done), Dee's deduction policy (open).

**Risk.** Low to build, high to get wrong: a deduction rule that disagrees
with what Dee actually pays would be a payroll correction across every
monthly person. Ship behind the same probe pattern with built fixtures.

## D-018 — Performance Rating and verification letters on People & Teams

**Deferred by Claude, 2026-09-19, when the Overview was rebuilt to Dee's
mockup ("Follow this strictly").** One Quick Stat on that mockup —
**Performance Rating** — and the **Documents & Verification** requests
(Contractor Engagement Verification, Compensation Verification, Engagement
History) have no canonical record behind them. The Overview shows "Not tracked
yet" for the rating and the person's actual documents on file for the card,
rather than a figure or a button that means nothing (rule 12). **Quality Score
is derived** — Dee asked "where does my QA and quality performance go now?",
and the answer is `work_items.qa_result` (pending / passed / needs_fix, with
reviewer, time and feedback), which the Overview reads as passed ÷ reviewed
for the month.

**What exists.** Attendance on-time rate, EOD submission rate and completed
work items are derived and shown. `member_documents` holds agreements, NDAs,
policies, acknowledgments and training documents with statuses.

**Proposed architecture.**
- **Performance Rating**: a stated, dated rating by a lead (`performance_ratings`:
  person, period, rating, rater, note) — a manager's judgment, recorded with
  its author, never inferred. Or drop it in favour of the derived rates.
- **Verification letters**: three `document_templates` (engagement,
  compensation, history) rendered through the existing document builder with
  the person's canonical facts, issued from the profile's Documents tab and
  stored as `member_documents` rows.

**Why deferred.** Each needs a product decision from Dee (what QA means per
division; whether a manual rating belongs beside derived metrics) and a
labour-counsel read on what a contractor verification letter may state.

**Dependencies.** BES CRM QA gate; document builder templates; Dee's decision.

## D-021 — Division manager scope in CreditOps: two decisions to reconcile

**Recorded by Claude, 2026-09-19, from the RLS matrix base checks.** The
fixture division manager (`ops.manage`, `scope_division = creditops`, no
team, no department, no partner assignment) sees **zero** CreditOps clients
and one work item. That is the literal result of two deliberate rules:
`in_scope` grants nothing for division alone (Dee, 2026-09-13: "division
says which building you are in, not which rooms you may enter") and the
Main Client List is directory ∩ partner scope (AD-004, 2026-09-19). §20b of
CLAUDE.md meanwhile says a Division Manager "sees one division". Both cannot
be true for a manager who manages no department and holds no assignment.
**Proposed:** a division manager's reach is the departments whose
`manager_id` is them plus their explicit partner assignments; if Dee wants
"the division" instead, `can_see_partner`/`in_scope` need a division arm,
which AD-004 forbids broadening without her word. **Why deferred:** doctrine
question, not a defect; no real division manager exists yet (Rowell and
Bryan are admins). **Dependency:** the matrix base expectations (P-011).

## D-020 — Management placement writes are admin-only

**Recorded by Claude, 2026-09-19.** `agency_memberships_update` is
`is_agency_admin()` only, so the Organization tab's Position, Reports To,
Engagement type and Hire date editors render for `ops.manage` managers but
the database refuses their save. Nobody holds `ops.manage` without admin
today, so nothing broke; it will the day a division manager is placed.
**Proposed:** a definer RPC `set_member_placement` limited to those four
columns, allowed for `is_manager_of` ∧ `may_view_workforce_record`, audited;
role, owner flag, scope and status stay admin-only. Also decide whether
`hired_on` (it moves Employee IDs) is admin-only regardless.

## D-019 — Per-position Output targets, KPI catalogue and the two minimum thresholds

**Deferred by Claude, 2026-09-19, when Dee locked the performance weighting**
(migration `20260919011000_performance_policy.sql`; derivation
`lib/people/performance-metrics.ts`):

> "35% Quality + 35% Output + 20% Compliance + 10% Reliability… underneath each
> category, the actual KPI changes according to position. A Processor's output
> can be rounds/files processed; Client Support can use cases/follow-ups/SLA;
> CRM can use completed milestones/tasks; Team Leads can use team delivery,
> queue health, reviews, and management responsibilities… Quality and
> Compliance need minimum thresholds regardless of the overall score."

**What is live.** The weights are a `performance_policy` row; the overall is
the weighted mean over the components that exist, renormalised, with the
Needs Support cap wired for the thresholds. **Output is the count of work
items delivered** and is *out of the overall* — a rate needs a target, and no
target exists yet. The thresholds are NULL — Dee has not given the numbers.

**Needs from Dee.** (1) The two minimums (e.g. Quality ≥ 70%, Compliance ≥
70%); the cap activates the moment they are set. (2) Output targets per
position, or the rule that derives them.

**Proposed architecture.**
- `position_kpis` (position_id, category `output`, kpi_key, target_per_day |
  per_period, unit label): the KPI a seat is measured on and its target —
  rows, per Dee's list; `kpi_definitions` already names the sources
  (production, status_change, submission…).
- `outputRate = delivered ÷ target × 100` per person from their held
  position; people without a seat inherit nothing and stay "N done".
- Delivered per KPI from the canonical fact: production_logs units (rounds /
  files), work_items completed (CRM milestones), case follow-ups; team leads
  from their team's aggregates.
- A Settings surface for `performance_policy` (weights, thresholds) and for
  position targets — today both are edited by UPDATE.

**Risk.** A target that disagrees with what a position really does makes
Output a false 35% of every score; ship per position with Dee's sign-off,
behind the same probe pattern.

