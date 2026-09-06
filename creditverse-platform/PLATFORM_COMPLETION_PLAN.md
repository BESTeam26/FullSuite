# Platform Completion Plan — gap analysis against the main goal

**Written 2026-09-05 for Dee.** This answers "analyze and decide what's missing
on DIY, CreditOps and FundingOps" and "let me know what is needed for PDF OCR".
Everything is marked **FACT** (verified in the code or the live database),
**GAP** (missing against the goal) or **PROPOSAL** (my recommendation; nothing
structural is built until you say go, per the project rules).

## The goal, restated in one line

One operations platform where a credit-repair and funding business does the
work after the sale: the credit-repair engine (DisputeFox), the team's work,
time, End of Day and company reporting (ClickUp/spreadsheets), a white-label
DIY credit system for consumers, a full Funding Operation System (clients,
BRMs, sales partners, affiliates, lenders), PDF/OCR report import, and GHL as
the sales front end feeding it.

---

## A. Where each area stands

### 1. CreditOps (the DisputeFox replacement)

**FACT — built and live**
- Clients (canonical `fulfillment_clients`, CN- ids), intake dialog, status and
  round lifecycle, assignment.
- Credit reports: append-only imports (CSV v1), scores, items, the classifier,
  the analysis engines, Credit Reporting Integrity findings with human
  dispositions, re-import comparison (what changed between reports).
- Letter Library and Letter Builder on the client's real items: attestation →
  approval gate (permission-enforced in the database) → mailed → statutory
  response clocks. AI "wording help" is rephrase-only and waits for the key.
- Dispute Dashboard (12 queues), Round outcomes (manual and report-derived),
  Score simulator on the client's own report, Next Steps, Print.
- Every write is permission-checked in the database, not only hidden in the UI.

**GAP**
| # | Missing | What it takes | Needs you? |
|---|---|---|---|
| C1 | Import a credit report from a **PDF** | Text-layer extraction in the browser + a deterministic parser + a review grid before anything is saved. **Building now** (parser version `pdf-text-1`). Per-format rules need real sample PDFs. | Sample PDFs (see §D) |
| C2 | Read **scanned / image** PDFs (true OCR) | An OCR step. See §B. | Decision + key |
| C3 | Plain-language "translation" of every report item for the client | Deterministic explanations exist for findings; item-level plain wording is an AI draft (explain, never decide). Ships when the Anthropic key is set. | `ANTHROPIC_API_KEY` |
| C4 | Letters actually **mailed** (print-and-mail vendor) and USPS tracking live | A mail vendor account (Lob or Click2Mail) and the USPS tracking API. Panels exist; they are not connected. | Vendor choice + keys |
| C5 | **Client portal** for credit-repair clients (progress, letters sent, upload ID/proof docs, sign agreement) | The borrower portal pattern already built for funding, applied to credit clients: a `client` portal role, read-only views, document upload into `files`. Structural: needs a short proposal. | Approve proposal |
| C6 | **E-signature** for CROA agreements and disclosures | An e-sign provider (Dropbox Sign / DocuSign / SignWell) or GHL documents. Agreements module exists as local configuration. | Provider choice |
| C7 | Monitoring-service **connectors** (IdentityIQ, SmartCredit, MyScoreIQ…) | Most have no public API; the practical path is C1/C2 (their PDF exports). Any connector needs a partner agreement. | Partner agreements |

### 2. DIY Credit (white-label consumer system)

**FACT** — the consumer portal (`/diy`, `/diy-consumer`) and the management
screens (`/app/diy-management`) are interface only. There are no DIY tables,
no consumer sign-in, no consumer data path. Every screen shows sample content
and is labelled as such. The only backend hook is `credit_reports.consumer_user_id`,
which already anticipates a consumer owning their own report.

**GAP — this is the largest missing piece.** A full DIY system needs:
1. A **consumer** identity: a `diy_consumers` record tied to an auth user and to
   the organization whose brand they signed up under (white label = the
   organization's branding on the consumer surface; a custom domain later).
2. **Plans and payment** for consumers (Authorize.Net, same as organization
   billing), invitation links and sign-up under the organization's brand.
3. **Report import** for the consumer — reuse `credit_reports` with
   `consumer_user_id` (no new table), the same parsers as C1/C2.
4. **Disputes and rounds** — reuse the Letter Library and the analysis engines
   with the consumer as actor; the consumer prints and mails, or pays to mail (C4).
5. **Progress, education, mail log** — reuse round outcomes and report changes.
6. **Management** for the organization: consumers list, plan, conversions to a
   full-service client (a DIY consumer becoming a `fulfillment_client` keeps one
   canonical person, provenance `diy_converted`).

**PROPOSAL** — written: `ARCHITECTURE_PROPOSAL_DIY_CREDIT.md` (tables, RLS,
consumer access, white-label routing, conversion rule, four build phases).
Nothing is built until you approve it, because it adds a new kind of user to
the tenancy model (rule 16).

### 3. FundingOps (the Funding Operation System)

**FACT — built and live**
- The engine: funding files (FND- ids), 17 stages, List ⇄ Pipeline, application,
  documents with dispositions, Program Fit against stored policy versions,
  submissions, offers, closing, `confirm_funding()`, renewals as new files with
  lineage, commissions, lender directory with programs/policy versions/
  relationship contacts/policy-update feed/scorecard, Deals surface, dashboard
  with 14 queues, borrower portal (read-only view of their own file), readiness
  hand-off from CreditOps.

**GAP**
| # | Missing | What it takes | Needs you? |
|---|---|---|---|
| F1 | **BRM / sales partner / affiliate** as first-class people with their own portal | Today referral partners are not users. Needs: a `partner` relationship record (organization → partner person, commission plan, referral attribution by stable id), an affiliate portal role, referral tracking on funding files and clients. Structural — proposal first. | Approve proposal; commission rules |
| F2 | **Lender portal access** | Lenders are records, not users. A lender user would see only submissions sent to them and respond (decision, documents requested). New tenancy branch — proposal first. | Decide if lenders log in or receive email packages |
| F3 | ~~Borrower uploads documents from the portal~~ | **Already built** (checked after writing the first draft): the borrower portal lists requested documents with an upload control, and storage policies scope uploads to the borrower's own file (0066/0068). | — |
| F4 | Bank-statement and tax-return **reading** for underwriting prep | Same OCR decision as C2; extraction to a review grid, never auto-underwriting. | Decision + key |
| F5 | Sending a **submission package** to a lender by email/API | Mail provider (same key as invitations) for email; lender APIs are one-by-one partner work. | `MAIL_PROVIDER_API_KEY` |
| F6 | E-signature on applications and disclosures | Same provider as C6. | Provider choice |

### 4. Operations (the ClickUp / spreadsheet replacement)

**FACT — built and live**: canonical work items, Custom Workspaces (statuses,
fields, views as data), assignment, time tracking, End of Day, Attention,
Notifications, Calendar, Reports with pivot builder and KPIs as data, team
members, roles and permissions, audit log, Workforce views for BES.

**GAP**
| # | Missing | What it takes | Needs you? |
|---|---|---|---|
| O1 | **Announcements** and **Knowledge Base** are sample content | Two small tables (`announcements`, `knowledge_articles`) with organization scope, an editor for admins, read views for everyone. This is the "company intranet". Small structural addition — I will propose and build unless you object. | Say if you want it now |
| O2 | **Recurring** work and simple **automations** (e.g. when stage changes → create task) | A `recurrence` rule on work items and an automation rule table executed by a scheduled Edge Function. | No, but sequence it |
| O3 | **Stale running timer** policy (a timer left running overnight) | A rule: auto-stop at a configurable cap with a note, shown to the person next sign-in. | Choose the cap (e.g. 10 h) |
| O4 | **Team chat / comments on everything** | Comments exist on work items and clients; not on funding files or reports. Extend the one comments model. | No |

### 5. GHL as the sales front end

**FACT** — the CRM Automation Bridge settings screen exists (mapping and
triggers as local configuration); nothing is connected. Invitations and AI wait
on secrets only.

**GAP**
| # | Missing | What it takes | Needs you? |
|---|---|---|---|
| G1 | **Inbound**: a won opportunity / new contact in GHL creates the client or funding file here | An Edge Function `ghl-webhook` verifying GHL's signature, a mapping table (GHL location → organization; pipeline stage → our intake), idempotent creation with provenance `ghl`. | GHL Private Integration token per location, or a Marketplace OAuth app — **your decision** |
| G2 | **Outbound**: stage moves and funded deals update GHL pipelines and tags | The same function in reverse, driven by our audit triggers. | Same credentials |
| G3 | GHL calendars / conversations inside the platform | Embed or API; do after G1/G2. | Same |

### 6. Roles and experiences

**FACT**: 15 organization roles, permission keys as data, role defaults and
member overrides, `member_can()` enforced in every writer, `my_permissions()`
cached once per session; a borrower role for the funding portal.

**GAP → building now**
- The organization sidebar showed every module link to every member. Links are
  now hidden when the member lacks the permission (Clients needs *View clients*,
  Reports needs *View reports*, Settings needs a team/settings/billing key…), and
  the routes refuse a typed URL with a plain message. Interface gating mirrors
  the database; it is not the protection.
- Still to do: a **role-tailored Home** (an agent sees their queue and timer
  first; an owner sees the business figures first) and the portal roles from
  DIY (§2), F1 and F2.

### 7. Premium experience: wording, guidance, speed, mobile

**FACT**: the app shell has a mobile drawer, sticky settings navigation, one
authorization batch per session, query-key deduplication, lazy-loaded modules.
Sample screens are labelled. Dates are plain everywhere users read them.

**GAP → in progress**
- New-user guidance: a "Getting started" card on the organization Home that
  reads real state (team invited, first client, first report, letter library,
  KPIs chosen, branding) and links each step. Building now.
- Wording sweep for internal terms on organization surfaces (`BES staff`,
  `outsourcing`, `provenance` never appear to organization users; "BES" appears
  only as the vendor name, e.g. "Contact BES"). Ongoing with each screen.
- Mobile: tables on Clients, Funding Files, Deals and Reports need a card layout
  under 768 px; the drawer navigation is done. Next pass.
- Speed: every list already fetches bounded data; remaining work is
  pagination on Clients and Funding Files once a tenant passes a few hundred rows.

---

## B. PDF and OCR — what exists, what is needed

**FACT today**
- Live import is CSV only. The "Upload 3-bureau PDF → OCR" flow on the sample
  client is a demonstration timer; it reads nothing.
- Credit reports are append-only rows; the parser version is recorded on every
  import, so a PDF import is auditable next to a CSV one.

**How credit report PDFs actually come in (three tiers)**

| Tier | Source | How it is read | Status |
|---|---|---|---|
| 1 | PDF **with a text layer** — what IdentityIQ, SmartCredit, MyScoreIQ, Experian and annualcreditreport.com produce when a user "Save as PDF" | Text extracted in the browser (pdf.js), then a deterministic parser recognises sections (personal information, accounts, collections, inquiries, public records) and label/value pairs. Nothing leaves the browser until the person confirms the review grid. | **Building now** as `pdf-text-1`. It will read generic layouts; per-service accuracy needs your sample PDFs. |
| 2 | **Scanned or photographed** reports (image-only PDF, phone photo) | Optical character recognition. Two realistic options below. | Not started; needs your decision |
| 3 | **Direct connector** to the monitoring service | Partner API | Not available publicly for most services |

**Tier 2 options (PROPOSAL — pick one)**
- **Option A — Claude via the existing AI gateway (recommended).** The Anthropic
  API accepts PDFs and images natively; the gateway, credits ledger and
  organization-level metering are already built and deployed. The model
  extracts items into the same review grid as tier 1; a human confirms before
  the append-only import. It can also write the plain-language explanation of
  each item (C3) in the same pass. Needs only `ANTHROPIC_API_KEY`, which is
  already on your list. Cost is per page, charged against the organization's AI
  credits exactly like letters.
- **Option B — a dedicated OCR service** (Google Document AI, AWS Textract,
  Azure Document Intelligence). Higher raw OCR accuracy on poor scans, but a
  new vendor account, billing, key management, and it still needs a parsing
  step after OCR. Choose this only if most reports arrive as photos.

**Doctrine that applies either way (already in the rules)**: extraction is
data entry, not a decision. The engine never runs on unreviewed OCR output;
every extracted item passes a review grid where the person can correct kind,
status, balance, dates and bureaus, and the import records
`parser_version = pdf-ocr-claude-1` (or the vendor) so provenance is visible
forever.

**What I need from you for OCR to be real**
1. **Sample PDFs**: 3–5 real report exports from each monitoring service your
   clients use (IdentityIQ, SmartCredit, MyScoreIQ, Experian, TransUnion,
   Equifax, annualcreditreport.com). Test-account reports are ideal; otherwise
   redact names, SSN and addresses. Without these the parser stays generic.
2. **Decision on tier 2**: Option A (Claude) or Option B (vendor). If A, the
   key you already plan to set is enough.
3. **Storage for the original PDFs**: a private Supabase Storage bucket
   (`credit-report-files`) with the same row-level rules as `files`. I can
   build it as a migration; tell me the retention (keep forever vs. delete after
   N years) because that becomes a compliance setting.
4. **Auto-populate scope**: confirm that a confirmed import should (a) create
   the report, (b) run the analysis, (c) open the Letter Builder pre-selected
   on the negative items — the last step is what "auto-populate the engine"
   means in practice. I will build (a) and (b) now; (c) is a one-line follow-up
   once you confirm.

---

## C. Build order from here (what I do without waiting)

1. **Now**: permission-scoped navigation and route guards; PDF text-layer import
   with review grid; Getting-started guide; wording pass on the screens touched.
2. **Next**: `ARCHITECTURE_PROPOSAL_DIY_CREDIT.md` (for your approval), then
   Announcements + Knowledge Base live (O1), borrower uploads (F3), stale-timer
   rule (O3), mobile card layouts for the four list screens.
3. **Then**: `ghl-webhook` Edge Function scaffold with signature verification
   and the mapping table, so connecting is a matter of pasting credentials (G1/G2).
4. **On your decisions**: partner/affiliate model (F1), lender access (F2),
   client portal (C5), OCR tier 2 (B), mail vendor (C4), e-sign (C6).

## D. Decisions and materials only you can provide

| # | Item | Why it blocks |
|---|---|---|
| 1 | `ANTHROPIC_API_KEY` | AI wording help, Explain-this-fit, OCR option A, item translations |
| 2 | `MAIL_PROVIDER_API_KEY` + `MAIL_FROM` | Invitations, submission packages, notifications by email |
| 3 | Authorize.Net public client key + plan prices | Organization billing, later DIY consumer billing |
| 4 | GHL credentials: Private Integration token per location **or** Marketplace app | Any GHL sync |
| 5 | Sample credit report PDFs per service | Parser accuracy beyond generic layouts |
| 6 | OCR tier 2 choice (A or B) | Scanned reports |
| 7 | PDF retention policy | Storage bucket and compliance setting |
| 8 | Do lenders log in (portal) or receive packages by email? | F2 design |
| 9 | Partner/affiliate commission rules (flat, %, tiers, when earned) | F1 design |
| 10 | Mail vendor (Lob / Click2Mail) and e-sign provider | C4, C6, F6 |
| 11 | Stale timer cap (hours) | O3 |

Set secrets from the application folder only:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=… MAIL_PROVIDER_API_KEY=… MAIL_FROM="…"
```
