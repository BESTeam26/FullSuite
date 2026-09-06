# Architecture proposal — DIY Credit (white-label consumer system)

**Status: PROPOSAL. Nothing here is built.** Written 2026-09-05 for Dee's
approval, following `PLATFORM_COMPLETION_PLAN.md` §A.2. It adds a new kind of
user to the tenancy model, so it must be agreed before a migration exists
(rule 16, rule 12).

## 1. What exists (FACT)

- Consumer portal screens (`/diy`, `/diy-consumer`): Home, My Credit, Confirm
  the facts (truth gate), My Plan, Issues, Evidence, Documents, My Progress,
  Education, Help. Management screens (`/app/diy-management`): Overview,
  Consumers, Invitations, Plans & Pricing (Free, One-Time, Monthly, Included,
  Invite Only), Branding (program name, colours, preview), Conversions.
- All of it is interface only, labelled "Sample content". No DIY tables, no
  consumer sign-in, no data path.
- One anticipation in the schema: `credit_reports.consumer_user_id` (a report
  owned by a consumer, always inside an organization —
  `credit_reports_consumer_has_org`).
- A working pattern for a non-member portal user: the funding **borrower**
  (`funding_clients.portal_user_id`, `is_borrower_of_file()`, a narrow view,
  borrower branches on `files` and storage — 0066/0068).
- The engines the consumer needs already exist and are pure: classification,
  analysis, Credit Reporting Integrity, Letter Library and builder, report
  changes between imports, score simulator.
- Clients already carry a lead source "BES DIY Credit", which tells me BES
  itself runs a DIY program.

## 2. Doctrine (what must stay true)

1. **A consumer is not a team member.** They never get an
   `organization_members` row, a role, or a permission key. Their access is
   "my own records inside the program that invited me", nothing else.
2. **The organization owns the consumer relationship.** BES sees a
   customer's consumers only under an engagement (`bes_may_fulfil(org, null,
   'diyCredit')`), exactly like CreditOps clients.
3. **White label = the organization's brand on the consumer surface.** It
   does not create an agency or a reseller (rule 16).
4. **One canonical person.** When a consumer becomes a full-service client
   the record is converted, never copied (provenance `diy_converted`).
5. **The engines decide nothing new for consumers.** The same deterministic
   code runs; the consumer confirms facts and chooses actions. AI explains
   only.
6. **Consumers act for themselves.** They print and mail their own letters
   (Reg V §1022.43 does not apply: they are not a credit repair organization
   acting on someone's behalf). A pay-to-mail option comes with the mail vendor.

## 3. Data model (PROPOSAL)

| Table | Purpose | Key columns |
|---|---|---|
| `diy_programs` | One per organization: the white-label program | `organization_id` (unique), `name`, `slug` (unique, for `/diy/:slug`), `branding jsonb`, `support_email`, `enabled`, `default_plan_id` |
| `diy_plans` | Plans an organization offers | `organization_id`, `label`, `kind` (`free`,`one_time`,`monthly`,`included`,`invite_only`), `price_cents`, `entitlements jsonb` (letters per month, simulator, education), `active`, `sort` |
| `diy_consumers` | The consumer inside a program | `id`, `public_id` (`DIY-XXXXXX`), `organization_id`, `user_id → profiles` (unique), `plan_id`, `status` (`invited`,`active`,`paused`,`converted`,`closed`), `invited_by`, `converted_client_id → fulfillment_clients`, timestamps |
| `diy_invitations` | Invitation links | `token`, `organization_id`, `email`, `plan_id`, `expires_at`, `accepted_at`, `invited_by` |
| `diy_item_confirmations` | The truth gate: what the consumer says about each item | `consumer_id`, `report_item_id`, `verdict` (`accurate`,`inaccurate`,`not_mine`,`unsure`), `note`, `confirmed_at` (append-only, latest wins) |
| `knowledge_articles` | Education content (shared with the organization Knowledge Base, see plan §A.4 O1) | `organization_id` nullable (BES-authored when null), `audience` (`organization`,`consumer`,`both`), `title`, `body`, `published_at` |

**Reused, not duplicated**
- Reports: `credit_reports` with `consumer_user_id` — no new table.
- Disputes: `letter_rounds` / `letters` gain `diy_consumer_id` with the same
  XOR rule as reports (exactly one of client / consumer). The Letter Library
  used is the **organization's** library; the consumer picks from letters the
  organization has marked `consumer_visible`.
- Evidence and documents: `files` gains a consumer branch (owner = consumer),
  the way 0066 added the borrower branch. Storage policies follow.
- Progress: `report_item_changes` between the consumer's imports; outcomes are
  derived only (no manual outcomes for consumers).
- Conversion: `convert_diy_consumer(consumer_id, …)` creates the
  `fulfillment_client`, re-points the consumer's reports, rounds and files to
  the client in one transaction, sets `status = converted`, and writes the
  audit row with previous and new owner. Nothing is copied.

**BES's own DIY program.** Doctrine says BES HQ is not an organization. To keep
one model, BES's consumer program runs under a BES-owned organization row
("Blessed Empire Services — DIY"), entitled to `diyCredit`. Decision for Dee
(§7.4).

## 4. Authorization (PROPOSAL)

New helpers, `SECURITY DEFINER`, revoked from `anon` and `PUBLIC` (0003/0004 lesson):

```
diy_consumer_id()                 → the caller's diy_consumers.id, or null
is_diy_consumer_of(org)           → caller is an active/paused consumer of org
program_visible(org)              → is_org_member(org) with 'diy.manage'
                                    OR bes_may_fulfil(org, null, 'diyCredit')
```

Chain, in order (rule 16): authenticated → consumer row exists → status
active/paused → own rows only. Organization side: membership → role →
permission `diy.manage` / `diy.branding` (two new `permission_keys` rows,
module "DIY Credit") → entitlement `diyCredit` → program.

RLS, per table:

| Table | Consumer | Organization member | BES |
|---|---|---|---|
| `diy_programs` | select own program (via consumer row) | select if member; update with `diy.branding` | select under engagement |
| `diy_plans` | select active plans of own program | manage with `diy.manage` | select under engagement |
| `diy_consumers` | select own row; update own contact fields | select/manage with `diy.manage` | select under engagement |
| `diy_invitations` | none (accepted through a `SECURITY DEFINER` function by token) | manage with `diy.manage` | none |
| `diy_item_confirmations` | insert/select own | select with `diy.manage` | select under engagement |
| `credit_reports`, `report_items` | own (`consumer_user_id = auth.uid()`) | with `creditops.clients.view` **and** `diy.manage` | under engagement |
| `letter_rounds`, `letters` | own consumer rows | `diy.manage` | under engagement |
| `files` | own (consumer branch) | `diy.manage` | under engagement |

Writers are functions with explicit checks: `accept_diy_invitation(token)`,
`create_diy_consumer_report(...)` (wraps `create_credit_report` with the
consumer as owner), `confirm_report_item(...)`, `start_consumer_round(...)`,
`convert_diy_consumer(...)`. The public sign-up (§5) runs through
`sign_up_diy_consumer(slug, plan)` and creates nothing until payment or a free
plan clears.

**Frontend visibility is not security.** The consumer shell renders only
consumer routes; every query above still denies anything else.

## 5. Routing and white label

- `/diy/:slug` — public landing, sign-in and (for free / paid plans) sign-up
  under the program's branding, read from `diy_programs` by slug (anon-readable
  view with only `name, slug, branding, plan labels/prices`).
- `/diy/:slug/app/*` — the consumer portal (existing screens, live data).
- `/app/diy-management` — the organization's management screens, gated by
  entitlement `diyCredit` + `diy.manage`.
- Custom domains (`program_domains`: hostname → program) — phase D; needs a
  hosting rule and certificate automation, decision later.
- Emails (invitation, receipts) go through `send-invitation`'s provider once
  `MAIL_PROVIDER_API_KEY` is set; the "from" name is the program's.

## 6. Build phases

| Phase | Delivers | Migration | Needs from Dee |
|---|---|---|---|
| **A** | Tables, RLS, permission keys, invitation → consumer sign-in, consumer imports (CSV + PDF, same parsers), My Credit, Confirm the facts, Home with real figures; management Consumers + Invitations | 0072 | Approval of this document |
| **B** | Consumer disputes on the organization's letters (`consumer_visible`), Evidence/Documents upload, My Progress from report changes, Issues from Integrity findings | 0073 | Nothing |
| **C** | Plans & Pricing live, public sign-up, Conversions (`convert_diy_consumer`), Overview figures | 0074 | Authorize.Net public client key + plan prices |
| **D** | Education content (`knowledge_articles`), custom domains, pay-to-mail | 0075 | Mail vendor, domain hosting decision |

Each phase ends with the usual gates and new RLS matrix phases (31–34):
consumer cannot read another consumer or any organization record; a member
without `diy.manage` cannot read consumers; BES staff without an engagement
cannot read a program; cross-organization reads return nothing; the anon slug
view exposes only branding and plan labels.

## 7. Decisions for Dee

1. **Approve the model** in §3–§4 (a consumer is a portal user, not a member).
2. **Plans**: keep the five kinds already drawn (Free, One-Time, Monthly,
   Included, Invite Only)? Any per-plan limits (letters per month)?
3. **Letters**: consumers use the organization's library, filtered by a
   `consumer_visible` flag — or a separate consumer set?
4. **BES's own DIY**: run it as a BES-owned organization row (recommended,
   one model) — yes/no.
5. **Scanned reports from consumers** need the OCR decision from the plan (§B).
6. **Naming on the consumer surface**: the program name only; "BES" appears
   nowhere unless the program is BES's own.
