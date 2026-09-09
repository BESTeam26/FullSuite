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

## Execution plan (when Dee green-lights)

1. Import partners from the union above: group + partner_name + lifecycle
   from status + `partner_services` rows from status/tags. Provenance marked;
   merge-by-match, never duplicate (rule 2).
2. Per active partner, import the client folder's tasks as fulfillment
   clients with their CreditOps master status mapped onto Dee's locked ten.
   Statuses that do not map cleanly are listed for Dee, not guessed.
3. Logins: scrubbed import of username/url/platform/notes into
   `partner_credentials`; passwords re-keyed by hand into the vault.
4. Canceled/inactive folders: imported as archived partners (history kept,
   nothing operational).
5. Full RLS matrix after; production data never resets.

## Prerequisites before execution

- [ ] Pilot team live on CreditOps/Timer/EOD/CRM (Dee's §49 gate)
- [ ] Dee confirms the status→lifecycle mapping above
- [ ] Dee decides whether canceled partners import as archived or stay out
