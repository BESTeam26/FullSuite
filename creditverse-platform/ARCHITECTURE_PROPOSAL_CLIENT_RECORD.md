# Architecture proposal — the Client as an organization asset

**Status: PROPOSAL. Nothing here is built.** Dee, 2026-09-05: *"move client as
org asset outside the CreditOps and FundingOps as it will hold all clients
info and logins and documents; then CreditOps and FundingOps as the actual
fulfilment engine only."*

This is the right shape, and it closes a gap the project rules have carried
since the beginning (rule 2: *"those records remain a third shape of a
person… reconciling them onto the canonical record needs the backend"*).
It is also a change to the centre of the data model, so it is written down
before anything moves.

## 1. What exists today (FACT)

A person is currently three unrelated records:

| Record | Where | Holds |
|---|---|---|
| `fulfillment_clients` | CreditOps | name, email, phone, status, round, assigned agent, SLA, open items, CN- id |
| `funding_clients` | FundingOps | borrower name, business, portal login (`portal_user_id`), contact details |
| `client-seed.ts` | sample data | a third shape, interface only |

Everything else hangs off whichever one it happened to be built against:
`credit_reports.fulfillment_client_id`, letters and rounds, activity, files,
round outcomes, report changes — all CreditOps; `funding_files`, documents,
submissions, offers — all FundingOps.

**What that costs today.** The same person, funded and disputing, is two
records with two ids, two contact details, two document piles and (if the
funding portal is used) one login that the credit side cannot see. Change a
phone number in one place and the other is stale. There is no answer to
"show me everything we hold for this client".

## 2. The shape Dee is asking for

```
ORGANIZATION
└── Client                     ← the asset: who they are
    ├── identity & contact     name, preferred name, email, phone, DOB, address
    ├── login                  one portal account for this person
    ├── documents              ID, proof of address, agreements, statements
    ├── businesses             the companies they own
    └── engagements
        ├── CreditOps case     dispute cycle: rounds, letters, reports, outcomes
        └── FundingOps files   funding attempts: application, lenders, offers
```

CreditOps and FundingOps stop owning the person and own **the work on the
person** — which is what they are good at, and what rule 17 says they are for.

## 3. Data model (PROPOSAL)

### 3.1 The new canonical record

`clients`

| Column | Notes |
|---|---|
| `id`, `public_id` | keeps the existing `CN-` series so nothing printed becomes wrong |
| `organization_id` / `outsourcing_group_id` | exactly one, as the engine tables do today (model 2 vs model 3, rule 16) |
| `agency_id` | owning agency, as every other record carries |
| `first_name`, `last_name`, `preferred_name` | one place for "what do we call them" |
| `email` (citext), `phone`, `date_of_birth`, `address` fields | one place for contact details |
| `portal_user_id → profiles` | **one login per client**, serving both portals |
| `status` (`active`, `paused`, `archived`), `lifecycle` | the relationship, not the case |
| `provenance` (`saas_pulled`, `outsourcing_only`, `diy_converted`, `ghl`) | where the record came from |
| `created_by`, timestamps | audit |

`client_businesses` — reuses the existing `businesses` table by adding
`client_id`, so a borrower's companies stop being funding-only.

### 3.2 The engines keep their own records, and point at the client

- `fulfillment_clients.client_id → clients(id)` — becomes the **credit case**:
  status, round, assigned agent, SLA, open items. Its duplicated identity
  columns are kept for one release, then dropped.
- `funding_clients.client_id → clients(id)` — becomes the **borrower profile**:
  the funding-specific fields only. `portal_user_id` moves to `clients`.
- Everything already attached to either engine record stays attached to it.
  No letters, reports, files or funding files are re-pointed, which keeps the
  migration small and the history intact (rule 4: historical attribution must
  not change).

### 3.3 Documents

Client documents become `files` with `entity_type = 'client'`, visible to both
engines and to the client's own portal, replacing the two separate piles. The
funding document-request flow keeps working: a document requested on a funding
file is still that file's, and a general client document is the client's.

### 3.4 One login, both portals

`clients.portal_user_id` is the single sign-in. `is_borrower_of_file()` keeps
working (it resolves through `funding_clients.client_id`), and the credit-side
portal proposed in `ARCHITECTURE_PROPOSAL_CLIENT_PORTAL.md` uses the same
account instead of inventing a second one. **That proposal is absorbed into
this one**: build this first, and the client portal becomes a set of screens
rather than a new identity model.

## 4. Authorization

No new permission system (rule 3). One helper, in the same chain:

```
client_visible(client) = is_agency_staff-with-engagement
                       | is_org_member(organization_id)
                       | is_client_of(client)          -- their own record
```

- Reads: organization members with `creditops.clients.view` **or**
  `fundingops.files.view` — a person who works funding can see the client, and
  the credit case stays behind its own key.
- Writes: `member_can(org, 'creditops.clients.edit')` for identity and contact;
  each engine keeps its own writers for its own fields.
- The client themself: their own row, their own documents, nothing else.
- BES staff: through the engagement, exactly as now.

## 5. Migration path (this is the part that must not go wrong)

| Step | Migration | What it does | Reversible |
|---|---|---|---|
| 1 | 0082 | Create `clients`, `client_visible()`, policies. Nothing reads it yet. | yes |
| 2 | 0083 | Backfill: one `clients` row per `fulfillment_clients` and per `funding_clients`, **deduplicated by `(organization_id, lower(email))`** — the only safe key, and only where the email is non-empty; anything ambiguous gets its own row and a `needs_review` flag rather than a guessed merge. Add `client_id` to both engine tables and set it. | yes (drop the column) |
| 3 | 0084 | Point reads at the client: a `client_overview` view, the Clients screen, the client profile header. Both engines still write their own fields. | yes |
| 4 | 0085 | Documents: `entity_type = 'client'`, and the client's portal login moves from `funding_clients` to `clients`. | yes |
| 5 | 0086 | Drop the duplicated identity columns from the engine tables, after a release with both in place. | **no** — last |

**Nothing is merged on a name.** Rule 4 forbids inferring identity from a
display name, and two "J. Smith" records in one organization are two people
until a human says otherwise. The dedupe key is the email address, and a
`clients.needs_review` flag surfaces the rest in a short screen where a person
confirms or splits them.

## 6. What changes for the people using it

- **Clients** becomes an organization-level screen (its own sidebar entry, not
  under CreditOps), listing every client with what they have running: a
  dispute round, a funding file, both, or nothing yet.
- **The client profile** gains a header with identity, contact, login status
  and documents, then tabs per engine — the CreditOps tabs that exist today,
  plus Funding when a funding file exists.
- **Starting work** becomes "start a dispute case" or "open a funding file"
  from the client, instead of creating a second person.
- **Funding and credit stop drifting apart**: one phone number, one address,
  one set of documents, one login.

## 7. Risk, stated plainly

This touches the record that everything else references. The risks and what
holds them:

1. **A wrong merge invents a person who does not exist.** Held by: email-only
   dedupe, `needs_review` for the rest, no name matching, and the whole
   backfill runs in one transaction that is checked before it is committed.
2. **A policy rewrite loosens access.** Held by: policies are written fresh
   from the live catalogue (the 0066 lesson), and RLS matrix phases 35–36 prove
   each one before the next step.
3. **Two writers disagree about the same field.** Held by: identity lives in
   `clients` only; the engines' copies are dropped in the last step, not left
   as a second truth.
4. **A long release with both shapes in place.** Held by: steps 1–4 leave both
   readable, so the interface can move screen by screen.

## 8. What I need from Dee

1. **Approve the shape** in §2 and §3.
2. **Businesses**: should a client's companies live on the client (recommended)
   or stay funding-only?
3. **One login for both portals** — confirm (recommended: yes; it is the point).
4. **The `needs_review` screen**: who resolves possible duplicates — the
   organization's admin (recommended) or BES?
5. **Order**: this before the DIY build, or after? Recommended **before**: DIY
   consumers converting into clients should convert into *this* record, not
   into a CreditOps-only one.
