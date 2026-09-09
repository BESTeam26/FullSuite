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
