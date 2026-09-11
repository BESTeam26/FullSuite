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
| P-001 | 2026-09-10 | Dee | Invite Users / Login | The activation email from `noreply@bescrm.net` landed in Gmail **Spam** | It reaches the inbox so a new team member can activate | A pilot defect | S1 — blocks the Invite Users P0 flow | See below | Partial (`reply_to`); the fix is DNS + `APP_ORIGINS` | — | **OPEN — awaiting Dee's DNS change** |

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

**Fixed in code (partial):** `sendEmail` now sets `reply_to` when
`MAIL_REPLY_TO` is present in the function environment, and omits the header
when it is not — no address nobody reads. Deployed to `send-invitation`,
`send-welcome`, `send-signature-request`. This addresses (3) only.

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
