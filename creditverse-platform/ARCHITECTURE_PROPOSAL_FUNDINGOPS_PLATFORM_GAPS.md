# FundingOps platform — gap review against Dee's full design (2026-09-04)

**Status: review + proposal. Nothing built from this document.** Dee supplied a
complete FundingOps SaaS design (roles and portals, deal lifecycle, UI modules,
GHL integration, reporting / commissions / billing / audit). This maps each
part to what exists in the code and database today, marks it **Built**,
**Partial** or **Missing**, and proposes an order. Every "exists" claim was
checked on disk.

## 1. Roles, portals, permissions

| Design element | State | What exists / what is missing |
|---|---|---|
| RBAC: permissions → roles → users | **Built (chain), Partial (catalogue)** | `role + permission + scope + assignment + entitlement + engagement` enforced by RLS; organization roles as enum; configurable role access (0047). Permissions are department/view/action flags, not a fine-grained "approve deal / view commission report" catalogue yet. |
| Audit trail of all actions | **Built (mutations), Partial (reads)** | `activity_events` (append-only, triggers), `audit_log` (function-only insert). Logins and document views are not logged. |
| Internal team portal (pipeline, tasks) | **Partial** | FundingOps Company workspace: dashboard, deal list, queues, operational Client List (today), per-file Department Progress, My Work (work items only). Kanban board and task lists for funding exist only as Custom Workspaces, not on the deal itself. |
| Client (borrower) portal | **Missing** | External role `client` exists in the enum; `/portal` and `/diy-consumer` are demo pages with no live data. No application form, status bar, document upload, checklist or messaging for a funding client. |
| Lender portal | **Missing** | Role `lender` exists in the enum only. No `lenders` table, no lender users, no matched-deal view, no term-sheet/offer upload. `funding_deals.lender` is free text. |
| BRM / Sales Partner portal | **Missing (demo only)** | Roles `brm`, `sales_partner`, `referral_partner`, `affiliate` exist; `/affiliate` and `/outsourcing` pages are demo pages (`src/pages/portals/*`, no live queries). Referral types live in a frontend context (`lib/referral/*`), not the database. |
| Admin dashboard (users, roles, products, reports) | **Partial** | Agency settings sections exist (Organizations, Products, Users, Roles) — several still placeholder; Organization settings (views, roles & access, workspace views) are real. |

## 2. Deal lifecycle and data model

| Stage / data | State | Notes |
|---|---|---|
| Client → Business → Funding File → Deals hierarchy | **Built** | `funding_clients`, `funding_businesses`, `funding_files (stage, assigned_agent, due_at)`, `funding_deals (lender text, program, amount, rate, term, status, stips_outstanding, submitted_at, funded_at)`. |
| Lead capture / inquiry | **Missing** | No lead entity for funding; no GHL intake. |
| Application & screening data (financials, credit, collateral, terms) | **Missing** | No application record; `funding_businesses` carries basic business info only. |
| Underwriting / due diligence (documents, metrics DTI/LTV/DSCR) | **Missing** | Files are generic (`files`); no document-type checklist per file, no required/received status, no underwriting metrics. `FundingDealSectionsA` Readiness / Documents / Stipulations are static constants. |
| Readiness rules (deterministic) | **Missing** | No readiness engine in `lib/` (the design calls for deterministic readiness results). |
| Lender matching / criteria | **Missing** | No lender records, no criteria, no matching function. |
| Approval & terms (hierarchy, decision record) | **Missing** | Deal status enum only. |
| Documentation & e-signature | **Missing** | No e-sign integration. |
| Closing & funding record | **Partial** | `funded_at`, amount, lender text on the deal; no funding method, no commission record. |
| Post-closing hand-off / servicing | **Missing** | |
| Operational tracking (department status per file, hand-offs, SLA, production, EOD) | **Built** | Separation steps 1–3 (0051, 0054), production and EOD engines. |
| Timestamps + actor per change | **Built** | `activity_events` per status change (department, lifecycle, hand-off). |

## 3. UI modules

| Module | State |
|---|---|
| Login | **Built** (live auth, sign-up with trial) |
| Client portal dashboard (status bar, tasks, messages, e-sign) | **Missing** |
| Internal pipeline dashboard (Kanban by stage, KPIs) | **Partial** — dashboard counts + queue tables; no Kanban for funding deals; KPIs derived from store rows only |
| Deal detail with smart panel, tabs (Overview / Documents / Tasks / History) | **Partial** — `FundingDealWorkspace` (mixed domain/ops; split proposed in the separation document) |
| Lender portal UI | **Missing** |
| Partner/BRM portal UI | **Missing (demo)** |
| Admin dashboard / analytics | **Partial** |

## 4. GHL integration and data flows

| Flow | State |
|---|---|
| Lead intake from GHL forms → funding lead | **Missing** |
| Deal sync back to GHL opportunities / pipelines | **Missing** |
| Contact/communication sync | **Missing** |
| Payment events (Stripe/GHL) → invoiced/paid | **Missing** (Authorize.Net chosen for BES billing; GHL payments separate) |
| Outbound status webhooks | **Partial** — `webhook_endpoints` / `webhook_deliveries` tables and a CreditOps webhook panel exist; the actual HTTP delivery is commented out (`creditops-webhooks.tsx:283`); needs a server-side sender (Edge Function) |
| OAuth2 / API security | **Missing** for GHL; our own API is Supabase RLS (built) |
| Field mapping tables + validation | **Missing** |

## 5. Reporting, commissions, billing, audit

| Item | State |
|---|---|
| Pipeline reports by stage/type/user; funnel | **Missing** (Reporting proposal covers it; page is constants) |
| Team/user performance dashboards | **Partial** (production/EOD data exists; no report UI) |
| Commission tracking (splits, statements) | **Missing** (types only in the frontend referral context) |
| Billing & invoicing for borrowers (origination fees) | **Missing** |
| Audit log interface (filter/export) | **Missing** (table exists; agency "Audit Log" settings section is placeholder) |
| Alerts (idle deals, missing docs, approvals) | **Partial** — notifications engine exists (`notifications`, triggers on stage/assignee/priority); no funding-specific rules |
| Policy enforcement (no approval without docs) | **Missing** |

## 6. Proposed order (smallest coherent increments, each behind the existing RLS chain)

1. **Funding domain data, first-class** (one proposal): `lenders` (+ criteria), `funding_applications` (screening data), `funding_documents` (required/received per file with type), `funding_approvals` (decision, terms, approver), `commissions` (per deal: party, basis, amount, state). Readiness as a deterministic engine in `lib/funding/readiness-engine.ts` over those rows (unit-tested), lender matching as deterministic criteria evaluation. This is the foundation everything else reads.
2. **Deal detail split** (already proposed): domain deal workspace with tabs Overview / Documents / Approvals / Offers / History; operational file page stays the Workspace.
3. **Client portal (funding)** on the existing external role `client`: application intake form, document checklist upload (files table), status bar from file stage, messaging via activity (`client_visible`), e-sign later.
4. **Partner/BRM and Lender portals** on the existing external roles with real data: partner sees their referred deals and commissions; lender sees matched files, posts offers (→ `funding_deals`). RLS: per-external-membership scope; matrix phase per portal.
5. **GHL bridge as an Edge Function**: inbound webhook → funding lead → application; outbound opportunity/status sync; the existing `webhook_endpoints`/`deliveries` get their sender. OAuth2 tokens in server secrets.
6. **Reporting + commissions + audit UI** over the same rows (Reporting proposal), invoices for origination fees behind Authorize.Net.

Each step: proposal → migration + RLS + matrix phase → data layer → UI → browser verification → commit. No duplicate person, deal, task or engine anywhere; portals are surfaces over the same canonical funding records.
