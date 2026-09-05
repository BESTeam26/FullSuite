# Proposal — Reporting milestone (pivot reports, configurable KPIs, top agents, CreditOps outcomes)

**Status: step 1 built 2026-09-05 (0069: KPI catalogue, organization KPI settings, manual round outcomes, report_facts, report_pivot; Settings › KPIs, Reports pivot builder). Step 2 (report-derived outcomes) pending the canonical report model.**

## What exists (verified)
- `pages/app/Reporting.tsx` is sample charts (`monthly`, `breakdown`, `kpis`
  constants). Nothing reads live rows.
- Canonical sources that already exist and are RLS-scoped: `production_logs`
  (agency, employee, service/division, department, organization / outsourcing
  group, client, unit type, quantity, actions, work_date, voided), `time_entries`
  (employee, division, organization, client, work item, minutes),
  `work_items` (+ `work_attention`), `activity_events` (status changes with
  previous/new value), `fulfillment_clients` / `funding_clients` statuses.
- **Missing**: dispute-item outcomes. No `report_items` / round outcome rows
  exist (see ARCHITECTURE_PROPOSAL_CREDIT_REPORT_AND_SIMULATOR.md). "Most
  deletions", "no movement", "inquiries / personal info included" cannot be
  computed until the canonical report model lands, or are recorded manually.

## Design
1. **KPI catalogue as data** — `kpi_definitions`: key, label, service,
   source (production | time | work | activity | report_items), aggregation
   (count | sum | rate), filters (jsonb), owner (BES platform | organization).
   BES seeds the catalogue; an organization owner picks/orders KPIs and sets
   targets in `organization_kpi_settings` (per KPI: enabled, target, order).
   Every KPI resolves to ONE deterministic SQL function
   `kpi_value(kpi, scope, period)` — no per-KPI ad-hoc queries in components.
2. **Pivot engine** — one RPC `report_pivot(rows, cols, filters, period)` over
   a `report_facts` view that unions the canonical sources with a common
   shape (date, agency, organization, service, department, team, employee,
   client, unit, minutes, status_from, status_to, outcome). Rows: agent / team /
   department / organization / client / period; columns: KPIs; filters: service,
   department, organization, team, date range. Server-side, paginated (rule 14).
   Organization users see only their own facts; BES sees engaged/agency facts —
   RLS on the underlying tables does this already; the view is SECURITY INVOKER.
3. **Top agents** — the same pivot with rows = employee ordered by any KPI;
   internal BES KPIs never leave the agency (rule 16).
4. **CreditOps client outcome filters** — most deletions, no movement over a
   period, inquiries / personal information included: from `report_items`
   compared across reports. Provenance: engine-derived when the client is
   worked in our CRM; **manual outcome entry** (`client_round_outcomes`:
   client, round, bureau, items_disputed, deleted, updated, verified,
   recorded_by, source = 'manual') when the client lives in an outside CRM.
   Reports show which.
5. **Screens** — Reporting page per view mode: pivot builder (saved layouts
   per user in `user_preferences.report_layouts`), KPI cards from the
   organization's settings, top agents, CreditOps outcomes. Organization
   Settings → KPIs: pick, order, targets. Agency Settings → KPI catalogue.

## Order
1. `client_round_outcomes` (manual) + KPI catalogue + settings + `kpi_value`
   for production/time/work KPIs + pivot RPC + Reporting page (live).
2. Report-derived outcomes once the canonical report model exists.

## Verification
Matrix: organization users get only their own facts; BES agents bounded by
scope; KPI settings writable by owner/admin only; outcomes writable by the
client's organization members and engaged BES only. Unit: every KPI definition
resolves; pivot totals equal direct counts on fixtures.
