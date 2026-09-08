# What I need from you — one list

**Updated 2026-09-08.** Everything I can finish without you, I am finishing.
This is the short list of things only you can provide or decide. Each item
names the thing it unblocks.

---

## How to send me each of these

**Three channels, and which one to use.**

| Channel | Use it for | How |
|---|---|---|
| **Paste a Google Drive link in chat** | Spreadsheets, documents, PDFs, exports | Just paste the link. I read it through your Drive connector, so it does **not** need to be shared publicly — the build tracker's link returned "401 unauthorized" to an anonymous fetch and came through the connector fine. Anything you send this way is committed to the repository **verbatim, before I read anything out of it.** |
| **Type it in chat** | Lists, names, email addresses, yes/no answers, decisions | Plain text is fine. No formatting needed. |
| **Run one command yourself** | **API keys and secrets only** | I never ask you to paste a key into chat, and I never put one in a file. You run the command; the key goes straight to Supabase and I never see it. |

**Never paste an API key, password or token into this chat.** If you do, treat
it as compromised and rotate it — a chat transcript is not a secret store.

---

### The exact list

#### Run these yourself in Terminal — one line each

Open Terminal, then:

```bash
cd /Users/dee_gallardo/BES-Platform/creditverse-platform
```

**A5 — Google Meet.** Google Cloud Console → APIs & Services → Credentials →
Create OAuth client ID → Web application. Enable the Google Calendar API. Then:

```bash
npx supabase secrets set GOOGLE_OAUTH_CLIENT_ID=paste-id-here GOOGLE_OAUTH_CLIENT_SECRET=paste-secret-here
```

**A6 — Zoom.** Zoom App Marketplace → Develop → Build App → Server-to-Server
OAuth. Then:

```bash
npx supabase secrets set ZOOM_ACCOUNT_ID=paste-here ZOOM_CLIENT_ID=paste-here ZOOM_CLIENT_SECRET=paste-here
```

**A7 — Lob (posted letters).** Lob dashboard → Settings → API Keys → the LIVE
secret key. Then:

```bash
npx supabase secrets set LOB_API_KEY=paste-here
```

Tell me when each is done and I will run a connection test and report what it
says. Until then each provider reads **NOT CONNECTED** rather than pretending.

#### Paste a Drive link in chat

| # | What | Note |
|---|---|---|
| **B5** | **The March 2026 revenue tracker** | The Google Sheet with rates, frequency, FX, expected and actual collection. Same as the build tracker — paste the link, I pull it through the connector. This unblocks the **financial half of the partner import**; the ClickUp half is already mapped and tested. |
| **B7** | **The Metro 2 defect catalogue, Sections B–P** | Roughly 293 defects. A Drive link, a Doc, or a paste — whichever you have. It goes into the repo verbatim first, because this is the document that was lost once. It unblocks the largest remaining CreditOps item. |
| B1 | **3–5 real credit report PDFs per monitoring service** | IdentityIQ, SmartCredit, MyScoreIQ, annualcreditreport.com, bureau direct. Test-account reports are ideal; otherwise redact name, SSN and address. **Do not send a real consumer's report.** |
| B2 | **A scan or phone photo of a report** | To measure the assistant against a real scan rather than a clean render. |
| B3 | **Your real lender list** | Programs, and the policy you last verified. |
| B4 | **Your letter templates** | Only if you want yours instead of the built-in library. |

#### Type in chat

**B6 — the eight people.** One per line, in this shape. I need a real work
address per person; I will not invent one, and I will not send an invitation
until you say so separately.

```
Daniel  — daniel@yourdomain.com  — Dispute Manager
Dan     — dan@yourdomain.com     — Account Manager, Disputes
Julius  — …
Alvaro  — …
Ally    — …
Rowell  — …
Laz     — …
Angelo  — …
```

**The decisions.** A yes/no or a short answer is enough:

| # | The question | If you say nothing |
|---|---|---|
| **C11** | Should the Professional Messaging Guard include slurs, and should it **warn** or **refuse**? | It refuses, and ships no slurs — a policy call I will not make for you. |
| **C12** | Confirm **CEO = you** and **CFO vacant, you acting**. | Stays as I created it from your own brief. |
| **C13** | Approve the partner import once B5 arrives. **23 partners created, 2 reconciled** (`Wavy One Solutions` → your existing `Quentin Grays`, `Blue Chip Equity` → `Kevin Hernandez`). | Nothing is imported. |
| **C14** | **Pilot invitations** — who receives one, and your go-ahead to send. | No email goes to anybody. |
| **C15** | A BES announcement to every customer reaches a customer who switched their Announcements module **off**, and the link then says "not switched on". Skip them, or stop gating the page for BES announcements? | Unchanged; recorded, not fixed. |
| **C16** | **Borrower-portal hardening.** One `WHERE` clause limits a borrower to their own funding files, with no policy underneath it. My recommendation: replace the view with a column-limited function — half a day, nothing is broken now. | Unchanged. |
| C2 | **DIY Credit** build — approve when you want it. | Not started. |
| C5 | Do **lenders log in**, or receive submission packages by email? | Email packages assumed. |
| C7 | **E-signature provider** — Dropbox Sign, DocuSign or SignWell. | None connected. |

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
| **B8** | **`BES_GHL_Full_Infrastructure_Build_Tracker.xlsx`** — the 140-row master build workbook | **The one thing blocking BES CRM from being finished.** Everything else in your streamlined brief is buildable without it and is being built: engines, versioned templates, composable projects, dependency graph, parallel streams, auto-start, derived progress and health, multi-handoff, QA automation, client requirements, blockers, production and EOD. What needs the file is the **build standard itself** — which requirements exist, which engine each belongs to, which Work Unit it sits under, and whether it is a checklist action, an acceptance criterion, a QA check, a prerequisite, a client requirement, an automation rule or a reference. I will not invent 140 requirements; a guessed build standard is worse than none. Send the file (or export it to CSV) and it goes into the repo verbatim first. Until then the seeded Website / Sales / Fulfillment templates are the examples from **your own brief**, labelled provisional rather than presented as the BES standard. |
| **B7** | **The Metro 2 defect catalogue — Sections B through P** (the document you pasted into chat once) | **The largest single remaining CreditOps item: roughly 293 defects.** Section A is built and tested; B–P cannot be written, because the rules ARE the document and inventing them would put a guessed compliance claim into a dispute letter. It was lost once by being read out of chat instead of committed — anything you send now goes into the repository verbatim before I use it. |

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
| **C16** | **The borrower portal's file list rests on one line.** `borrower_funding_files` is a view that runs as its owner, so the only thing limiting a borrower to their own files is the view's own `where portal_user_id = auth.uid()`. It is correct today. It has no policy underneath it, so an edit that weakened that line would not be caught — and this project has had exactly that happen to a view once before. | Making it belt-and-braces means giving `funding_clients` a borrower policy first, and that would let a borrower read their whole row rather than the seven fields the view exposes. **My recommendation: replace the view with a column-limited function**, which keeps the surface exactly as it is today and puts the check somewhere a test can hold it. Half a day. Nothing is broken now, so this is a hardening decision, not a fix. |
| **C15** | **A small one, found while wiring notifications.** When BES announces something to *every* customer, a customer whose organization has deliberately switched the Announcements module OFF now gets a notification about it — and the page it links to says "Announcements is not switched on". Announcements is part of Hub Core and is on by default, so this needs somebody to have turned it off on purpose. | **My recommendation: do not tell somebody about a page they turned off** — the notifier simply skips them, which is one condition in `announcement_notifiable`. The alternative reading is that a BES platform notice is not a module a customer opts out of, in which case the page stops being module-gated for BES-authored announcements. Both are defensible; it is your product call, so I changed nothing. |

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

**Two things were broken and are now fixed, and together they explain what
you reported.** An @-mention in a BES channel wrote a notification *nobody
could read* — it was stamped with the wrong visibility, so the bell never rang
and nothing logged an error. And the Notifications page itself was still
flagged "not ready", which means the route guard refused it for everyone: the
bell and the sidebar badge both led to "Notifications is not available yet" on
a page full of real rows.

Also done: conversations are searchable from the top bar; the Settings screens
that showed switches which switched nothing now state facts instead; a dead
screen that was the only page in the product with no access guard is archived;
two mobile drawers no longer put an invisible button in the keyboard tab
order; and the authorization map is generated from the database now rather
than hand-maintained, because the hand-written one was verified at migration
21 while the database had reached 219 — and still labelled every line FACT.

Verified, not assumed: **1,341 unit tests**, the full row-level-security
matrix across **64 phases**, and the deploy checked by reading what the served
files actually contain.

### Still moving without you

The remaining Calendar / Files / Knowledge / EOD / Production audit passes,
and the second mobile polish pass. Everything else on the agency programme is
either done or waiting on an item above.
