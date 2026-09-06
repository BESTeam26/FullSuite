# Architecture proposal — CreditOps client portal

**Status: PROPOSAL, now dependent on `ARCHITECTURE_PROPOSAL_CLIENT_RECORD.md`.**
Dee asked (2026-09-05) that the client become an organization-level asset
holding identity, login and documents. Build that first: this portal then uses
the client's single login instead of adding a second identity model, and §3 of
this document (a `portal_user_id` on `fulfillment_clients`) is replaced by
`clients.portal_user_id`. The screens in §4 are unaffected.

**Nothing here is built.** Written 2026-09-05 for Dee's
approval (PLATFORM_COMPLETION_PLAN.md §A.1, C5). It gives a credit repair
client a sign-in of their own, so it must be agreed before a migration exists.

## 1. What exists (FACT)

- Funding already has this exact shape for borrowers: `funding_clients.portal_user_id`,
  `is_borrower_of_file()`, a narrow `borrower_funding_files` view, borrower
  branches on `files` and storage, an invitation path, and the `/portal/funding`
  screen with document requests and uploads (0066/0068).
- Credit clients (`fulfillment_clients`) have no portal user. The `/portal`
  screen is a labelled preview.
- Everything a client would read already exists as records: their reports and
  scores, dispute rounds and letters with statutory clocks, round outcomes,
  report changes, activity marked shareable.

## 2. Doctrine

1. A client is a **portal user**, not a member: no role, no permission keys,
   no organization data beyond their own file.
2. The organization owns the relationship; BES sees the client's portal
   activity only under the CreditOps engagement.
3. The portal shows **what the organization chooses to share**. Internal
   notes, QA, production and pricing never appear (visibility taxonomy
   already exists on activity: shared vs internal).
4. Uploads from the client land in `files` under the client's scope and wait
   for the team's review, like borrower documents.
5. Plain wording for consumers; dates as plain dates; no legal conclusions
   ("potential inaccuracy", never "violation").

## 3. Data model (PROPOSAL)

| Change | Purpose |
|---|---|
| `fulfillment_clients.portal_user_id uuid references profiles` (nullable, unique) | The client's sign-in, mirroring `funding_clients.portal_user_id` |
| `is_client_of(fulfillment_client_id)` | `SECURITY DEFINER` helper: caller is that client's portal user |
| `client_portal_files` view | The client's own record with the fields a client may see: status label, round, next step, letters sent (date, bureau, response due), scores over time |
| `client_document_requests` | What the team asks the client to send (ID, proof of address, statements), with status |
| Policies | `credit_reports`, `report_items`, `letters`, `letter_rounds`, `client_round_outcomes`, `report_item_changes`, `files`, storage: a client branch `is_client_of(...)` for **select**; `files` + storage **insert** for uploads only |
| Invitation | Reuse the borrower invitation function with a `client` kind; email through `send-invitation` |
| Audit | `client_portal.invited`, `client_portal.upload` via `log_audit` |

Nothing is copied: the portal reads the same canonical rows the team works.

## 4. Portal screens (reuse the borrower shell)

- **Home**: where the file stands (status in plain words, current round, what
  we are waiting on), next expected date.
- **My reports**: scores by bureau over time, the imported items marked
  disputed / resolved / verified — the team's outcomes, not the client's guesses.
- **Letters**: each letter sent (date, bureau, what it disputes), response
  window, result when recorded.
- **Documents**: requests from the team with upload; the client's uploads and
  whether each was accepted.
- **Messages**: comments the team marked shared; the client can reply (a
  comment with visibility `shared`).
- **Agreement**: the signed agreement and disclosures (read-only; e-sign later).

## 5. Build phases

| Phase | Delivers | Migration | Needs from Dee |
|---|---|---|---|
| A | Column, helper, view, select policies, invitation, Home + My reports + Letters | 0073 | Approval |
| B | Document requests, uploads, Messages | 0074 | Nothing |
| C | Agreement view, e-signature | — | E-sign provider (plan §D.10) |

RLS matrix phase 32: a client sees only their own rows; a client of another
organization sees nothing; a client cannot read internal comments; BES staff
without engagement see nothing; anon nothing.

## 6. Decisions for Dee

1. Approve the model (client = portal user on the existing client record).
2. Which of the six screens are in phase A (recommended: Home, My reports, Letters).
3. Whether clients may reply in Messages or only read (recommended: reply).
4. Whether the portal carries the organization's branding only (recommended yes; "BES" never appears unless the client belongs to BES's own program).
