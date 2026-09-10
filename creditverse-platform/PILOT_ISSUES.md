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
| — | — | — | — | *No pilot issues reported yet.* | | | | | | | |

## P0 workflow gates (human)

| Workflow | Automated | Live |
|---|---|---|
| Invite Users / login (§9: email, branding, activation, production URL, password, membership, profile, team, module, partner access, landing page, refresh, logout/login) | AUTOMATED PASS | UNTESTED LIVE |
| CreditOps (§10: assigned partner only, client opens, status, sticky context, actions, Complete Work, multiple handoffs, source/destination departments, production once, activity, EOD) | AUTOMATED PASS | UNTESTED LIVE — owner-only walks do not count |
| My Time / Timer (§11: start, refresh survives, stop, duration, association, history, EOD, no duplicate running timer) | AUTOMATED PASS | UNTESTED LIVE |
| Agent EOD (§12: work, actions, production, handoffs, QA, time, blockers derived; manual fields for context only) | AUTOMATED PASS | UNTESTED LIVE |
| Team EOD (§13: members, totals, submission state, exceptions, drill-down, Work Behind These Totals) | AUTOMATED PASS | UNTESTED LIVE — needs a real Team Lead |
| BES CRM (§14: assigned project visible, others hidden, My Work, units, actions, auto In Progress, parallel, handoff, QA, progress, production, EOD) | AUTOMATED PASS | UNTESTED LIVE — Dee's "Test" project walked by the owner only |
| Access (§15: CreditOps-only, CRM-only, lead scope, manager scope, agent scope, Finance restricted, admin controls restricted, partner inheritance, direct-URL denial) | SECURITY PASS (1559/1559) | UNTESTED LIVE through the real UI |

A row moves to LIVE VERIFIED only when the named real operator has walked
the whole list in production and said so.
