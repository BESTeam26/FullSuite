# Pilot Issue Log — Real BES Operations Pilot

Opened 2026-09-10 on Dee's instruction. **This file is the bug tracker for the
pilot; chat history is not.** Every real issue the BES team reports lands here
first, with its classification, and is closed only by a human.

Release state at pilot start: commit `0ec98a8`, schema through
`20260910000200`, full security gate **1559/1559 (70 phases)** — AUTOMATED
PASS and SECURITY PASS. Every P0 workflow is DEPLOYED and **UNTESTED LIVE**
until a real operator walks it.

## How to use this log

**Classification** (decided first, before any code):
`A PILOT DEFECT` · `B SIMPLE PILOT UX CORRECTION` · `C SECURITY / DATA-INTEGRITY`
· `D NEW FEATURE` · `E ARCHITECTURE CHANGE` · `F DEFERRED IDEA`

A, B (when it materially affects the workflow) and C are fixed now — smallest
canonical cause, tested, deployed. D, E and F go to `DEFERRED_AGENCY_WORK.md`
with enough detail that Dee never has to explain them twice, and the pilot
continues.

**Severity:** `S1` blocks a P0 workflow for a real user · `S2` wrong result or
lost data in a P0 workflow · `S3` friction that slows the workflow · `S4`
cosmetic.

**Status:** `OPEN` → `FIXED AWAITING LIVE RETEST` → `LIVE VERIFIED`, or
`DEFERRED`. A passing test, build or deploy never closes an issue; Dee or the
operator who hit it does.

## Issues

| ID | Date | Reported by | Module | Actual | Expected | Class | Sev | Root cause | Fix commit | Live verified by | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P-006 | 2026-09-11 | Dee | CreditOps / Complete Work | The credit status could only be changed in a separate control, away from the work being finished | Offer it inside Complete Work before submitting — keep the current status, or move to the new stage | B pilot UX correction | S3 — an extra step in the most-used P0 workflow | Design decision from 02xx deliberately removed the selector after an earlier one logged status changes it never wrote | `9fda507` | — | **FIXED AWAITING LIVE RETEST** |
| P-004 | 2026-09-11 | Dee | Access / Finance | Bryan and every agency admin could open **Finance** and **Organization billing**, and read payroll data | Money is the owner's alone, and the owner can switch it on for one person (e.g. a billing specialist) | **C security / data-integrity** | S1 — agency financials exposed to all administrators | `resolve_agency_capability` opened with `role in ('agency_owner','agency_admin') then true`, so an admin resolved TRUE for every capability including money, and no override could take it back | `cae687d` | — | **FIXED AWAITING LIVE RETEST** |
| P-005 | 2026-09-11 | Phase 70 probe, during the pilot | My Time / Timer | One real time entry (Dee's, 2026-09-11) carried the retired division `general`, two days after it was renamed to `admin` | Only the six live divisions are storable | A pilot defect | S2 — splits division totals on My Time, EOD and production reporting | `time_entries.division_id` is TEXT with no constraint, so a browser tab running the pre-rename bundle kept writing the old value | `cae687d` | — | **FIXED AWAITING LIVE RETEST** |
| P-002 | 2026-09-11 | Dee (and Bryan Breva, first real invited user) | Invite Users / Login | After choosing a password, the page looked unchanged — only a small green line appeared inside the still-complete form. Bryan then wandered to `/app` and hit **"No workspace access"** | A clear "we sent you a confirmation email" state that says what to do next | A pilot defect | S1 — the first real invited user believed activation had failed | Sign-up sets a `notice` string rendered as one `text-xs` line between the password field and the button; the form stays fully visible, so nothing reads as progress | `18999b8` | — | **FIXED AWAITING LIVE RETEST** |
| P-003 | 2026-09-11 | Dee | Invite Users / Login | The internal team invitation used generic copy and the platform tagline ("Credit + Funding Operations. One Connected Platform.") | BES's own branding and voice for internal team members, distinct from the partner emails | B pilot UX correction | S3 | The `isTeam` invitation shared a generic branch with customer-organization invites; only the two partner branches carried Dee's verbatim branded copy | `18999b8` | — | **FIXED AWAITING LIVE RETEST** |
| P-001 | 2026-09-10 | Dee | Invite Users / Login | The activation email from `noreply@bescrm.net` landed in Gmail **Spam** | It reaches the inbox so a new team member can activate | A pilot defect | S1 — blocks the Invite Users P0 flow | See below | Partial (`reply_to`); the fix is DNS + `APP_ORIGINS` | — | **OPEN — awaiting Dee's DNS change** |

### P-006 · Credit status now moves as part of finishing the work

Complete Work lost its status selector once, for a good reason recorded in the
file: the old one **logged an activity entry saying the status had changed
while the record stayed put**, and offered four values the enum did not even
have. So it was removed and status became a separate control.

Dee asked for it back. It is back, and it cannot repeat that failure:

- it writes through **`updateClientStatus`** — the same canonical writer the
  dedicated Status control uses — so there is no second write path;
- it offers only **`creditStatusOptionsFor(currentStatus)`**, Dee's locked
  ten-status list, so an impossible value cannot be picked;
- it **logs nothing itself**. The activity entry comes from the database
  trigger on `fulfillment_clients`, so a status entry cannot exist without the
  status change that caused it;
- it **defaults to the status the file already has**, so completing work
  changes nothing unless the operator deliberately moves it;
- **handing off still never changes status** — the matrix probe asserting that
  remains true, because a handoff does not reach this path.

The panel's banner said "Status change is separate"; it now says "The status
below moves only if you move it."

### P-004 · Finance was visible to every agency admin

**The flaw was one line.** `resolve_agency_capability` began:

```sql
when m.role in ('agency_owner', 'agency_admin') then true
```

Every capability, money included, and an override could not claw it back. All
four real BES staff are administrators, so all four could open Finance. The
profile defaults were already correct (`finance.dashboard.view` is `false` for
manager, team lead, agent and custom) — they were simply never consulted for an
admin.

**The rule now.** `permission_keys.owner_gated` marks a capability as money.
For those keys the admin shortcut does not apply:

> allowed = the person is the agency **owner**, or the owner has **explicitly
> granted** it to them.

Gated today: `finance.dashboard.view`, `expenses.view`, `expenses.manage`,
`payroll.view`, `payroll.manage`. It is a column, not a hardcoded list, so
gating another capability later is one `UPDATE`.

**Why this protects data and not just the menu.** Every money table already
asks `agency_can(...)` in its RLS — `payslips`, `payroll_cutoffs`,
`member_pay_rates`, `fx_rates`. Fixing the resolver therefore closes the data
path; the menu change merely stops offering a door that is already locked
(rule 1). Verified live: all three non-owner admins now read **zero** rows from
`member_pay_rates`, and the owner reads them.

**The gate has no handle on the inside.** `set_agency_permission` and
`clear_agency_permission` now refuse a gated key unless the caller is the
owner, so an administrator cannot grant themselves what they were just denied.
The old guard that refused *any* override on an admin was relaxed for gated
keys only — every real BES staff member is an admin, so without that the
feature would be unusable by exactly the people it exists for.

**Also gated:** `/app/billing` (Organization billing), on Dee's follow-up. Both
money surfaces now follow one switch, "Financial dashboard", and both moved
from `access: "admin"` to `access: "user"` so a granted billing specialist
reaches them without being promoted to administrator.

**Found on the way:** `resolve_agency_capability` never checked
`status = 'active'`. Every policy pairs it with `is_staff_of()`, which does
check, so nothing was exposed — but a resolver that answers TRUE for a
deactivated person is a trap for the next caller who forgets the pairing. Now
checked, and probed.

**Probes:** ten in phase 37 — owner holds money, admin does not, admin keeps
everything that is not money, admin cannot READ payslip rows, owner can, a
grant reaches exactly one person and one key, an admin cannot grant or
withdraw money, a granted Agency User gets money without management, and a
deactivated member holds nothing. Two in the menu tests. Phases 37, 48, 67, 70
all green.

**Probes corrected, not fixtures:** eleven payroll and currency probes ran as
an admin and asserted payroll *mechanics*. That assumption is now wrong, so
they run as the owner — the rule changed, so the tests follow the rule. The
refusal probes keep their own subjects, and phase 37 asserts the admin's
refusal explicitly, so none of them passes merely because everybody is denied.

### P-005 · A retired division came back through a stale tab

Phase 70's own probe caught it in production: one entry saying `general`, made
two days after 0283 renamed it to `admin`. `division_id` is TEXT with no
constraint, so a browser tab still running the old bundle kept writing a value
the current interface cannot offer — splitting the division totals for whoever
had that tab open.

Fixed at the database, where a stale client cannot argue: the row was
normalised, a trigger maps `general` → `admin` on the way in (a person's hours
are not the place to lose data over a cache), and a CHECK closes the set to the
six live divisions.

### P-002 · Sign-up gave no visible sign that anything happened

**What actually happened** (from `auth.users` and `invitations`, so this is the
record rather than a reconstruction):

| Time | Event |
|---|---|
| 03:11:35 | Bryan signs up; Supabase sends a confirmation email |
| 03:12:06 | He opens the confirmation link |
| 03:12:21 | Signed in |
| 03:12:22 | Invitation accepted — `agency_user · Manager`, 3 modules, **active** |

So the pipeline worked and **Bryan is a fully active member right now.** The
"No workspace access" screen was the gap between confirming his email and the
acceptance completing, reached because nothing on the sign-up page told him to
go and check his inbox — so he navigated away and landed somewhere that
correctly reported he had no membership *yet*.

**Fixed:** `signUp` now reports whether a confirmation is pending (Supabase
returns a user with no session in that case) instead of discarding it, and the
invitation page replaces the whole form with a "Check your email" panel naming
the address, saying the link brings them straight back and accepts
automatically, mentioning the spam folder, and offering "Back to sign in".

**Not changed:** the "No workspace access" screen itself is telling the truth
for someone genuinely uninvited. Making it detect a pending invitation would be
a new feature; recorded in `DEFERRED_AGENCY_WORK.md` rather than built here.

### P-003 · Internal team invitation was generic

The two partner branches carried Dee's verbatim branded copy; the internal team
invitation fell through to the same neutral branch as a customer
organization's own invite, so it inherited the platform tagline. Internal
invitations now carry their own voice and the brand line **"Freedom isn't
found, it's built with structure."** — the partner emails keep "Beyond
Outsourcing. Your Business Growth Engine.", and a customer organization's
invitation stays neutral in *their* branding, which is correct.

### P-001 · Invitation email delivered to Spam

**Not an authentication failure.** Verified live against DNS:

| Check | Record | Verdict |
|---|---|---|
| DKIM | `resend._domainkey.bescrm.net` — 1024-bit key present | PASS |
| SPF (envelope) | `send.bescrm.net` → `v=spf1 include:dc-fd741b8612._spfm.send.bescrm.net ~all` | PASS |
| Return-Path / bounces | `send.bescrm.net` MX → `feedback-smtp.us-east-1.amazonses.com` | Correct |
| DMARC | `_dmarc.bescrm.net` — `p=quarantine; adkim=r; aspf=r` | Aligns on both, so it PASSES |

So Resend is set up correctly and the message is authenticated. What Gmail is
reacting to, in order of weight:

1. **Sender domain ≠ link domain.** The email comes from `bescrm.net` and the
   activation button points at `https://bes-full-suite.vercel.app/accept-invitation/…`.
   `APP_ORIGINS` is unset in the function environment, so the link falls back to
   the hardcoded Vercel default. A first-contact message from an unknown domain
   sending you to a *different* domain on free hosting, to create a password, is
   the exact shape of a phishing email.
2. **Cold domain.** `bescrm.net` has no transactional sending reputation; this
   is among its first messages.
3. **`noreply@` with no Reply-To.** A sender that cannot be replied to is a
   small negative signal on top of the two above.

**Fixed in code and configured (partial):** `sendEmail` takes an optional
`replyTo`; each mailer passes `MAIL_REPLY_TO` from its own environment, and the
header is omitted when there is none rather than pointed at an address nobody
reads. `MAIL_REPLY_TO` is set to `support@blessedempireservices.com` (Dee,
2026-09-11 — a monitored Gmail inbox); the three mailers were redeployed to
pick it up. This addresses (3) only.

The reply domain differs from the sending domain, which is normal and not a
meaningful spam signal — a real reply path is worth far more than domain
symmetry here.

**The actual fix is configuration, and it is Dee's to make:** give the app a
hostname on the sending domain (e.g. `app.bescrm.net` → Vercel), then set
`APP_ORIGINS=https://app.bescrm.net` so every emailed link matches the sender.
That removes (1) outright and starts building (2).

**Immediate pilot workaround:** the pending-invitation row has **Copy link**.
Sending that link to the person directly, from Dee's own mailbox, activates
them today without waiting on DNS.

## P0 workflow gates (human)

| Workflow | Automated | Live |
|---|---|---|
| Invite Users / login (§9: email, branding, activation, production URL, password, membership, profile, team, module, partner access, landing page, refresh, logout/login) | AUTOMATED PASS | **BLOCKED — P-001, invitation delivered to Spam** |
| CreditOps (§10: assigned partner only, client opens, status, sticky context, actions, Complete Work, multiple handoffs, source/destination departments, production once, activity, EOD) | AUTOMATED PASS | UNTESTED LIVE — owner-only walks do not count |
| My Time / Timer (§11: start, refresh survives, stop, duration, association, history, EOD, no duplicate running timer) | AUTOMATED PASS | UNTESTED LIVE |
| Agent EOD (§12: work, actions, production, handoffs, QA, time, blockers derived; manual fields for context only) | AUTOMATED PASS | UNTESTED LIVE |
| Team EOD (§13: members, totals, submission state, exceptions, drill-down, Work Behind These Totals) | AUTOMATED PASS | UNTESTED LIVE — needs a real Team Lead |
| BES CRM (§14: assigned project visible, others hidden, My Work, units, actions, auto In Progress, parallel, handoff, QA, progress, production, EOD) | AUTOMATED PASS | UNTESTED LIVE — Dee's "Test" project walked by the owner only |
| Access (§15: CreditOps-only, CRM-only, lead scope, manager scope, agent scope, Finance restricted, admin controls restricted, partner inheritance, direct-URL denial) | SECURITY PASS (1559/1559) | UNTESTED LIVE through the real UI |

A row moves to LIVE VERIFIED only when the named real operator has walked
the whole list in production and said so.
