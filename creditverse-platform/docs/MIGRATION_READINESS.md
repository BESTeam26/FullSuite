# ClickUp → BES Migration Readiness

The dry-run analysis Dee's sprint rule requires (§49: *document migration
readiness; do not execute the import now*). Read-only — nothing here wrote a
row anywhere. Execution is gated on the pilot team using the five P0 areas
live.

*Surveyed 2026-09-09 against ClickUp workspace 25798251 and the live BES
database.*

## What ClickUp holds

**Partners Database** (list `901812869358`, BES HQ space): **25 partners.**

| ClickUp status | Count | Maps to |
|---|---|---|
| `active partner creditops` | 16 | partner, lifecycle active, CreditOps service |
| `active partner full` | 5 | partner + both services (CreditOps + BES CRM) |
| `active partner bes crm` | 3 | partner + BES CRM service |
| `on hold` | 2 | partner, lifecycle suspended |

Service tags (`creditops`, `bes crm`, `talentops`) refine the service rows;
one partner (Credit by Nainoa) carries `talentops`.

**Client folders** (CreditOps space): 8 MAIN CLIENTS + 14 OUTSOURCING CLIENTS
folders, 2 TalentOps-only, ~31 canceled/inactive. Each folder is a partner's
client LIST; its tasks are the clients.

**Logins** (list `901815950300`): credentials in task descriptions, zero
custom fields. **Deliberately not read in this survey** — descriptions carry
plaintext passwords, and secrets must never enter transcripts or reports. At
execution time the scrubber (`lib/migration/clickup-partners.ts`, 25 tests)
strips them and marks each entry `CREDENTIAL_MIGRATION_REQUIRED`; passwords
are re-entered by hand into the credential vault (0225), never imported.

## What BES already holds

2 real partners: **Kevin Hernandez** and **Quentin Grays / Wavy One
Solutions** — plus 4 real fulfillment clients. So the import is almost
entirely additive.

## Match analysis

- **Wavy One Solutions** — exists in both; the import must MERGE onto the
  existing group, not duplicate (`proposePartnerImport` already matches by
  normalized name).
- **Kevin Hernandez / Blue Chip Equity** — exists in BES and as a CLIENT
  FOLDER in ClickUp ("Blue Chip Equity - Kevin Hernandez"), but is **absent
  from the Partners Database list**. Finding: the Partners Database is not
  the complete roster; the real partner set is the UNION of that list and
  the client-folder names. The import plan reads both.
- Remaining ~24 partners are new to BES.

## Executed 2026-09-09 — partners are in

Dee's "proceed" green-lit execution. What ran, in migrations `20260909001000`
and `20260909001100` (idempotent, batch `9c2f7a5e-…-2026090900aa`):

- **26 partners** now live in `outsourcing_groups`: 24 new, 2 merged onto the
  rows BES already had (Kevin Hernandez annotated in place; Wavy One Solutions
  had name/partner swapped between the systems, which the first pass missed —
  the second migration merges cross-swapped duplicates generically and keeps
  the original row's email, contacts and client).
- **Service rows** (`partner_services`, typed CREDITOPS_FULFILLMENT / BES_CRM /
  TALENTOPS) and **engagements** (`fulfillment_engagements`) per partner per
  purchased service. Active partners → active; the two on-hold partners
  (Approve with Tiff, Business Made Fair) → paused, so nothing authorizes.
- Provenance on every row: `source_type='clickup'`, ClickUp task id, batch id.
- Every imported group is flagged `credential_migration_required` — contact
  emails and platform logins were deliberately NOT imported (ClickUp keeps
  them as plaintext in task descriptions). They are re-keyed by hand into the
  credential vault; rotate any password while re-keying it.
- Targeted RLS matrix over the partner surface (phases 55–57, 59, 60, 63):
  **301/301**.

## Clients — surveyed in full, import blocked on emails

All 20 client folders were paged completely: ~1,950 client tasks (~700 of
them archived). The blocker: `fulfillment_clients.email` is NOT NULL and
unique per partner — the identity rule — and ClickUp keeps each client's
email in a per-task custom field. Bulk task listings do not return custom
field values, and fetching ~1,900 tasks one at a time through the assistant
is both infeasible and unsafe (task descriptions carry plaintext credentials
and PII). Fabricated placeholder emails would poison the one-email-one-file
rule, so no client rows were written.

**Two ways to unblock (Dee picks one):**

1. **ClickUp CSV export (recommended).** Each client list exported from
   ClickUp's List view includes the Email and Current Round custom fields.
   Drop the CSVs in a folder and the import maps them straight onto the
   canonical model — emails and rounds included, no per-task fetching.
2. Relax `fulfillment_clients.email` to allow "no email on file" for imported
   records. A schema change to a canonical constraint — architecture-class,
   so it is proposed here, not executed.

**Proposed status mapping** (ClickUp client status → Dee's locked ten), for
confirmation before any client rows are written:

| ClickUp | → BES status |
|---|---|
| `incomplete onboarding` | Incomplete Onboarding |
| `onboarding follow up` | Incomplete Onboarding |
| `process r1` | Ready for Round 1 |
| `ready for processing` | Ready for Processing |
| `processing prio` | Prio Processing |
| `indispute - mailed` | Round Sent - Awaiting Results |
| `for complaints` | For Complaints |
| `for cfpb only` | For Complaints |
| `for client confirmation` | For Partner Confirmation |
| `suspended` | On Hold (Non Workable) |
| `1/2/3 monitoring issue` | On Hold (Non Workable) *(monitoring broken = not workable — confirm)* |
| `completed/ graduated` | lifecycle `graduated`, not a dispute status |
| `archived`, `canceled/inactive/` | lifecycle `archived` |

**Does not map cleanly — Dee decides:** `workforce audit`, `endorsed to
client`, `editing & mailing`, `do not work`. The original ClickUp status is
preserved verbatim on every imported record either way, so nothing is lost.

Three obvious test rows are excluded: "Test User" (BMF), "John Doe" (EDP),
"Nada Content" (ZackCredit).

## Execution plan — remaining steps

1. ~~Import partners~~ **DONE** (above).
2. Clients: blocked on emails — Dee picks CSV export or the schema change,
   and confirms the status mapping above.
3. Logins: re-keyed BY HAND into the credential vault (0225); nothing
   credential-shaped is imported by tooling. Rotate while re-keying.
4. Canceled/inactive partner folders: still awaiting Dee's decision
   (archived vs. left out) — NOT imported.
5. Full RLS matrix after the client import lands.

## Remaining decisions (client import gates on these)

- [ ] Dee picks the email path: ClickUp CSV export (recommended) or nullable
      email for imported records
- [ ] Dee confirms the client status mapping table above and rules on the
      four unmappable statuses
- [ ] Dee decides whether canceled partners import as archived or stay out

## Security note (2026-09-09)

While verifying the partner data, one partner task description (Vanquish
Ventures) was fetched and it contained plaintext platform logins — exactly
why descriptions are excluded from tooling-based import. Treat those
credentials as exposed-in-one-more-place and rotate them when re-keying into
the vault. Standing rule: partner/client task DESCRIPTIONS are never fetched
through assistant tooling again; structured fields only.
