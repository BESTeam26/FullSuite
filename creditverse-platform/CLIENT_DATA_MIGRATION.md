# ClickUp → FullSuite client migration — pilot preview

**Status: PREVIEW ONLY. Nothing has been written.** No schema change, no
import, no row created or altered. This document is the proposal Dee asked for
before any production write.

**Pilot source:** ClickUp list `901821115879` — *Blue Chip Equity - Kevin
Hernandez*, workspace `25798251`, space `90180566841` (CreditOps), folder
`901814716683` (BES MAIN CLIENTS).

> **This document deliberately contains no secret values.** SSNs, dates of
> birth, addresses, monitoring passwords and CFPB passwords were all read
> during the inspection and NONE are reproduced here, because a planning
> document in a git repository is not a place for them. Where a secret exists
> the table says so and says where it must go.

---

## 1. The headline

```
7  ClickUp client tasks
1  matched to an existing FullSuite client
6  new
0  ambiguous
0  incomplete beyond repair

56 attachments
42 comments
7  records containing protected identity or access data
```

## 2. Partner match — already canonical, no new partner

| | |
|---|---|
| ClickUp list | `901821115879` — Blue Chip Equity - Kevin Hernandez |
| FullSuite partner | **Kevin Hernandez**, `b5bed22d-0411-457b-aacc-d1f42c74eb61` |
| How it was matched | Already imported from ClickUp: `source_type = 'clickup'`, `source_reference = 'clickup:partners-database:901812869358'` |
| Lifecycle | active |
| CreditOps engagement | live — the partner is in the active CreditOps workspace |

**No second partner will be created.** The one gap: the partner row records the
ClickUp *partners-database* row it came from, not the ClickUp **client list**.
The import must store `901821115879` against this partner so the next run — and
every future list — matches by id and never by name.

## 3. The seven, and what each one has

| ClickUp task | Name | ClickUp status | Round field | Due | Comments | Attach. |
|---|---|---|---|---|---|---|
| `86eyw4bhk` | Thania Ramirez Calix | process r1 | *(unset)* | — | 1 | 3 |
| `86eyw2fnz` | Ivan Garcia | ftc needed | *(unset)* | 2026-09-09 | 3 | 8 |
| `86eyw13bk` | Jared Torres Acevedo | for cfpb only | *(unset)* | 2026-09-09 | 6 | 11 |
| `86eyv19e6` | Giselle Da Silva | indispute - mailed | Round 2 | 2026-10-19 | 11 | 12 |
| `86eyv142h` | Newjersey Pelaez Jr. | indispute - mailed | Round 1 | 2026-10-19 | 7 | 7 |
| `86eyuzu46` | Sonia Colon | indispute - mailed | Round 2 | 2026-10-21 | 10 | 10 |
| `86eyuym9h` | Bryan Rodriguez | for complaints | Round 2 | 2026-09-07 | 4 | 5 |

## 4. Client matching

| Name | Verdict | Evidence |
|---|---|---|
| **Bryan Rodriguez** | **MATCH — update, do not create** | Exact email match on the same partner. Already in FullSuite (`CN-VX3TTE`, status *For Complaints*, round *Pre-Round*) |
| Thania Ramirez Calix | New | |
| Ivan Garcia | New | |
| Jared Torres Acevedo | New | |
| Giselle Da Silva | New | |
| Newjersey Pelaez Jr. | New | |
| Sonia Colon | New | |

Nothing matched on name alone, and nothing needs a human decision.

**Note on Bryan:** FullSuite has him at *Pre-Round*; ClickUp says Round 2 and
his own card title says "- R2". The import corrects the round. His FullSuite
record also has no DOB, no address and no credentials — the migration fills
them.

**Also in FullSuite under this partner:** "Jane Smith" (`CN-7EEQTK`), which has
no ClickUp counterpart and appears to be test data. It is out of scope and will
not be touched.

## 5. Status mapping

ClickUp's list carries **22** workflow states. FullSuite's `fulfillment_client_status`
is a locked vocabulary of 39. These are not the same shape and the ClickUp
string is never copied across — it is preserved as provenance instead.

| ClickUp status | → FullSuite status | Note |
|---|---|---|
| `process r1` | **Ready for Round 1** | |
| `ftc needed` | **FTC FILED** — *see open question 3* | |
| `for cfpb only` | **CFPB FILED** — *see open question 3* | |
| `indispute - mailed` | **In Dispute** | letters are out |
| `for complaints` | **For Complaints** | already the live value on Bryan |

The other 17 ClickUp states are unused in this list and are mapped when a list
that uses them is migrated — guessing them now would be untested mapping.

**Provenance:** every imported client keeps its original ClickUp status string,
so a mapping we get wrong is correctable without going back to ClickUp.

## 6. Round mapping

| ClickUp | → FullSuite `round` |
|---|---|
| Round 1 | Round 1 |
| Round 2 | Round 2 |
| *(unset)* | **Pre-Round** |
| `SECURITY FREEZE ONLY` | **not a round.** Never converted to a numbered round |

**No historical rounds are fabricated.** Giselle at Round 2 gets `round = Round
2` and nothing else; no Round 1 record is invented to explain it. FullSuite's
enum already reaches Round 13, so deeper rounds in later lists map directly.

`SECURITY FREEZE ONLY` does not occur in this pilot. It has no canonical home
yet — see the gaps table.

## 7. Field mapping

| ClickUp source | → FullSuite destination | Notes |
|---|---|---|
| Task name | `clients.full_name` / `fulfillment_clients.name` | |
| Description — address block | `clients.address_line1/city/state/postal_code` | Structured, not free text |
| Description — `DOB:` | `clients.date_of_birth` | Protected |
| Description — `SSN:` | **no destination today** | See gaps |
| Description — `Cell:` | `clients.phone` / `fulfillment_clients.phone` | |
| Description — `Email:` | `clients.email` / `fulfillment_clients.email` | Also the match key |
| Current Round | `fulfillment_clients.round` | |
| ClickUp status | `fulfillment_clients.status` (mapped) | Original kept as provenance |
| Due date | `fulfillment_clients.due_at` | |
| `MFSN` block | **no destination today** | Credit monitoring credential |
| `CREATED CFPB LOGINS` block | **no destination today** | CFPB portal credential |
| Comment `ID:` | **no destination today** | Legacy client id |
| `Equifax Data Breach` / `NPD Data Breach` | **no destination today** | |
| Comment `Started:` / `Created:` | **no destination today** | Legacy program dates |
| `OPEN ACCOUNTS` lists | **no destination today** | |
| Task / comment / attachment ids | **no destination today** | Provenance and idempotency |

## 8. Comments — 42, and not all of them are notes

They fall into four kinds, and treating them alike would be wrong:

| Kind | Count | Treatment |
|---|---|---|
| **Attachment receipts** — a comment whose entire body is a list of filenames | ~24 | **Not** imported as notes. They are duplicate evidence of an upload; the attachment record carries the same fact |
| **Identity/credential blocks** — the legacy-system paste with SSN, DOB, legacy ID, monitoring login | 7 | Structured values extracted to their proper destinations. The note text is imported **scrubbed**, with secrets replaced by a marker, exactly as the partner card import did in 0263/0264 |
| **Operational notes** — "OPEN ACCOUNTS…", dispute reference numbers, "ACC", "INQ-PID" | ~10 | Imported as notes, verbatim |
| **ClickBot automation** — the SLA nag on Newjersey | 1 | **Not** imported. It is a ClickUp automation artefact, not BES history |

**Authors are preserved.** Two real people appear — Dee Gallardo and **Jezel Ane
Mirambel** — and the import must attribute each note to the right one, at its
**original ClickUp timestamp**, never today's date.

**Bryan's comment is the case that proves the rule:** it holds his legacy id,
his monitoring credentials, his program start date and **a different address
from his own description**. None of that is in a custom field. Dropping comments
would lose it.

> **Conflict to resolve:** Bryan has two addresses — one in the description, one
> in the comment. The comment is the older legacy-system paste. The import will
> take the **description** as current and keep the comment's address in the note
> history, flagged for review rather than silently discarded.

## 9. Attachments — 56

| Kind | Note |
|---|---|
| Identity documents | `DL.jpg`, `POA.jpg`, `SSN.jpg`, `SSN.jpeg` — Thania's three are her *only* data; her card is otherwise empty |
| Progress report PDFs | 2 — Ivan and Jared, September 2026 |
| Screenshots | ~50 bureau/portal captures, several over 2 MB |

Each keeps original filename, ClickUp attachment id, original upload timestamp
and its client relationship, and attaches to the **end client** — which is where
they came from.

## 10. Protected data found — all 7 records

| Data | Records | Where it currently sits |
|---|---|---|
| Full SSN (plaintext) | 6 | ClickUp description and/or comment |
| SSN as an image | 2 | `SSN.jpg` / `SSN.jpeg` attachments |
| Date of birth | 6 | Description |
| Credit monitoring (MFSN) login + password | 5 | Description or comment |
| CFPB portal login + password | 3 | Description and comment |
| Home address | 6 | Description |
| Legacy client id | 4 | Comment only |

**Every one of these is in ClickUp in plaintext today**, readable by anyone with
list access. Migrating them into a protected store is a security improvement,
not a new exposure — but the credentials should be **rotated** afterwards, for
the same reason the partner passwords were (0263/0264).

## 11. What FullSuite has nowhere canonical to put

This is the honest gap list, and it is the reason this is a preview.

| Missing | Why it matters | Proposal |
|---|---|---|
| **Client SSN** | Required by the fulfilment workflow; Dee has ruled out last-four-only | Encrypted at rest via Supabase Vault, the same mechanism `partner_credentials` already uses — never a plain column |
| **Client-level credentials** | `partner_credentials` is partner-level. MFSN and CFPB logins belong to a *client* | Extend the existing vault-backed credential model to a client owner, rather than a second credential system |
| **Breach flags** | Equifax / NPD drive dispute strategy | Two booleans on the CreditOps client |
| **Legacy client id** | The bridge back to the old system | External id with its source named |
| **ClickUp provenance** | Idempotency depends on it | Task, comment and attachment ids stored against each record |
| **Open-accounts lists** | Operational context agents use | Note for now; a structured account list is a bigger design |
| **Dispute reference numbers** | e.g. the numbers in Giselle's and Newjersey's comments | Note for now |
| **Legacy program start date** | "Started: 07/24/2026" | A dated field on the CreditOps client |
| **`SECURITY FREEZE ONLY`** | A real workflow state that is not a round | Needs its own home — not a round, not a status guess |

## 12. Idempotency

A second run must change nothing it already did. The design:

- every imported record stores its ClickUp id — workspace, space, folder, list,
  task, comment, attachment;
- the first match key is that id, before email, before phone, before name+DOB;
- a re-run **updates** the record it created and creates nothing new;
- the partner ↔ list link is stored, so no run ever matches a partner by name.

## 13. What is needed before the import runs

1. **Schema for the gaps above** — chiefly SSN and client-level credentials,
   both vault-backed. This is the substantive build.
2. **Three decisions from Dee** — see the open questions in the covering note.
3. **A dry run producing exactly this document from live data**, so the
   proposal and the importer cannot disagree.
