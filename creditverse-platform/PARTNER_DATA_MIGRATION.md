# Partner data migration — ClickUp and the revenue tracker → BES

**Status: mapped, coded and tested. Nothing has been imported.** Dee's
instruction stands: finish the schema, the authorization and the profile,
produce a dry-run reconciliation, and only then import.

**2026-09-08 — the adapter exists.** `src/lib/migration/clickup-partners.ts`
turns a snapshot of the ClickUp list into a PROPOSAL and writes nothing: the
lifecycle/service split of §2.1, the field mapping of §3, the credential guard
of §7 and the identity reconciliation of §8, with 22 unit tests. It is pure,
so it is reviewable without a database.

**What still blocks the import, and it is not code.** The revenue tracker
(§4) is authoritative for everything commercial, and BES does not have it.
ClickUp's own `Amount / MRR ($)` field is empty on most rows. A dry run from
ClickUp alone would therefore propose commercial terms from the losing source,
which is worse than proposing none. The tracker export is item **B5** in
`WHAT_I_NEED_FROM_DEE.md`.

Two legacy sources, and they are authoritative for *different truths*.

| Source | Authoritative for | Where it disagrees |
|---|---|---|
| **Newest revenue tracker** (Google Sheet, "March 2026") | Commercial relationship, services, pricing, billing terms, client volume, start dates, payment channels, expected and actual collection, cancelled service lines | **Wins** on anything commercial or financial |
| **ClickUp — BES HQ ▸ Partners Database** (list `901812869358`, ~25 records) | Operational state: lifecycle, assigned support team, partner health/mood, tags, operational notes, current client relationships, ownership history | **Wins** on operational workflow |
| Earlier spreadsheet | — | **Superseded** wherever it conflicts with the newest tracker |

---

## 1. The canonical definition this migration serves

> **A BES PARTNER is a company or person with whom BES has a commercial
> service relationship.**

The partner is the **account**. Everything BES sells them is a **service
engagement** underneath it.

```
BES AGENCY
→ PARTNER
   → CONTACTS
   → SERVICE ENGAGEMENTS      one or many, over its lifetime
   → BILLING TERMS            per engagement, effective-dated
   → BILLING SCHEDULE         instalments and dated obligations
   → INVOICES → PAYMENTS      what was billed, and what arrived
   → CLIENTS                  optional — a build client has none
   → OPERATIONS               CRM, mailing, SOP, channel
   → TEAM ASSIGNMENTS
   → FILES · PORTAL · ACTIVITY · HEALTH
```

A partner does **not** need CreditOps, FundingOps, end clients, or a SaaS
tenant. The tracker proves it: fixed GHL builds, hourly TalentOps, EA
arrangements, monthly retainers, CRM subscriptions and per-client fulfilment
all appear, and all are partners.

**One partner, many engagements.** *Credit by Nainoa* appears twice in the
tracker — CreditOps Fulfillment and 2 Dedicated Support Agents. That is **one**
partner record with two service rows, never two partners.

---

## 2. Two separations the migration must not collapse

### 2.1 Lifecycle is not service

ClickUp's statuses mix them: `active partner creditops`, `active partner full`,
`active partner bes crm`. Normalised on the way in, never reproduced.

| ClickUp status | → Partner lifecycle | → Service engagements |
|---|---|---|
| new partner | `new` | — |
| onboarding | `onboarding` | as the data establishes |
| active partner creditops | `active` | CreditOps Fulfillment `active` |
| active partner full | `active` | whatever set the data establishes |
| active partner bes crm | `active` | BES CRM `active` |
| on hold | `on_hold` | unchanged |
| cancelled / archived | `archived` | each service `cancelled` |

Partner lifecycle: `new · onboarding · active · on_hold · suspended · archived`
Service status: `pending · onboarding · active · paused · completed · cancelled · ended`

A completed build does not archive the partner. A cancelled subscription does
not end the relationship. Only every engagement ending, plus a human decision,
archives a partner.

### 2.2 `partner_services` is not `fulfillment_engagements`

They sound identical and are opposite things.

- **`fulfillment_engagements`** — an **authorization**. It is what
  `bes_may_fulfil()` reads to decide whether BES staff may open a *customer's*
  operational records (rule 16). Model 2 only.
- **`partner_services`** — a **commercial line**. What BES sells, to whom, on
  what terms. A GHL build has one and grants no data access whatsoever.

**A billing row must never widen what anyone can read.** The migration writes
`partner_services`; it does **not** create engagements.

---

## 3. ClickUp field mapping

| ClickUp field | BES destination | Class | Derived or stored | Notes |
|---|---|---|---|---|
| Task title | `outsourcing_groups.name` | operational | stored | Company name → `partner_name` when distinct |
| Status | `outsourcing_groups.lifecycle` + `partner_services.status` | operational | stored | Split per §2.1 |
| OWNER (short text) | `partner_contacts` (primary) → `outsourcing_groups.primary_contact_id` | operational | stored | The partner's own person, **not** the BES assignee |
| Assigned Agent / Team (`Team Dan`, `Team Daniel`) | `outsourcing_groups.team_id` → `teams` | operational | stored | Resolved to a canonical team; never left as free text |
| Subscription Plan (SAAS) (`Core`, `Enterprise`) | `outsourcing_groups.saas_plan` | operational | stored | **Not** a service they buy |
| Billing Status (`Active`, `Pending - Invoice Sent`, `Overdue`) | `partner_service_billing.billing_status` | **financial** | stored | `active · invoice_pending · overdue · paused · cancelled` |
| Client List (relationship, duplicated in ClickUp) | `fulfillment_clients.outsourcing_group_id` | operational | stored | **One** canonical relationship; the duplicate field is not reproduced |
| Days Active (formula) | — | operational | **derived** | `today − started_on`, computed in `partner-account.ts` |
| Client Feeling / Mood | `outsourcing_groups.health` + `health_note`, `health_changed_by`, `health_changed_at` | operational | stored | `happy · neutral · concerned · at_risk`; feeds the Attention Center |
| Payment Method (`PayPal`, `WISE`, `GHL Invoice`, `Authorized.net`, `Stripe`) | `partner_service_billing.payment_channel` → `partner_payment_channels` | **financial** | stored | Controlled list + `OTHER` + `UNKNOWN` |
| Active Clients (Count) | `outsourcing_groups.legacy_reported_active_clients` | operational | **derived going forward** | Canonical count comes from `partner_client_counts()` |
| Amount / MRR ($) | `partner_service_billing.mrr_cents` | **financial** | stored per engagement | Partner-level MRR is **derived** by summing live fixed-recurring lines |
| Tags (`active`, `creditops`, `bes crm`, `talentops`) | translated into lifecycle + service type | operational | not stored as tags | Tags are never authorization or entitlement |
| Task description (setup notes) | `partner_operations.notes` / service notes | operational | stored | **See §7 — credentials are never copied** |

**ClickUp field IDs stay in the migration adapter.** They must not appear in
domain logic.

---

## 4. Revenue tracker mapping

The sheet's own columns, and where each lands.

| Tracker column | BES destination | Class |
|---|---|---|
| Client ID | `outsourcing_groups.source_row_ref` | provenance |
| COMPANY NAME | `outsourcing_groups.name` | operational |
| Start Date | `outsourcing_groups.started_on` / `partner_services.started_on` | operational |
| Weekly Invoice Day (`Tuesday`, `Friday`, `End of the month`) | `partner_service_billing.invoice_day` | **financial** |
| Credit Repair CRM | `partner_operations.crm_name` / `crm_url` | operational |
| Mailing System | `partner_operations.mailing_system` / `mailing_url` | operational |
| GHL / BES CRM? | `partner_operations.ghl_location` / `ghl_url` | operational |
| SOP | `partner_operations.sop_url` | operational |
| Communication Channel Link | `partner_operations.comm_channel` / `comm_url` | operational |
| Assigned Processor | `partner_services.processor_id` → `profiles` | operational |
| Special Notes | `partner_services.notes` or `outsourcing_groups.notes` — see §6 | operational |
| Client Name (e.g. *Wes Hall*) | `partner_contacts` primary contact | operational |
| Service / Subscription | `partner_services.service_type` + `name` | operational |
| Payment Channel | `partner_service_billing.payment_channel` | **financial** |
| Transaction Type (`Business` / `Personal`) | `partner_service_billing.transaction_type` | **financial** |
| Payment Frequency (`Weekly`, `Monthly`, `Varies/ per client`, `Fixed`) | `partner_service_billing.billing_model` | **financial** |
| Client Number (`19`, `300-400`, `176`) | integer → `partner_service_billing.quantity`; text → `partner_services.client_volume_text` | mixed |
| Payment / Plan (`$250.00`, `$5/ hour`) | `partner_service_billing.rate_cents` (+ `HOURLY` model) | **financial** |
| Conversion (`₱56.00`, `₱59.00`) | `partner_service_billing.fx_rate_used`, `currency_original` | **financial** |
| Quantifier (Month/Rounds) | `partner_service_billing.quantity` | **financial** |
| Expected Collection for the Month | — | **derived** — `rate × quantity`, converted at the record's own rate |
| January … December | `partner_revenue_entries (year, month, actual_cents)` | **financial** |
| Actual Collection | — | **derived** — sum of `partner_payments` going forward |

### Billing model mapping

| Tracker frequency | `partner_billing_models.code` | Contributes to |
|---|---|---|
| Weekly | `RECURRING_WEEKLY` | Fixed MRR — rate × 52 ÷ 12 |
| Monthly | `RECURRING_MONTHLY` | Fixed MRR |
| Monthly Retainer Fee | `RETAINER` | Fixed MRR |
| Varies / per client | `PER_CLIENT` | **Variable** expected recurring — never fixed MRR |
| per round | `PER_ROUND` | Variable |
| per agent (`2 Dedicated Support Agents`) | `PER_AGENT` | Variable |
| `$5/ hour`, `$6/ hour` | `HOURLY` | Variable |
| Fixed (`Full Build - GHL`, `Partial Build`) | `FIXED_PROJECT` | **Project value — never MRR** |

### Conversion rate

The tracker holds **₱56** on most rows and **₱59** on one older row. Each rate
belongs to the record that used it. `fx_rate_used` is stored per billing row
and per revenue row, and **historical amounts are never recomputed at today's
rate** — doing so would silently restate every past month.

---

## 5. Sections of the tracker, and what each becomes

| Section | Treatment |
|---|---|
| Active weekly / per-client rows | `partner_services` `active`, terms from the row |
| Monthly retainers, BES CRM, Ops Manager Fee | `partner_services` `active`, `RECURRING_MONTHLY` / `RETAINER` |
| TalentOps hourly rows | `partner_services` `active`, `HOURLY`, rate per hour |
| **AUTOMATIONS** (Full Build, Partial Build) | `partner_services` `completed` or `active`, `FIXED_PROJECT`, `contract_value_cents` |
| **Build for follow up**, **Pending Payment**, **Pending For Client** | `partner_services` **`pending`** — a quoted line, not an active engagement, and **not** counted in MRR or expected collection |
| **CANCELED CLIENTS ALL BELOW** | `partner_services` `cancelled`, with their historical terms preserved. The **partner** is archived only if no other engagement is live |

A partner appearing in both the active and cancelled sections keeps **one**
record with a mix of active and cancelled services. `Business Made Fair`,
`BizHub Financial`, `The Commission Firm` and `Credit Cure` are all this shape.

---

## 6. Notes go where their meaning goes

Not one blob. The tracker's Special Notes carry at least four different kinds
of fact:

| Example note | Destination |
|---|---|
| "Processing and Support", "Fulfillment (Dispute, onboarding…)" | `partner_services.description` |
| "With Monthly Retainer Fee for support" | the retainer service's own row |
| "Using our GHL", "Using our DF", "ALL CRMS on their side" | `partner_operations.notes` |
| "VIP Client", "Wife hands-on" | `outsourcing_groups.notes` (relationship) |
| "$100/ weekly", "10 Clients * $30" | **financial** — the terms, not a note |
| "Pending For Client", "NEW - MARCH \| Pending Payment" | service status `pending` |

---

## 7. Credentials — do not migrate

**Measured 2026-09-08, not hypothetical.** Several task descriptions in the
live list are access lists holding **passwords in plain text** — DisputeFox,
LetterStream, Gmail, GoHighLevel, Zapier, Credit Repair Cloud and a phone
system — including shared BES team logins, so one leak is not one partner.
Nothing has been copied out of ClickUp: not into the database, not into a
file, not into a commit, not into a report. Rotating them and moving them into
a password manager is item **0.1** in `WHAT_I_NEED_FROM_DEE.md`.

ClickUp task descriptions contain platform configuration, support emails,
handoff notes **and passwords, security codes or API keys**.

**Safe operational information** → `partner_operations` (names, links, notes).

**Credentials, keys, security codes, passwords** → **not copied into any
field.** `scrubCredentials()` removes them line by line rather than dropping
the whole description — Kenneth Winfield's task is a complete, useful SOP
(scope of work, communication rules, dispute standards) with three passwords
in the middle of it, so keeping all of it publishes the passwords and dropping
all of it throws away the SOP. The detector is deliberately generous: a false
positive costs one stripped line of a note, a false negative writes a password
into a column everyone with `partners.view` can read.

The partner record sets
`outsourcing_groups.credential_migration_required = true` with a
`credential_note` describing *what kind* of secret exists and *where it lives
today* — never the secret itself. The Partner Overview shows the flag.

A credential in a text field is readable by everyone who can open the record
and leaves no trace when it is read. A vault that encrypts and audits every
access is a separate mechanism, designed separately.

---

## 8. Identity reconciliation

The same partner appears under variant names across the two sources:
`Credit Cure` / `CreditCure`, `BizHub Financial` / `Bizhub`, `K&A Consultants` /
`K&A Consulting`, `Rocket Credit Repair Fundare Capital LLC` / `Fundare Capital`.

**Fuzzy name matching never merges automatically.** The dry-run proposes a
match with its evidence — name similarity, contact name, contact email, the
ClickUp OWNER field — and Dee approves each one.

---

## 9. Provenance

Every migrated row records where it came from, so legacy data and data entered
in BES stay tellable apart:

```
source_type       'legacy_tracker' | 'clickup' | 'legacy_spreadsheet' | 'bes'
source_reference  the sheet tab or ClickUp list
source_row_ref    the row or task id
import_batch_id   one uuid per import run
imported_at       when
```

Present on `outsourcing_groups`, `partner_services` and
`partner_revenue_entries`.

---

## 10. Data classification, as enforced

**Operational** — company, contacts, start date, service, service status,
client volume, CRM, mailing, GHL, SOP, communication channel, assigned
processor and team, health, operational notes.
→ Any staff member with `partners.view`.

**Financial** — billing model, rate, currency, FX, quantity, invoice day,
payment channel, transaction type, expected and actual collection, billing
status, MRR, revenue history, invoices, payments, expenses.
→ `partners.financials.view` and its siblings. **Off by default for managers,
team leads and agents.**

This is enforced by **table separation**, not by hiding fields: Postgres RLS is
row-level and cannot withhold a column, so the financial columns live in
`partner_service_billing`, `partner_invoices`, `partner_payments`,
`partner_billing_schedule` and `agency_expenses`, each behind its own policy
with **no partner branch at all**. An unauthorized query returns nothing —
there is nothing for the interface to hide.

---

## 11. Before any import

1. ~~Normalized partner schema~~ — done (migrations 0158–0165)
2. ~~Agency-wide Admin access~~ — done (0154/0155)
3. ~~GHL-style per-user permissions~~ — done (0156 + Access panel)
4. ~~Manager financial restriction~~ — done, proved by matrix phases 56–57
5. ~~Partner client relationship~~ — done (0165)
6. ~~Partner Profile UI~~ — done
7. ~~Multi-service model~~ — done
8. ~~Billing and revenue model~~ — done (0160–0161)
9. **Dry-run reconciliation report** — **the mapping is built and tested
   (`src/lib/migration/clickup-partners.ts`); the report is waiting on the
   revenue tracker (B5), without which its financial half would come from the
   wrong source**

The dry-run must show, per source row: source name, proposed canonical partner,
match confidence and evidence, services detected, active vs historical,
financial records, client volume, ClickUp match, conflicts and warnings.

**Dee reviews it before anything is written to production.**

Known reconciliation from the ClickUp side, for when that review happens: BES
holds three partner rows today, two of them real — `Kevin Hernandez` and
`Quentin Grays`, both named after the OWNER rather than the company. ClickUp
calls the same two `Blue Chip Equity - Kevin Hernandez` and `Wavy One
Solutions`. Company-name matching alone finds neither, which is why
`matchCandidates` scores the ClickUp OWNER field against the existing record's
name as well. The other 23 rows propose as new partners.

---

## 12. After migration

BES is authoritative. ClickUp is not kept in sync as a second partner database.
The migration is one-way — `ClickUp → BES` — unless Dee explicitly asks for
synchronization later.
