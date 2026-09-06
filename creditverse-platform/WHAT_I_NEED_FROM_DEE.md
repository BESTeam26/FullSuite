# What I need from you — one list

**Updated 2026-09-05.** Everything I can finish without you, I am finishing.
This is the short list of things only you can provide or decide. Nothing here
blocks the rest of the build; each item unblocks the thing named beside it.

## A. Keys and accounts (paste them once, several features come alive)

| # | What | Where it goes | What it turns on |
|---|---|---|---|
| A1 | **Anthropic API key** | `npx supabase secrets set ANTHROPIC_API_KEY=…` | Reading scanned reports, letter wording help, "explain this fit", plain-language item explanations. **Everything else for these is built and deployed** — the gateway answers "not connected" until this exists. |
| A2 | **Mail provider key + from address** (Resend, Postmark or SendGrid) | `npx supabase secrets set MAIL_PROVIDER_API_KEY=… MAIL_FROM="BES <no-reply@yourdomain>"` | Team invitations by email, and later client and lender emails. Today an invitation link must be copied and sent by hand. |
| A3 | **Authorize.Net public client key** + your plan prices | Settings › Plans (and one migration) | Paid sign-up, plan changes, DIY consumer billing later. |
| A4 | **GHL credentials** — a Private Integration token per location, or a Marketplace app | The CRM bridge | Won opportunities creating clients and funding files here; stage changes flowing back. |

Run all `supabase` commands from `creditverse-platform`.

## B. Material only you have

| # | What | Why |
|---|---|---|
| B1 | **3–5 real credit report PDFs per monitoring service** you actually use (IdentityIQ, SmartCredit, MyScoreIQ, annualcreditreport.com, and any bureau direct). Test-account reports are perfect; otherwise redact name, SSN and address. | The PDF parser reads generic layouts today. Real samples are the only way to make it read *your* services accurately. |
| B2 | **A scanned report or a phone photo of one** | To measure how well the assistant reads a real scan, not a clean render. |
| B3 | **Your real lender list** with programs and the policy you last verified | Program Fit is only as good as the stored policy. |
| B4 | **Your letter templates**, if you want yours rather than the built-in library | The Letter Library ships with defaults; yours replace them. |

## C. Decisions (a yes/no is enough)

| # | Decision | My recommendation |
|---|---|---|
| C1 | **The Client becomes an organization asset** (identity, login, documents at organization level; CreditOps and FundingOps become the engines) — `ARCHITECTURE_PROPOSAL_CLIENT_RECORD.md` | **Do it, and do it before DIY**, so a converted consumer becomes this record. Five reversible steps. |
| C2 | **DIY Credit** build — `ARCHITECTURE_PROPOSAL_DIY_CREDIT.md` | Approve after C1. |
| C3 | **Client portal** — folded into C1 | Approve with C1; it becomes screens, not a new identity model. |
| C4 | **Channels (internal chat)** — `ARCHITECTURE_PROPOSAL_MESSAGING.md`: default private, BES reads only channels you mark shared, only under a live engagement | Approve the default (private) and whether BES staff may post or only read. |
| C5 | **Do lenders log in** to a portal, or receive submission packages by email? | Email packages first; a lender portal is a bigger tenancy change. |
| C6 | **Partner / affiliate commissions**: flat, percentage or tiers, and when earned (submission, funding, or cleared) | Needed before the partner portal is designed. |
| C7 | **Mail vendor for letters** (Lob or Click2Mail) and **e-signature** (Dropbox Sign, DocuSign or SignWell) | Lob and SignWell are the cheapest to start. |
| C8 | **Stale timer cap** — a timer left running overnight is stopped at N hours with a note | 10 hours. |
| C9 | **How long to keep uploaded report PDFs** | Seven years, matching dispute records. It becomes a setting. |
| C10 | **Duplicate clients found during the C1 move**: who resolves them — your organization admins, or BES? | Your admins; it is their data. |

## D. Things you should look at, not decide

- **Sign in as an organization user to see what your customers see.**
  BES staff are deliberately *not* members of a customer organization, so the
  hub switches, department controls, company files and the announcement
  composer are hidden for BES — the database refuses those writes. Use
  `org.owner@bes.test` on Lakeside to exercise them.
- **Settings › Organization Hub** on Cedar shows the upgrade path; on Lakeside
  it shows a full hub. That is the three-layer rule working.
- **The Getting started card** on an organization's Home disappears by itself
  once the seven steps are done.

## E. What is running without you

Built and verified since the plan: PDF report import with a review grid,
scanned-report reading through the assistant, role-scoped navigation and
routes, the Organization Hub (People, Departments, Files, Tools,
Announcements, Knowledge, module switches), personal profiles with photos and
birthdays, birthday greetings, page help, mobile layouts, and the company
intranet. Mentions are in the editor now; their notifications land with the
next migration.

Still moving without you: mention notifications, channel groundwork once C4 is
answered, GHL webhook scaffolding so connecting is only credentials, and the
remaining mobile and polish passes.
