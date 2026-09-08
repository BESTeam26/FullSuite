# What I need from you — one list

**Updated 2026-09-08.** Everything I can finish without you, I am finishing.
This is the short list of things only you can provide or decide. Each item
names the thing it unblocks.

---

## 0. One security item, first

### 0.1 🔴 Plaintext passwords are sitting in ClickUp

While preparing the partner import I read the **BES HQ ▸ Partners Database**
task descriptions. Several of them are access lists holding **passwords in
plain text** — DisputeFox, LetterStream, Gmail, GoHighLevel, Zapier, Credit
Repair Cloud, and a phone system — for partners including Credit Cure, Credit
by Nainoa, Mikia Edwards, ZackCredit and Kenneth Winfield. Some are shared
BES team logins, so one leak is not one partner.

I have not copied a single one of them anywhere: not into the database, not
into a file, not into a commit, and not into this document. The importer is
built so it *cannot* — `scrubCredentials` withholds every credential-shaped
line and records only which platform it belonged to
(`src/lib/migration/clickup-partners.ts`, 22 tests).

**What only you can do:**

1. Rotate the credentials that are shared BES logins (the LetterStream team
   accounts and the `accounts@dispute-me.com` mailbox are the widest).
2. Move them into a password manager, then delete them from the ClickUp tasks.
3. Tell me which manager you use, if you want the partner record to link to
   the right vault entry rather than just flag that one exists.

Anyone with guest access to that ClickUp list can read all of it today. One of
those very tasks opens with "Do not store passwords in plain text / Use
password manager or encrypted vault only", and then stores three.

---

## A. Keys and accounts (paste them once, several features come alive)

| # | What | Where it goes | What it turns on |
|---|---|---|---|
| A1 | ~~Anthropic API key~~ | done | The assistant, report reading, letter help. A **live smoke test is still outstanding** — I have not spent your credits without asking. Say the word and I will run one. |
| A2 | ~~Resend API key + verified domain~~ | done | Invitation and welcome email. |
| A2b | ~~Resend SMTP into Supabase Auth~~ | done | Sign-up confirmation and password reset. |
| A3 | ~~Authorize.Net~~ | done | Paid sign-up, plan changes. |
| A4 | ~~GHL agency credential~~ | done | Locations discovered; won opportunities flow in. |
| **A5** | **Google Workspace OAuth client** (client id + secret, Calendar + Meet scopes) | `npx supabase secrets set GOOGLE_OAUTH_CLIENT_ID=… GOOGLE_OAUTH_CLIENT_SECRET=…` | **Google Meet links on a scheduled meeting.** The whole model is built; the provider reads **NOT CONNECTED** and will keep saying so rather than pretending. |
| **A6** | **Zoom OAuth app** (client id + secret, Server-to-Server or a Marketplace app) | `npx supabase secrets set ZOOM_CLIENT_ID=… ZOOM_CLIENT_SECRET=…` | **Zoom meetings from inside BES.** Same state as A5. A Zoom `start_url` is a bearer credential, so it is never stored, never posted into a channel and never shown to participants. |
| **A7** | **Lob API key** | `npx supabase secrets set LOB_API_KEY=…` | Letters actually posted rather than queued. |

Run every `supabase` command from `creditverse-platform`.

---

## B. Material only you have

| # | What | Why |
|---|---|---|
| B1 | **3–5 real credit report PDFs per monitoring service** you use (IdentityIQ, SmartCredit, MyScoreIQ, annualcreditreport.com, bureau direct). Test-account reports are ideal; otherwise redact name, SSN and address. | The parser reads generic layouts today. Real samples are the only way to make it read *your* services accurately. |
| B2 | **A scan or phone photo of a report** | To measure the assistant against a real scan, not a clean render. |
| B3 | **Your real lender list** with programs and the policy you last verified | Program Fit is only as good as the stored policy. |
| B4 | **Your letter templates**, if you want yours instead of the built-in library | The Letter Library ships with defaults; yours replace them. |
| **B5** | **The March 2026 revenue tracker** (export the Google Sheet, or share it) | **This blocks the financial half of the partner import.** The tracker is authoritative for money — rates, frequency, FX, expected and actual collection. ClickUp holds an MRR field that is mostly empty, so importing from ClickUp alone would write commercial terms from the losing source. The ClickUp half is mapped, tested and ready. |
| **B6** | **Verified work email addresses** for Daniel, Dan, Julius, Alvaro, Ally, Rowell, Laz and Angelo | **21 seats exist in the org chart; 19 are vacant** and each is tagged `INVITE EMAIL REQUIRED`. I will not invent an address, and I will not send an invitation without you saying so. |

---

## C. Decisions (a yes/no is enough)

| # | Decision | My recommendation |
|---|---|---|
| C1 | ~~The Client becomes an organization asset~~ | approved and built |
| C2 | **DIY Credit** build — `ARCHITECTURE_PROPOSAL_DIY_CREDIT.md` | Approve when you want it; C1 is done, so it is unblocked. |
| C4 | ~~Channels~~ | approved and built |
| C5 | **Do lenders log in** to a portal, or receive submission packages by email? | Email packages first; a lender portal is a bigger tenancy change. |
| C7 | **E-signature provider** — Dropbox Sign, DocuSign or SignWell | SignWell is the cheapest to start. |
| **C11** | **The Professional Messaging Guard's term list.** It ships with unprofessional and abusive phrasing and **deliberately no slurs.** Adding them is a policy call, not a technical one: an added term behaves identically, so it is one row in Settings → Communication either way. | Say whether you want them added, and whether the guard should *warn* or *refuse*. It refuses today. |
| **C12** | **Confirm the top of the org chart.** I created **CEO = you** and **CFO vacant, you acting**, from the worked example in your own brief. | Confirm or correct. Everything below it hangs off these two rows. |
| **C13** | **The partner import.** The ClickUp half is mapped and tested; the dry-run report needs B5 to be complete and honest. `PARTNER_DATA_MIGRATION.md` §11 says you review the reconciliation before anything is written — I have kept to that. | Send B5, then approve the report. **23 partners would be created and 2 reconciled** (`Wavy One Solutions` → your existing `Quentin Grays`, and `Blue Chip Equity` → `Kevin Hernandez`). |
| **C14** | **Pilot invitations.** Who receives one, and your explicit go-ahead to send. | I will not email your team on my own. |

### Money, when you are ready

Recorded so it is not lost: you said invoicing and bookkeeping are not a
priority and that GHL already invoices. The eventual need is **recording
revenue and expenses** rather than a second invoicing tool. BES Finance now
does the operating half of that — fixed MRR, variable recurring, expected,
invoiced, collected, outstanding, overdue, expenses and net cash, per month.
Not accounting: no accruals, no depreciation, no tax.

---

## D. Things worth looking at, not deciding

- **Sign in as an organization user to see what your customers see.** BES
  staff are deliberately *not* members of a customer organization, so hub
  switches, department controls, company files and the announcement composer
  are hidden for BES — the database refuses those writes. Use
  `org.owner@bes.test` on Lakeside to exercise them.
- **Settings → Access preview** (owners, and anyone you grant
  `access.preview_as_user`). Pick a colleague and see their menu, their
  routes, and *why* they can reach a partner — the Access Inspector reads the
  same database functions the application does, so it cannot drift into a
  second opinion.
- **Settings → Portals** now lists the six outside-facing sign-ins and says
  which three are open. It used to show five switches that switched nothing.
- **Settings → Workflow Rules** lists what the platform does on its own —
  five real database rules, and the one that is not built, marked as such.

---

## E. What is running without you

Since the last list: Communication (channels, threads, reactions, pins,
attachments, @-mentions with autocomplete, edit history, realtime delivery,
the Professional Messaging Guard, default channels, announcements as
references rather than copies); Positions and the org chart; View As User with
the Access Inspector; the CreditOps handoff fix and your locked credit-status
list; and **operational notifications** — assignment, handoff, mention, direct
message, announcement and attention now all reach the person they concern.

Also fixed on the way: an @-mention in a BES channel was writing a
notification **nobody could read**, because it was stamped with the wrong
visibility. The bell never rang and nothing logged an error. That is why
announcements were not reaching your other user.

Verified, not assumed: **1,321 unit tests**, and the full row-level-security
matrix across **64 phases**. Numbers for the current run are in the report
that follows this list.

### Still moving without you

Owner Home and Attention polish, the remaining audits (Calendar, Files,
Knowledge, EOD, Production), global search isolation checks, role persona
tests, and the deploy smoke test.
