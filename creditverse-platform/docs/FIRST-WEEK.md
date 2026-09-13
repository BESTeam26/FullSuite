# First week

A five-day onboarding plan. The goal of the week is not to ship a feature — it
is to be able to **explain the system back** and to have exercised the gate on a
real change.

---

## Day 1 — Local setup and architecture

**Do**

```bash
git clone <repo> && cd BES-Platform/creditverse-platform
cp .env.example .env.local        # Dee supplies the two Supabase values
npm install
npm run dev                       # http://localhost:8080
```

**Read, in this order**

1. `CLAUDE.md` — the permanent rules
2. `docs/ENGINEER-HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/MODULES.md`

**Explore** the running app as a BES user and as a partner contact. Notice that
the two see the same records.

**End of day, be able to answer:** where does authorization live, and why can a
React change never be a security fix?

---

## Day 2 — Run everything, then read the security model

**Do**

```bash
npm test                 # 1787
npm run build
npm run probe            # shapes 53/0 · SQL contracts 205/205
node supabase/scripts/partner-messages-probe.mjs     # 14/14
node supabase/scripts/billing-probe.mjs              # 85/85
node supabase/scripts/marketing-module-probe.mjs     # 48/48
node supabase/scripts/rls-matrix.mjs --phases=60,61  # a targeted slice
```

**Read**

- `docs/TESTING.md` — **why `npm test` is not a sufficient gate**
- `docs/AUTHORIZATION.md`
- `docs/SECURITY.md`
- `docs/KNOWN-ISSUES.md`

**Then open** `supabase/scripts/sql-contract-probe.mjs` and read it. It is short,
and it is the clearest statement of what this application can get wrong.

**End of day, be able to answer:** name three production failures that
TypeScript, the unit tests and the build would all have approved.

---

## Day 3 — Validate against the live system

There is no separate staging database. **Treat that as a fact to work with, and
as the first thing to form an opinion about.**

**Do**

- Walk `LIVE_VALIDATION_CHECKLIST.md` sections 0, 1 and 2 against production,
  read-only, as a real BES user and a real partner contact.
- Run a live probe and **read what it does**: each one opens a transaction,
  sets `request.jwt.claims` to a real user, acts, and rolls back. That is how
  you safely test authorization against production.
- Inspect the scheduled jobs:

```sql
select jobname, schedule, active from cron.job order by jobid;
select * from cron.job_run_details order by start_time desc limit 20;
select state, count(*) from public.billing_email_outbox group by 1;
```

**Read** `docs/BACKGROUND-JOBS.md` and `docs/DEPLOYMENT.md`.

**End of day:** write Dee half a page on what a safe staging story would look
like. That is a real gap and a new technical lead's opinion on it is wanted.

---

## Day 4 — Fix one known issue, through a PR

**Take D-012** from `DEFERRED_AGENCY_WORK.md` — document previews on the funding
deal panel. It is deliberately small, it is real, and it touches the layers you
need to meet: a PostgREST select, a signed-URL path, an existing component, and
the probe that guards the query shape.

**Do**

1. Branch. Never commit to `main`.
2. Add `path` and `mime_type` to the `files(...)` embed in `fetchDealDocuments`.
3. Give the row an open action through `signDocumentUrl`.
4. Use the existing `FilePreviewGrid` and `useFilePreviews`.
5. Run the gate: `npm test && npm run build && npm run probe`.
6. **Watch `probe:shapes` pass with your changed embed.** That is the point of
   the exercise.
7. Open a PR that says what changed, what you ran, and the actual numbers.

**Do not** expand the scope. FundingOps is paused; this is a contained fix.

---

## Day 5 — Deploy, with a rollback plan

**Before**

- The gate is green, reported at its **actual** numbers.
- You can say in one sentence what would break if this is wrong.
- The rollback is written down: for a frontend change, promote the previous
  Vercel deployment; the change touches no migration, so there is no schema to
  reverse.
- Dee knows it is going out.

**Do**

- Merge to `main`. Watch the Vercel build.
- Verify the change on `app.bescrm.net`.
- Re-run `npm run probe` against production.

**After**

- Record the result. If anything is wrong, **roll back first, diagnose second**.

**End of week, explain back to Dee:**

- The three tenancy relationships, and why a Partner is not an organization.
- Why there is one task engine and what the CreditOps exception is for.
- Why admin is not financial access.
- The difference between Account Credit and Processing Credits.
- What `npm run probe` catches that the build cannot.

---

## The standing bar

If these cannot be told apart confidently, the week is not finished:

**Partner · organization · engagement · workspace · work item · department work ·
Partner assignment · team membership · capability · invoice · payment · Account
Credit · Processing Credit.**

Definitions: `docs/ENGINEER-HANDOFF.md`, "The distinctions you must be able to
explain".
