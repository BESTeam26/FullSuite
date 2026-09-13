# Partner Portal

The Partner's own view of their work with BES. **Multi-page**, routed at
`/partner/*` from `src/pages/portal/PartnerPortal.tsx`.

**Status: feature-complete for validation. Feature expansion is STOPPED.** No
new portal modules until Dee reports a live-use defect.

## Information hierarchy

Dee's order, exactly. `src/lib/portal/portal-nav.ts` is the single source, with
10 tests including one asserting that the words "credit", "invoice" and
"payment" never appear in the main menu — they belong **inside** Billing.

| # | Page | Path | Survives suspension |
|---|---|---|---|
| 1 | Overview | `/partner` | **yes** |
| 2 | **Clients** | `/partner/clients` | no |
| 3 | Projects & Services | `/partner/services` | no |
| 4 | Actions Needed | `/partner/actions` | **yes** |
| 5 | Messages | `/partner/messages` | **yes** |
| 6 | **Billing** | `/partner/billing` | **yes** |
| 7 | Agreements | `/partner/agreements` | **yes** |
| 8 | Files | `/partner/files` | no |
| 9 | Referrals | `/partner/referrals` | conditional — see below |
| 10 | Updates | `/partner/updates` | **yes** |
| 11 | Account Settings | `/partner/settings` | **yes** |

**Clients comes before Billing.** Invoices, Payments, Account Credit and
Processing Credits all live **inside** Billing as tabs — never in the main menu.

**Conditional pages:** Agreements appears once there is a history to read.
Referrals appears only when the partner has referrals. **Referrals is not yet
modelled as a product** — the nav slot and conditional exist; the referral
attribution and commission ledger are documented as future work (D-006 in
`DEFERRED_AGENCY_WORK.md`), and the route currently redirects to Overview.

**Suspension REMOVES pages rather than disabling them.** A greyed link says "you
are not allowed this", which is true and useless; a shorter menu plus a banner
on Overview says what to do about it. Direct URL access to a removed page is
**refused by the data layer**, not merely unrouted.

## Partner-safe projections

Every portal read goes through a `SECURITY DEFINER` function gated by
`partner_group_of_user()`, returning a **whitelist** of columns.

| Function | Serves |
|---|---|
| `my_partner_portal_summary()` | the shell: nav counts, unread, balance, flags |
| `my_partner_clients(include_closed)` | the Clients page |
| `my_partner_client(public_id)` | Client detail |
| `my_partner_services()` | Projects & Services, and Messages' channel relevance |
| `my_partner_projects()` / `my_partner_requirements()` | BES CRM builds |
| `my_partner_agreements()` | Agreements |
| `my_partner_announcements(limit)` | Updates |
| `my_partner_team()` | who they may DM |
| `partner_topic_channel(group, topic)` / `partner_direct_channel(group, other)` | starting a conversation |
| `my_partner_review(...)` | answering an approval |

**To extend what a partner sees, change the definer function. Never widen the
underlying RLS.**

## What must NEVER leak

Non-negotiable, and each is a whitelist decision rather than a filter:

- **BES internal notes** — on clients, work, partners, anything
- **Internal assignees** — which BES person is on their file, unless explicitly shared
- **Raw SLA** — deadlines, breach counts, timers
- **Raw audit trail** — `audit_log`, `activity_events` internals
- **Internal files** — anything not explicitly `shared_with_partner`
- **Internal comments** — BES-side discussion on their work
- **Unrelated partner data** — any other partner's anything
- **Internal KPIs, QA, workforce and management data**

Additionally: **never create `portal_clients`, `portal_invoices`,
`portal_projects` or `portal_messages`** to make a page easier. Reuse the
canonical record and add a partner-safe projection.

## The pages

**Clients** — summary buckets and filters (`src/lib/portal/client-filters.ts`,
9 tests), search by name or email, optional closed files. Detail shows status,
round, what BES is doing, last activity, whether the partner owes an action, and
**shared documents as previews**.

**Projects & Services** — one card per **live engagement**, across all five
modules (CreditOps, FundingOps, BES CRM, TalentOps, Sales & Marketing). The card
says what that module can honestly say about progress and nothing more. Shares
the `["portal","services"]` query with Messages.

**Billing** — five summary cards and four tabs: Invoices · Payments · Account
Credit · Processing Credits, plus payment settings. See `docs/BILLING.md`.
**Account Credit is money; Processing Credits are units. They are never summed.**

**Messages** — see `docs/COMMUNICATION.md`. The partner **can start the first
conversation**; before migration 0333 they could not.

**Files** — only what BES deliberately shared, rendered as **previews** rather
than filenames: images as themselves, PDFs showing page one in a sandboxed
frame, text files showing their first lines, anything else an honest icon.

**Actions Needed** — open `partner_action_items`. "You're all caught up" when
there are none. Approving a marketing item moves it to **Approved / Scheduled,
not Completed**.

**Agreements** — `document_instances` and `signature_requests`; signing happens
at the public `/sign/:token` route.

**Account Settings** — their own contact details and their own users.

## Identity

A portal contact is an ordinary auth user bound by a `partner_contacts` row.
That row is the whole boundary, and `partner_group_of_user()` returns NULL for a
suspended contact or a suspended/archived partner, so access ends in one place.

**Do not merge an employee identity with a portal contact identity.**
Specifically: Kaori's employee account (`nkawgall.bes@gmail.com`) and her
Partner Portal contact identity (`kaori@blessedempireservices.com`) are separate
people as far as this system is concerned, and must stay so.
`partner_contacts_user_idx` is unique on `user_id` — one account belongs to one
partner.

**Do not solve a portal problem by creating a fake client record for the
partner**, and do not solve an access problem by hiding UI.
