# FULLSUITE PRODUCTION OPERATING MODE

**Dee's standing development instruction, 2026-09-21. Supersedes §21a Pilot
Observation Mode. Recorded verbatim; the wording below is Dee's.**

---

FullSuite is now in live production and active team testing.

From this point forward, change the development approach.

We are NOT trying to finish every possible feature before using the platform.

The priority is now:

Make the existing system excellent for the day-to-day work BES actually performs.

Dee will give requests as they come from real production use.

Some requests will be:

tiny UI corrections

wording changes

missing controls

workflow corrections

permission problems

mobile usability problems

bugs

automation gaps

Other requests may legitimately require:

schema changes

new workflows

new modules

substantial builds

Do not treat every request as a major architecture project.

And do not treat every request as a quick patch.

Determine the actual scope from the system first.

---

## 1. PRODUCTION FIRST

The live production application is now the primary environment we are improving.

Before implementing a change, understand:

what the user is trying to accomplish

what exists already

whether the problem is UI, data, permission, workflow, or architecture

whether there is already a canonical function/table/component that should be used

Prefer fixing the existing canonical implementation over adding another path.

---

## 2. DAILY OPERATIONS ARE THE PRIORITY

Prioritize workflows the BES team touches every day.

Current highest-value areas include:

**Communication** — channels · DMs · mentions · reactions · attachments ·
mobile messaging · unread state

**My Work** — what is assigned to me · what is due · what is overdue ·
completing work · handoffs

**Workforce** — Clock In / Out · Break · Lunch · attendance · corrections ·
End of Day

**CreditOps** — Main Client List · department queues · assignments ·
automatic routing · client status · due dates / SLA · work completion ·
comments/history · documents · Support / Complaints / Processing workflows

**Partner Operations** — Partner profile · contacts · service engagement ·
assignments · portal access · Partner Action Required

**Mobile** — Messages · My Work · Clock In / Out · Notifications ·
client lookup

These take precedence over speculative features.

---

## 3. CLASSIFY EACH REQUEST BEFORE BUILDING

Internally classify every request as:

**A. SIMPLE CORRECTION** — wrong text, incorrect label, spacing, button
placement, sorting, hide/show based on capability, small responsive issue.
Fix it directly. Do not turn it into a design project.

**B. BUG / REGRESSION** — something that should already work but does not.
Reproduce. Find root cause. Fix the canonical layer. Add regression coverage
when appropriate.

**C. WORKFLOW CORRECTION** — existing feature works technically but does not
match BES operations. Inspect the current workflow first. Correct the smallest
authoritative layer.

**D. FEATURE EXTENSION** — existing architecture supports the idea but needs
additional capability. Extend the canonical system. Avoid parallel
implementations.

**E. MAJOR BUILD** — new domain model, major subsystem, or significant
application surface. Only then treat it as a larger project with architecture
inspection and implementation phases.

Dee does not need to decide which category the request belongs to.
You determine that from the system.

---

## 4. DO NOT OVER-ENGINEER SMALL REQUESTS

If Dee says *"Sort this alphabetically"* — do not respond with a five-stage
architectural proposal. Inspect the data source, make the deterministic sort,
test it, deploy it.

If Dee says *"This button should only show for Team Leads"* — inspect the
existing capability and apply it.

If Dee says *"This page is confusing"* — that may require deeper UX work.
Use judgment.

---

## 5. DO NOT UNDER-ENGINEER IMPORTANT REQUESTS

Likewise, if a request affects authorization, sensitive data, money, payroll,
client status, routing, assignment, SLA, audit history, portal access or
canonical identity — do not solve it only in React. Fix the authoritative
layer.

---

## 6. KEEP THE CANONICAL ARCHITECTURE

Continue protecting the architecture we established: one canonical
Organization / Partner · one canonical Client · service engagements ·
department work · team membership · department assignments · work assignments ·
capability-based authorization · owner-only destructive deletion ·
Vault-backed sensitive data · audit history · operational SLA separate from
regulatory timers.

New convenience features must not create duplicate sources of truth.

---

## 7. PRODUCTION DATA IS REAL

Do not treat production records like disposable fixtures.

Before migrations/backfills: understand affected records · preserve history ·
make changes idempotent where possible · avoid destructive assumptions.

Fixture/test data must never leak into real employee/client views again.
Continue maintaining explicit fixture isolation probes.

---

## 8. ROLE TESTING MATTERS

Do not verify everything only as Dee/Owner. Important changes should be tested
as the relevant persona: Owner · Admin · Team Lead · Agent · Support agent ·
Partner · Client where applicable. Especially for permissions and visibility.

---

## 9. MOBILE IS NOW A REAL PRODUCTION CLIENT

The installed PWA is part of FullSuite production. Do not consider a workflow
complete merely because it works on desktop. For high-frequency employee
workflows, test mobile behavior too.

Priority mobile surfaces: Communication · My Work · Clock In / Clock Out ·
Notifications · Search · Client status lookup.

Complex admin workflows may remain desktop-oriented where appropriate.

---

## 10. DON'T BLOCK ON PERFECT

If a feature is safe and useful but has optional enhancements remaining: ship
the useful version. Clearly record what remains. Do not hold production
improvements hostage to unrelated polish.

---

## 11. DON'T CLAIM SOMETHING IS COMPLETE WHEN IT ISN'T

Maintain the current honesty standard. Use statuses like:

`BUILT` · `DEPLOYED` · `DATABASE VERIFIED` · `UI VERIFIED` ·
`LIVE TEST PENDING` · `HUMAN TEST REQUIRED`

If you cannot perform a human OAuth click, say so. If you cannot verify a
mobile gesture, say so. Do not turn an automated test into a claim that the
human UX was verified.

---

## 12. DEPLOYMENT DISCIPLINE

For production changes: typecheck · lint · relevant tests/probes · build ·
migration consistency when applicable.

Do not commit knowingly failing code.

A tiny copy change does not need a 150-test security phase. A permission or
routing change probably does. **Scale the verification to the risk.**

---

## 13. WATCH FOR REAL USER FRICTION

When Dee sends a screenshot, a screen recording, an agent complaint, an
unexpected workflow or a confusing UI — treat that as production evidence.
Diagnose the actual surface. Do not force the user to translate the problem
into technical language.

---

## 14. KEEP A SMALL ACTIVE PRODUCTION BACKLOG

Maintain a concise list: **NOW** (issues directly affecting daily operations) ·
**NEXT** (important improvements after current blockers) · **LATER** (useful
enhancements that do not currently affect operations) · **HUMAN GATE** (things
requiring Dee or another real user).

Do not let this become a giant speculative roadmap.

→ `PRODUCTION_BACKLOG.md`

---

## 15. CURRENT DEVELOPMENT PHILOSOPHY

FullSuite is no longer: *Build everything → launch someday.*

It is: **Use → observe → improve → automate → simplify.**

The team should increasingly move its daily work into FullSuite while
development responds to actual usage.

The measure of success is not number of features. It is: less manual work ·
less confusion · fewer external tools · faster client handling · clearer
accountability · reliable assignments · reliable communication · accurate
operational data · better mobile access.

---

## 16. DEFAULT RESPONSE TO NEW REQUESTS

1. Understand the intended business outcome.
2. Inspect existing implementation if needed.
3. Decide whether it is a correction, bug, workflow change, extension, or major build.
4. Make the smallest canonical change that fully solves it.
5. Test proportional to risk.
6. Deploy.
7. Report what changed concisely.

Only ask Dee a question when there is a real business decision you cannot
safely derive. Do not ask unnecessary technical questions.

**Dee is operating the business. The platform should adapt to the business,
not require Dee to become the engineer.**

---

## DEE'S PRODUCTION FOCUS ORDER (2026-09-21)

1. **Communication mobile** — the team is actively moving away from Teams.
2. **My Work + routing/assignment** — so everyone knows exactly what they own.
3. **Clock/attendance mobile** — everyone uses it daily.
4. **CreditOps client workflow simplification** — processing should not require
   understanding the whole database model.
5. **Notifications / Attention** — the system tells people what needs action
   instead of relying on memory.
6. **Partner Portal** — once the internal team workflow is stable.

> Everything like advanced reporting, fancy dashboards, additional microtools,
> deeper FundingOps intelligence, etc. can wait unless a real operating need
> pulls them forward.
