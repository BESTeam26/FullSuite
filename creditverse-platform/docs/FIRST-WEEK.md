# First week

**Set by Dee, 2026-09-13.**

Your first responsibility is **not** to continue where the previous work left
off. It is to **understand and stabilize what exists**, and then to tell Dee
independently what she actually has.

There is no feature work this week. There is no roadmap this week. A roadmap
follows the **Product Charter**, which is Dee's document and is not derived from
this codebase — see "Two sources of truth" in
[`ENGINEER-HANDOFF.md`](ENGINEER-HANDOFF.md).

**Do not delete anything.** Not FundingOps, not Marketing, not TalentOps, not
billing or portal features. Some of it is exactly what the eventual platform
needs. Classification comes first — see "Nothing is removed yet" below.

---

## Day 1 — Read the handoff, and explain the architecture back

**Read, in this order**

1. [`CLAUDE.md`](../../CLAUDE.md) — the permanent project rules
2. [`ENGINEER-HANDOFF.md`](ENGINEER-HANDOFF.md)
3. [`ARCHITECTURE.md`](ARCHITECTURE.md)
4. [`MODULES.md`](MODULES.md)

**Deliverable:** explain FullSuite's architecture back to Dee, out loud, in
plain language. Not a summary of the documents — your own account of how it
works and why it is shaped that way.

She should hear you describe: the three tenancy relationships, why a Partner is
not an organization, why authorization lives in the database, and why there is
one task engine with one deliberate exception.

---

## Day 2 — Get it running independently, and reproduce the full gate

**Do**

```bash
git clone <repo> && cd BES-Platform/creditverse-platform
cp .env.example .env.local        # Dee supplies the two Supabase values
npm install
npm run dev                       # http://localhost:8080

npm test                          # 1787
npm run build
npm run probe                     # shapes 53/0 · SQL contracts 205/205
node supabase/scripts/partner-messages-probe.mjs     # 14/14
node supabase/scripts/billing-probe.mjs              # 85/85
node supabase/scripts/marketing-module-probe.mjs     # 48/48
node supabase/scripts/rls-matrix.mjs --phases=60,61  # a targeted slice
```

**Read** [`TESTING.md`](TESTING.md) and [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md),
then open `supabase/scripts/sql-contract-probe.mjs` and read the script itself.
It is short, and it is the clearest statement of what this application can get
wrong while every conventional check stays green.

**Deliverable:** every number above, reproduced on your machine, reported at its
**actual** value. If something does not reproduce, that is the first finding of
the week and it matters more than anything else you could do today.

---

## Day 3 — Security, infrastructure, database, deployment risk

**Read** [`SECURITY.md`](SECURITY.md), [`AUTHORIZATION.md`](AUTHORIZATION.md),
[`DATABASE.md`](DATABASE.md), [`DEPLOYMENT.md`](DEPLOYMENT.md),
[`BACKGROUND-JOBS.md`](BACKGROUND-JOBS.md).

**Look at, on the live system, read-only**

```sql
select jobname, schedule, active from cron.job order by jobid;
select * from cron.job_run_details order by start_time desc limit 20;
select state, count(*) from public.billing_email_outbox group by 1;
```

**The known gap, and your first real judgement call: there is no isolated
staging environment.** A push to `main` is a production deploy, and migrations
are pushed by hand against production. The live probes work around this by
running inside rolled-back transactions as real users — that is a genuine
technique, not a substitute for staging.

**Deliverable:** a written assessment of deployment and data risk, and a
concrete proposal for establishing proper staging isolation. Say what it costs
and what it buys. This is the single infrastructure decision Dee most needs a
qualified opinion on.

---

## Day 4 — Trace one complete business flow, end to end, changing nothing

```
Partner → Service → Work → Employee → Partner Portal → Invoice → Payment
```

Follow one real chain through the whole system. Tables, functions, policies,
screens, jobs. Read the code and the schema; **change neither**.

At each hop, ask two questions and write the answers down:

- **Where is this coherent?** One canonical record, one rule, one place it is
  enforced.
- **Where is there unnecessary complexity?** Two things doing one job, a rule
  expressed in more than one place, an abstraction earning nothing.

**Deliverable:** that map, with your honest read of both columns. Dee has never
had an independent account of where the seams are.

---

## Day 5 — Technical assessment and a stabilization plan

**Deliverable, to Dee:**

1. **What you actually found** — the state of the system in your words.
2. **Stabilization plan** — what should be made safe, in what order, and why.
   Infrastructure, security, data integrity, deployment. Not features.
3. **Risks you would not leave sitting.**
4. **Questions you need answered** before anything is built.

**No feature roadmap.** A roadmap comes after Dee approves the **Product
Charter**, and after her charter and your assessment have been compared. The
difference between "what was built" and "what Dee wanted to build" is the work
list — and neither half of that comparison exists yet without you.

---

## Nothing is removed yet

Dee's instruction, and it is not negotiable this week:

> Don't start ripping out FundingOps, Marketing, TalentOps, billing features or
> portal features because you're overwhelmed by the current scope. Some of that
> work may be exactly what the eventual platform needs. We first classify it as
> **Core**, **Product Module**, **Later**, or **unnecessary**.

That classification is a **product** decision made with Dee, informed by your
assessment. It is not a cleanup you perform on your own judgement, and it does
not happen in week one.

The codebase already carries this discipline: `src/_archive/` holds unrouted
legacy excluded from the bundle rather than deleted, and
`COMPLETION_REGISTER.md` records a worked example of classifying symbols before
removing any of them. Follow that pattern.

**Specifically not a first-week task:** D-012 (document previews on the funding
deal panel) and every other item in `DEFERRED_AGENCY_WORK.md`. They are
legitimate technical work. Whether FundingOps is even in the immediate product
milestone has not been re-established, and picking up a deferred ticket before
that is settled is how the scope got here.

---

## The standing bar

If these cannot be told apart confidently, the week is not finished:

**Partner · organization · engagement · workspace · work item · department work ·
Partner assignment · team membership · capability · invoice · payment · Account
Credit · Processing Credit.**

Definitions: [`ENGINEER-HANDOFF.md`](ENGINEER-HANDOFF.md), "The distinctions you
must be able to explain".
