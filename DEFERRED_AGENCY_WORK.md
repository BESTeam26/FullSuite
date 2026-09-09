
## D-005 · Document Builder with e-signature (DocuSign-style)

**Recorded 2026-09-09 (Dee's directive). VALID approved product direction;
NOT started — it is D-004's engine plus a signature workflow, and Dee's own
change-control rule says plan and document rather than open a second epic
mid-sprint. Activating it is one sentence.**

**What Dee asked for, verbatim in intent:** create documents in Settings with
**folders** (Partner documents, Agent documents, Credit-repair documents,
proposals, agreements, anything else), containing **custom values / merge
fields** and a **SIGNATURE field** plus the **date they signed**; then select
a document on a person or partner, and an email goes out asking them to sign
— "just like DocuSign or GHL Documents".

**What already exists and must be reused, not rebuilt:**
- `member_documents` (0273) — the per-person signature lifecycle (draft →
  pending_signature → signed/acknowledged → expired/superseded/archived), the
  `people.documents.manage` capability, files-row and storage-byte gating, and
  the audit onto the person's history. The builder FILLS this, it does not
  replace it.
- The partner file model (`files` + `shared_with_partner` +
  `set_partner_file_shared`) for the partner-facing half.
- `send-invitation`'s branded mailer and the `invitations` token pattern — a
  signature request is the same shape: a tokenised link, valid for a window,
  usable only by the addressee.
- D-004's renderer, registry and custom values — the merge fields ARE that
  system; building a second placeholder dialect here is the thing to avoid.

**The new pieces, when activated:**
1. `document_folders` (name, kind, parent) and `document_templates` (folder,
   name, body, version, status, created_by) — templates are versioned and a
   v2 never rewrites a v1 already sent.
2. A field model: merge fields (resolved at generation) versus **signature
   fields** and **date-signed fields** (filled by the signer, positioned in
   the body).
3. `document_signature_requests`: document, signer (a member, a partner
   contact, or a client), tokenised link, sent/opened/signed timestamps, IP
   and user-agent captured at signature, and the **rendered snapshot** taken
   at generation.
4. A signing surface at `/sign/:token` — outside the app shell, no account
   required, the addressee's email verified the way partner invitations are.
5. Completion writes back: the signed PDF/HTML into `files`, the
   `member_documents` row to `signed` with its date, the audit event.

**The rule that must not be lost:** once signed, the content NEVER changes
because a custom value, a rate, an address or a contact was edited later. The
snapshot is the document. This is the same immutability D-004 records for
agreements, and it is why the builder cannot simply re-render on read.

**Why deferred.** It is a full epic — folders, an editor, a field placer, a
public signing surface, e-signature evidence and a template library — and the
current P0 (Invite Users, CreditOps, EOD, Timer, BES CRM) does not depend on
it. Uploading and tracking already-signed documents works today on the Team
Member profile, which covers the operational need until this is built.
