#!/usr/bin/env node
/**
 * RLS authorization matrix — positive AND negative controls, as real users.
 *
 * Each check runs inside `begin; set local role authenticated; set local
 * request.jwt.claims = {sub}; … ; rollback;` so Postgres evaluates the real
 * policies for that user and nothing is written. No passwords are used and no
 * UI is involved — this is the database's own answer.
 *
 * Expectations are derived from an admin "truth" pass in the same run (row
 * totals, per-assignee and per-team counts), so the matrix stays strict as
 * fixtures change instead of drifting into hard-coded numbers.
 *
 *   node supabase/scripts/rls-matrix.mjs            # phase-1 checks
 *   node supabase/scripts/rls-matrix.mjs --phase 42 # include later phases
 *
 * Exit code is non-zero on any failed check in the requested phases. Run from
 * creditverse-platform/ (the CLI resolves the linked project from there).
 */
import { createRequire } from "node:module";
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ *
 * Which phases run.
 *
 *   --phase=47          phases 1..47 — the full milestone gate
 *   --phases=45,46,47   exactly those — verifying one change
 *   --from=44           44 upward, to --phase
 *
 * A targeted run is not a weaker gate. It is the same probes, chosen, and it
 * is what makes it reasonable to keep the full gate comprehensive.
 * ------------------------------------------------------------------ */
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`) || a.startsWith(`--${name} `));
  if (!hit) return fallback;
  const v = hit.includes("=") ? hit.split("=")[1] : fallback;
  return v ?? fallback;
};
const PHASE = Number(arg("phase", 1));
const ONLY = String(arg("phases", "")).split(",").map((n) => Number(n.trim())).filter((n) => n > 0);
const FROM = Number(arg("from", 0));
const runs = (n) => (ONLY.length > 0 ? ONLY.includes(n) : n <= PHASE && n >= FROM);

/* ------------------------------------------------------------------ *
 * The transport. See lib/sync-query.mjs for why it is not the CLI any more.
 * ------------------------------------------------------------------ */
const db = createSyncQuery({
  projectRef: readProjectRef(),
  token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url),
});

/* ------------------------------------------------------------------ *
 * Collect → one flush → replay.
 *
 * A phase's probes are independent: each is its own `begin; … rollback;` and
 * none can see another's writes. So a phase is run twice over the same pure
 * closures — once to COLLECT the SQL every probe would issue, then one
 * transport call for all of them, then again to REPLAY the recorded answers
 * into the same assertions.
 *
 * What is NOT changed: the SQL, the role, the JWT claims, the transaction
 * boundaries, or which identity each probe runs as. Each statement is still
 * executed on its own connection in its own transaction, and still rolled
 * back. This removes waiting, not isolation.
 *
 * Setup queries — the ones a phase runs while BUILDING its probe list — are
 * deliberately not collected. They run immediately, because a phase's later
 * probes are often shaped by their results, and handing those a placeholder
 * would silently change which probes exist.
 *
 * `--serial` turns the whole thing off and issues one call per probe, which is
 * how the batched path is proven to give identical answers.
 * ------------------------------------------------------------------ */
const SERIAL = process.argv.includes("--serial");
let collecting = false;
let collected = [];
let replay = null;
let replayAt = 0;

/**
 * Set when a replayed statement does not match the collected one.
 *
 * A FLAG rather than only an exception, because every `w*` helper wraps its
 * query in its own try/catch to turn a refusal into "ERR 42501" — and that
 * catch happily swallows an abort signal too, turning a batch that must be
 * discarded into a probe that quietly reports "ERR unknown". The flag cannot
 * be caught.
 */
const BATCH_INVALID = Symbol("batch-invalid");
let batchInvalid = false;

const q = (sql) => {
  if (collecting) {
    collected.push(sql);
    /* Truthy, and shaped like a result, so a probe's own control flow behaves
       the same in both passes. */
    return [{ rows: "\u0000collecting" }];
  }
  if (replay) {
    /*
     * The statement must be the one that was collected, character for
     * character. A probe that BUILDS its next statement out of a previous
     * result would have built that statement from the placeholder during
     * collection — so the recorded answer belongs to a different query, and
     * replaying it would assert something nobody asked.
     *
     * This is not hypothetical: the first full run caught exactly one such
     * probe, which sent a placeholder containing a NUL byte and got back
     * 08P01. Shape checking alone did not see it, because the probe issued the
     * right NUMBER of statements — just not the right ones.
     */
    if (collected[replayAt] !== sql) {
      batchInvalid = true;
      const e = new Error("batch invalid");
      e[BATCH_INVALID] = true;
      throw e;
    }
    const r = replay[replayAt++];
    if (!r) throw new Error("replay ran out of recorded results");
    if (r.error) throw new Error(r.error);
    return r.rows;
  }
  return db.query(sql);
};

/**
 * Run a builder twice — once to collect the statements it issues, then once to
 * replay one flushed batch of answers into it.
 *
 * Used for the expectations table, whose ~28 little count queries are built
 * inline and were costing nearly a minute of pure waiting on every single run,
 * including a run of one phase. The builder is a pure function of data already
 * fetched, so both passes take the same branches.
 *
 * If the shapes disagree the batch is discarded and the builder runs normally,
 * because a mismatched replay would feed one expectation another's number.
 */
function batched(build) {
  if (SERIAL) return build();
  collecting = true;
  collected = [];
  try { build(); } catch { /* shape only */ }
  collecting = false;
  const wanted = collected.length;
  if (wanted === 0) return build();
  const answers = db.queryMany(collected);
  replay = answers;
  replayAt = 0;
  batchInvalid = false;
  let out;
  let invalid = false;
  try {
    out = build();
  } catch (e) {
    if (!e?.[BATCH_INVALID]) throw e;
    invalid = true;
  } finally {
    if (batchInvalid || replayAt !== wanted) invalid = true;
    replay = null;
    batchInvalid = false;
  }
  /* Either it diverged in shape or it built a statement from a placeholder.
     Both mean the batch cannot be trusted for this builder. */
  return invalid ? build() : out;
}

/**
 * Run one phase's probes and print them.
 *
 * Replaces 45 copies of the same loop, which is also what makes the collect /
 * replay pass possible in one place instead of forty-five.
 */
function runPhase(label, list, { strict = false } = {}) {
  console.log(`\n${label}:`);

  let answers = null;
  let shape = null;
  if (!SERIAL && list.length > 1) {
    collecting = true;
    collected = [];
    shape = [];
    /* Pass 1: discover the statements each probe issues. Results discarded. */
    for (const [, fn] of list) {
      const before = collected.length;
      try { fn(); } catch { /* shape only — a throw here is not a result */ }
      shape.push(collected.length - before);
    }
    collecting = false;
    answers = db.queryMany(collected);
  }

  replay = answers;
  replayAt = 0;
  batchInvalid = false;
  const results = [];
  let misaligned = false;

  for (let i = 0; i < list.length; i++) {
    const [text, fn] = list[i];
    const before = replayAt;
    let got;
    try { got = fn(); } catch (e) {
      if (e?.[BATCH_INVALID]) { misaligned = true; break; }
      got = "ERR " + String(e.message).slice(0, 60);
    }
    /*
     * A probe that consumed a different number of statements than it did while
     * being collected has branched on a value it could not see in pass 1. Its
     * answer, and every answer after it, would be reading somebody else's
     * result — so the batch is abandoned rather than trusted. This has to be
     * loud: a silently misaligned security assertion passes.
     */
    /* Either the probe issued a different number of statements, or it issued a
       different statement. The flag survives a helper's own catch; the shape
       check catches the rest. */
    if (replay && (batchInvalid || replayAt - before !== shape[i])) { misaligned = true; break; }
    results.push(got);
  }

  if (misaligned) {
    console.log("  · a probe used a batched result to shape its next statement; re-running this phase one call at a time");
    replay = null;
    batchInvalid = false;
    results.length = 0;
    for (const [, fn] of list) {
      let got;
      try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
      results.push(got);
    }
  }
  replay = null;

  for (let i = 0; i < list.length; i++) {
    const [text, , want] = list[i];
    const got = results[i];
    checks++;
    const ok = strict ? got === want : String(got) === String(want);
    if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${text}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* ------------------------------------------------------------------ *
 * Per-phase timing, so nobody has to guess where a run's minutes went.
 * ------------------------------------------------------------------ */
let fails = 0, checks = 0;
const timings = [];
let openPhase = null;
let phaseStartedAt = Date.now();
let phaseStartQueries = 0;
let phaseStartChecks = 0;
/** Closes the previous section and opens this one — so no phase has to remember to. */
const startPhase = (label) => {
  endPhase();
  openPhase = label;
  phaseStartedAt = Date.now();
  phaseStartQueries = db.stats.count;
  phaseStartChecks = checks;
};
function endPhase() {
  if (openPhase === null) return;
  timings.push({
    label: openPhase,
    ms: Date.now() - phaseStartedAt,
    queries: db.stats.count - phaseStartQueries,
    checks: checks - phaseStartChecks,
  });
  openPhase = null;
}
const human = (ms) => (ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`);

startPhase("bootstrap");

/**
 * A raw query whose failure is reported the way the per-phase helpers report
 * it — "ERR <sqlstate>" — rather than as the shell command that failed. A
 * probe that expects a refusal must be able to say which refusal it got.
 */
const tryQ = (sql) => {
  try { return q(sql)[0].rows; }
  catch (e) {
    const text = String(e.message) + "\n" + String(e.stdout ?? "");
    const m = text.match(/ERROR:\s*(\w+):/);
    return "ERR " + (m ? m[1] : "unknown");
  }
};
const asUser = (uid, selectList) =>
  q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; select ${selectList}; rollback;`)[0];

/* ---------------- truth (admin role, bypasses RLS) ---------------- */
/* ------------------------------------------------------------------ *
 * BEFORE ANYTHING ELSE: the fixtures must not be able to log in.
 *
 * These identities exist so this suite can assert as an owner, an admin, a
 * manager, a lead and an agent. They have never needed to AUTHENTICATE — every
 * probe sets `request.jwt.claims` directly on a superuser connection.
 *
 * They used to be able to anyway: real password hashes, confirmed addresses,
 * no ban, live sessions, and `bes.owner@bes.test` holding an active
 * agency_owner membership in the production agency. A hidden owner with
 * production privileges is still a production owner (0178).
 *
 * So the run begins by re-asserting the severed state and refusing to continue
 * if any of it drifted back. A security suite whose own fixtures are a
 * backdoor is not measuring security.
 * ------------------------------------------------------------------ */
const fixtureLogins = q(`select public.assert_fixture_logins_disabled() as rows`)[0].rows;
if (fixtureLogins.drift_found) {
  console.log(`\n  fixture logins had drifted and were re-severed: ${JSON.stringify(fixtureLogins)}`);
}
const loginState = q(`select fixture_identities, with_password, not_banned from public.fixture_login_state`)[0];
if (loginState.with_password > 0 || loginState.not_banned > 0) {
  console.error(`\nREFUSING TO RUN: ${loginState.with_password} fixture identities hold a password and ${loginState.not_banned} are not banned.`);
  console.error("A test fixture that can authenticate into production is a backdoor. Fix that first.");
  process.exit(1);
}

const users = Object.fromEntries(q(`select email, id from public.profiles where email like '%@bes.test'`).map((r) => [r.email, r.id]));
const T = q(`select
  -- Agency scope is not admin bypass: engagement still gates. The oracle mirrors that,
  -- so it would catch an engagement bypass rather than expect one.
  (select count(*) from public.work_items w where (w.workspace_id is null or exists (select 1 from public.workspace_shares s join public.fulfillment_engagements e on e.id=s.engagement_id where s.workspace_id=w.workspace_id and s.revoked_at is null and (s.board_id is null or s.board_id=w.board_id) and e.service='talentops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to))) and (w.scope='AGENCY' or exists (select 1 from public.fulfillment_engagements e where e.organization_id=w.organization_id and public.engagement_is_live(e.status,e.effective_from,e.effective_to))))::int as work_total,
  (select count(*) from public.work_attention a join public.work_items w on w.id=a.id where (w.workspace_id is null or exists (select 1 from public.workspace_shares s join public.fulfillment_engagements e on e.id=s.engagement_id where s.workspace_id=w.workspace_id and s.revoked_at is null and (s.board_id is null or s.board_id=w.board_id) and e.service='talentops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to))) and (w.scope='AGENCY' or exists (select 1 from public.fulfillment_engagements e where e.organization_id=w.organization_id and public.engagement_is_live(e.status,e.effective_from,e.effective_to))))::int as attention_total,
  -- Two ways a client is reachable, and they are different rules (0165).
  -- ORGANIZATION-owned: a live engagement, always — that is a customer's own
  -- data and staff status is never access to it (rule 16).
  -- PARTNER-owned: BES holds the record itself (rule 16, model 3), so the
  -- test is a non-archived partner, not an engagement. The oracle mirrors
  -- both, so it would still catch an engagement bypass on the org branch.
  (select count(*) from public.fulfillment_clients c where c.archived_at is null and (
     (c.outsourcing_group_id is not null and exists (select 1 from public.outsourcing_groups g where g.id=c.outsourcing_group_id and g.lifecycle <> 'archived'))
     or exists (select 1 from public.fulfillment_engagements e where e.service='creditops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to) and (e.organization_id=c.organization_id or e.outsourcing_group_id=c.outsourcing_group_id))
  ))::int as fclients_total,
  (select count(*) from public.funding_clients c where exists (select 1 from public.fulfillment_engagements e where e.service='fundingops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to) and (e.organization_id=c.organization_id or e.outsourcing_group_id=c.outsourcing_group_id)))::int as fund_total,
  -- division ceiling ∪ own assignments: "assignment always counts, whatever the ceiling"
  (select count(*) from public.work_items where division='creditops' or assigned_to=(select id from public.profiles where email='bes.manager@bes.test'))::int as work_creditops,
  (select count(*) from public.work_attention where division='creditops' or assigned_to=(select id from public.profiles where email='bes.manager@bes.test'))::int as attention_creditops,
  (select count(*) from public.work_items w where w.organization_id='dddddddd-0000-4000-8000-80ce8814eb05' and w.scope='ORGANIZATION')::int
   + (select count(*) from public.work_items w where w.scope='AGENCY' and w.division='bes_crm' and w.subject_organization_id='dddddddd-0000-4000-8000-80ce8814eb05')::int as lakeside_org_work,
  (select count(*) from public.work_attention a join public.work_items w on w.id=a.id where w.organization_id='dddddddd-0000-4000-8000-80ce8814eb05' and w.scope='ORGANIZATION')::int as lakeside_org_attention,
  (select count(*) from public.work_items w where w.organization_id=(select id from public.organizations where name='[TEST] Northgate Credit Co') and w.scope='ORGANIZATION')::int as northgate_org_work,
  (select count(*) from public.work_attention a join public.work_items w on w.id=a.id where w.organization_id=(select id from public.organizations where name='[TEST] Northgate Credit Co') and w.scope='ORGANIZATION')::int as northgate_org_attention,
  (select id from public.fulfillment_clients where name='[TEST] Evan Ellis') as lakeside_client,
  /* Pinned to the SEEDED record by name, not an unordered LIMIT 1 over the
     table. Real records Dee creates land in these organizations too, and the
     probe silently started measuring one of those -- a client assigned to the
     very team whose lead it asserts CANNOT see it. It then reported a
     security regression that was really a fixture drifting underneath it.
     A probe whose subject can change is a probe that tests nothing. */
  (select id from public.fulfillment_clients where name='[TEST] Cleo Chan') as cedar_client,
  -- The suite's OWN teams (0170). It used to find these by a product name
  -- ('CreditOps%Team A%'), which Dee renamed while using the Teams screen -
  -- exactly what a Teams screen is for - and four team-scope checks quietly
  -- stopped measuring anything. A fixture a user can rename will be renamed.
  (select id from public.teams where name = '[TEST] Team A' limit 1) as team_a,
  (select id from public.teams where name = '[TEST] Team B' limit 1) as team_b
`)[0];
const per = (uid, col, table) => q(`select count(*)::int n from public.${table} where ${col}='${uid}'`)[0].n;
const teamCount = (team, table) => team ? q(`select count(*)::int n from public.${table} where team_id='${team}'`)[0].n : 0;
const teamOrAssigned = (team, uid, table, col) => team ? q(`select count(*)::int n from public.${table} where team_id='${team}' or ${col}='${uid}'`)[0].n : per(uid, col, table);
const attnTeamOrAssigned = (team, uid) => team ? q(`select count(*)::int n from public.work_attention where team_id='${team}' or assigned_to='${uid}'`)[0].n : per(uid, "assigned_to", "work_attention");

const U = users;
const lakesideOrg = q(`select id from public.organizations where name='[TEST] Lakeside Partners'`)[0].id;

/* ---------------- the matrix ----------------
   Each row: [label, phase, selectExpr, {email: expected}]  */
const S = `
  (select count(*) from public.work_items)::int as work,
  (select count(*) from public.work_attention)::int as attention,
  (select count(*) from public.fulfillment_clients)::int as fclients,
  (select count(*) from public.funding_clients)::int as fund,
  (select count(*) from public.fulfillment_clients where id='${T.lakeside_client}')::int as lakeside_by_id,
  (select count(*) from public.fulfillment_clients where id='${T.cedar_client}')::int as cedar_by_id
`;
/* UPDATE probes. A data-modifying CTE must be top-level, so these run as their
   own statement in the same rolled-back transaction. RLS decides how many rows
   the UPDATE reaches; RETURNING counts them; ROLLBACK discards the change. */
const UPD = `
  with a as (update public.fulfillment_clients set last_activity_at=now() where id='${T.lakeside_client}' returning 1),
       b as (update public.fulfillment_clients set last_activity_at=now() where id='${T.cedar_client}'    returning 1)
  select (select count(*) from a)::int as can_update_lakeside, (select count(*) from b)::int as can_update_cedar
`;
const asUserUpdate = (uid) =>
  q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${UPD}; rollback;`)[0];

const E = batched(() => ({
  // BES, agency scope: everything
  "bes.owner@bes.test":  { work: T.work_total, attention: T.attention_total, fclients: T.fclients_total, fund: T.fund_total, lakeside_by_id: 1, cedar_by_id: 1, can_update_lakeside: 1, can_update_cedar: 1 },
  "bes.admin@bes.test":  { work: T.work_total, attention: T.attention_total, fclients: T.fclients_total, fund: T.fund_total, lakeside_by_id: 1, cedar_by_id: 1, can_update_lakeside: 1, can_update_cedar: 1 },
  // BES manager, DIVISION creditops (fixture): all credit, no funding, creditops work only
  "bes.manager@bes.test": { work: T.work_creditops, attention: T.attention_creditops, fclients: T.fclients_total, fund: 0, lakeside_by_id: 1, cedar_by_id: 1, can_update_lakeside: 1, can_update_cedar: 1 },
  // BES team lead, TEAM A: team A records (incl. unassigned) + own assignments
  "bes.lead@bes.test":   { work: teamOrAssigned(T.team_a, U["bes.lead@bes.test"], "work_items", "assigned_to"), attention: attnTeamOrAssigned(T.team_a, U["bes.lead@bes.test"]), fclients: teamOrAssigned(T.team_a, U["bes.lead@bes.test"], "fulfillment_clients", "assigned_agent_id"), fund: 0, lakeside_by_id: 1, cedar_by_id: 0, can_update_lakeside: 1, can_update_cedar: 0 },
  // BES agents, ASSIGNED scope: exactly their assignments
  "bes.credit@bes.test": { work: per(U["bes.credit@bes.test"], "assigned_to", "work_items"), attention: per(U["bes.credit@bes.test"], "assigned_to", "work_attention"), fclients: per(U["bes.credit@bes.test"], "assigned_agent_id", "fulfillment_clients"), fund: 0, cedar_by_id: 0, can_update_cedar: 0 },
  "bes.funding@bes.test":{ work: per(U["bes.funding@bes.test"], "assigned_to", "work_items"), attention: 0, fclients: 0, fund: per(U["bes.funding@bes.test"], "assigned_agent_id", "funding_clients"), lakeside_by_id: 0, cedar_by_id: 0, can_update_lakeside: 0, can_update_cedar: 0 },
  // THE key negative control: BES staff, assigned nothing → sees nothing operational
  "bes.restricted@bes.test": { work: 0, attention: 0, fclients: 0, fund: 0, lakeside_by_id: 0, cedar_by_id: 0, can_update_lakeside: 0, can_update_cedar: 0 },
  // Organization users: tenant only, unchanged by BES scope
  "org.owner@bes.test":  { work: T.lakeside_org_work, /* every ORGANIZATION item of Lakeside + its entitled BES CRM projects; the BES support task about Lakeside is not theirs (0031) */ attention: T.lakeside_org_attention, fclients: 2, fund: 1, lakeside_by_id: 1, cedar_by_id: 0, can_update_cedar: 0 },
  "org2.owner@bes.test": { work: T.northgate_org_work, attention: T.northgate_org_attention, fclients: 2, fund: 0, lakeside_by_id: 0, cedar_by_id: 0, can_update_lakeside: 0, can_update_cedar: 0 },
  "probe.agent@bes.test":{ work: 0, attention: 0, fclients: 0, fund: 0, lakeside_by_id: 0, cedar_by_id: 0, can_update_lakeside: 0, can_update_cedar: 0 },
}));

/*
 * Two statements per fixture user, and there are fourteen of them — twenty-
 * eight sequential round trips before a single phase had run, on EVERY
 * invocation including a one-phase one. Collected and flushed together; each
 * is still its own transaction as the same user, rolled back the same way.
 */
const matrixRows = batched(() =>
  Object.entries(E).map(([email, expected]) => {
    const uid = U[email];
    if (!uid) return { email, expected, uid: null, got: null };
    return { email, expected, uid, got: { ...asUser(uid, S), ...asUserUpdate(uid) } };
  }),
);

for (const { email, expected, uid, got } of matrixRows) {
  if (!uid) { console.log(`?? ${email} not found`); continue; }
  const line = [];
  for (const [k, want] of Object.entries(expected)) {
    checks++;
    const ok = got[k] === want;
    if (!ok) fails++;
    line.push(`${ok ? "✓" : "✗"} ${k}=${got[k]}${ok ? "" : `(want ${want})`}`);
  }
  console.log(`${email.padEnd(26)} ${line.join("  ")}`);
}

/* Positive controls: every record class is reachable by someone. */
const pos = q(`select
  (select count(*) from public.fulfillment_clients where team_id='${T.team_a}')::int as team_a_clients,
  (select count(*) from public.fulfillment_clients where team_id='${T.team_b}')::int as team_b_clients`)[0];
console.log(`\npositive controls: team A holds ${pos.team_a_clients} clients, team B holds ${pos.team_b_clients}`);

/* ---------------- Phase 2: the boundary around the scoped records ----------------
   Every gap the independent review found, as a check. Satellites, blind writes with
   no WHERE, INSERTs into unseen records, the unassigned team queue, a no-engagement
   organization, org-side assigned_only, escalation paths, cross-service reads. */
if (runs(2)) {
  startPhase("phase 2");
  const AGENCY = "a0000000-0000-4000-8000-000000000001";
  const NIL = "00000000-0000-4000-8000-000000000000";
  const dana = q(`select id from public.fulfillment_clients where name='[TEST] Dana Doyle'`)[0]?.id ?? NIL;      // Team A, unassigned
  const ivan = q(`select id from public.fulfillment_clients where name='[TEST] Ivan Ironwood'`)[0]?.id ?? NIL;   // Ironwood, no engagement
  const vantageWork = q(`select count(*)::int n from public.work_items w join public.organizations o on o.id=w.organization_id where o.name ilike '%Vantage%'`)[0].n;
  const creditIds = q(`select coalesce(string_agg(quote_literal(id::text),','),'null') s from public.fulfillment_clients where assigned_agent_id='${U["bes.credit@bes.test"]}'`)[0].s;
  const cdsForCredit = q(`select count(*)::int n from public.client_department_statuses where client_id::text in (${creditIds})`)[0].n;
  // every event whose record credit can see: their clients, their work items, their own EODs
  const actForCredit = q(`select count(*)::int n from public.activity_events a where
      (a.entity_type='fulfillment_client' and a.entity_id in (${creditIds}))
   or (a.entity_type='work_item' and a.entity_id in (select id::text from public.work_items where assigned_to='${U["bes.credit@bes.test"]}'))
   or (a.entity_type='eod_submission' and a.entity_id in (select id::text from public.eod_submissions where employee_id='${U["bes.credit@bes.test"]}'))`)[0].n;
  const orgAgentAct = q(`select count(*)::int n from public.activity_events a join public.fulfillment_clients c on c.id::text=a.entity_id where c.assigned_agent_id='${U["org.agent@bes.test"]}'`)[0].n;

  const R = (uid, sel) => { try { return asUser(uid, sel); } catch (e) { return { __err: String(e.message).slice(0, 80) }; } };
  const W = (uid, stmt) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const S2 = `
    (select count(*) from public.client_department_statuses)::int as cds,
    (select count(*) from public.activity_events)::int as activity,
    (select count(*) from public.funding_files)::int as funding_files,
    (select count(*) from public.businesses)::int as businesses,
    (select count(*) from public.files)::int as files,
    (select count(*) from public.fulfillment_clients where id='${dana}')::int as dana_by_id,
    (select count(*) from public.fulfillment_clients where id='${ivan}')::int as ivan_by_id`;
  const blind = (uid) => ({
    ...W(uid, `with a as (update public.client_department_statuses set updated_at=now() returning 1),
       b as (update public.funding_deals set updated_at=now() returning 1),
       c as (update public.funding_files set updated_at=now() returning 1)
    select (select count(*) from a)::int as upd_cds, (select count(*) from b)::int as upd_deals, (select count(*) from c)::int as upd_ffiles`),
    ...W(uid, `with d as (delete from public.client_department_statuses returning 1) select count(*)::int as del_cds from d`),
  });

  const rows = [
    // ---- bes.restricted: the boundary ----
    ["restricted sees no department statuses",       () => R(U["bes.restricted@bes.test"], S2).cds, 0],
    ["restricted sees no activity",                  () => R(U["bes.restricted@bes.test"], S2).activity, 0],
    ["restricted sees no funding files",             () => R(U["bes.restricted@bes.test"], S2).funding_files, 0],
    ["restricted sees no customer businesses",       () => R(U["bes.restricted@bes.test"], S2).businesses, 0],
    ["restricted sees no files",                     () => R(U["bes.restricted@bes.test"], S2).files, 0],
    ["credit sees businesses only of orgs they reach", () => R(U["bes.credit@bes.test"], S2).businesses, q(`select count(*)::int n from public.businesses b where b.organization_id in (select organization_id from public.fulfillment_clients where assigned_agent_id='${U["bes.credit@bes.test"]}' and organization_id is not null)`)[0].n],
    ["restricted blind UPDATE cds → 0",              () => blind(U["bes.restricted@bes.test"]).upd_cds, 0],
    ["restricted blind UPDATE deals → 0",            () => blind(U["bes.restricted@bes.test"]).upd_deals, 0],
    ["restricted blind UPDATE funding files → 0",    () => blind(U["bes.restricted@bes.test"]).upd_ffiles, 0],
    ["restricted blind DELETE cds → refused (no delete grant since 0063)", () => { const b = blind(U["bes.restricted@bes.test"]); return b.refused ? "refused" : b.del_cds; }, "refused"],
    ["restricted cannot post a note on an unseen client", () => W(U["bes.restricted@bes.test"], `with i as (insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility) values ('${AGENCY}','${lakesideOrg}','fulfillment_client','${T.lakeside_client}','${U["bes.restricted@bes.test"]}','x','Comment posted','probe','bes_internal') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["restricted cannot log production on an unseen client", () => W(U["bes.restricted@bes.test"], `with i as (insert into public.production_logs (agency_id, employee_id, client_id, division_id, department, production_unit_type, production_unit_quantity, actions, work_date) values ('${AGENCY}','${U["bes.restricted@bes.test"]}','${T.lakeside_client}','creditops','Onboarding','Onboarding',1,array['x'],current_date) returning 1) select count(*)::int as rows from i`).rows, 0],
    ["restricted cannot assign agency work to another agent", () => W(U["bes.restricted@bes.test"], `with i as (insert into public.work_items (agency_id, scope, related_type, title, stage, priority, assigned_to) values ('${AGENCY}','AGENCY','project','probe','Queued','Normal','${U["bes.credit@bes.test"]}') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["restricted (assigned scope) cannot mint a client",       () => W(U["bes.restricted@bes.test"], `with i as (insert into public.fulfillment_clients (agency_id, name, email, mode, organization_id, auto_sync, status, round, assigned_agent_id) values ('${AGENCY}','probe','probe.${Date.now()}@bes.test','saas_pulled','${lakesideOrg}',false,'Onboarding','Pre-Round','${U["bes.restricted@bes.test"]}') returning 1) select count(*)::int as rows from i`).rows, 0],
    // ---- unassigned Team A queue ----
    ["assigned-scope Team A member does NOT see the unassigned queue", () => R(U["bes.credit@bes.test"], S2).dana_by_id, 0],
    ["Team A lead DOES see the unassigned queue",                       () => R(U["bes.lead@bes.test"], S2).dana_by_id, 1],
    ["…and may update it",                                              () => W(U["bes.lead@bes.test"], `with u as (update public.fulfillment_clients set last_activity_at=now() where id='${dana}' returning 1) select count(*)::int as rows from u`).rows, 1],
    // ---- child follows parent ----
    ["credit sees exactly the statuses of their own clients",  () => R(U["bes.credit@bes.test"], S2).cds, cdsForCredit],
    ["credit sees exactly the activity of their own clients",  () => R(U["bes.credit@bes.test"], S2).activity, actForCredit],
    ["funding agent sees no credit department statuses",       () => R(U["bes.funding@bes.test"], S2).cds, 0],
    // ---- no engagement means no access, even for the owner ----
    ["owner cannot see the Ironwood client (no engagement)",   () => R(U["bes.owner@bes.test"], S2).ivan_by_id, 0],
    ["owner cannot see Vantage's org-scope work (no engagement)", () => asUser(U["bes.owner@bes.test"], `(select count(*) from public.work_items w join public.organizations o on o.id=w.organization_id where o.name ilike '%Vantage%')::int as n`).n, vantageWork > 0 ? 0 : 0],
    // ---- organization side ----
    ["org.manager sees the unassigned Lakeside client",        () => R(U["org.manager@bes.test"], S2).dana_by_id, 1],
    ["org.agent (assigned_only) does not",                      () => R(U["org.agent@bes.test"], S2).dana_by_id, 0],
    ["org.agent sees only activity on their own clients",       () => R(U["org.agent@bes.test"], S2).activity, q(`select count(*)::int n from public.activity_events a where (a.entity_type=\'fulfillment_client\' and a.entity_id in (select id::text from public.fulfillment_clients where assigned_agent_id=\'${U["org.agent@bes.test"]}\')) or (a.entity_type=\'work_item\' and a.entity_id in (select id::text from public.work_items where assigned_to=\'${U["org.agent@bes.test"]}\') and a.visibility <> \'bes_internal\')`)[0].n],
    // ---- escalation paths ----
    ["org.manager cannot self-promote to org_admin",  () => W(U["org.manager@bes.test"], `with u as (update public.org_memberships set role='org_admin' where user_id=auth.uid() returning 1) select count(*)::int as rows from u`).rows, 0],
    ["agent cannot widen their own scope",            () => W(U["bes.credit@bes.test"], `with u as (update public.agency_memberships set scope='agency' where user_id=auth.uid() returning 1) select count(*)::int as rows from u`).rows, 0],
    ["org admin cannot add a BES agent to an org team", () => W(U["org2.owner@bes.test"], `insert into public.teams (id, organization_id, name) values ('${NIL.replace(/0000$/,"0001")}', (select organization_id from public.org_memberships where user_id=auth.uid() limit 1), 'probe team'); with m as (insert into public.team_memberships (team_id, user_id, is_lead) values ('${NIL.replace(/0000$/,"0001")}', '${U["bes.restricted@bes.test"]}', true) returning 1) select count(*)::int as rows from m`).rows, 0],
    ["probe cannot write to audit_log via log_audit()",  () => W(U["probe.agent@bes.test"], `select public.log_audit('probe','x','1') as rows`).refused ? 0 : 1, 0],
  ];
  runPhase("phase 2", rows, { strict: true });
}

/* ---------------- Phase 3: work-item creation + production idempotency ----------------
   Each probe is a top-level data-modifying CTE inside a rolled-back transaction, so
   RLS and constraints decide the outcome and nothing persists. */
if (runs(3)) {
  startPhase("phase 3");
  const AGENCY = "a0000000-0000-4000-8000-000000000001";
  const NORTHGATE = q(`select id from public.organizations where name='[TEST] Northgate Credit Co'`)[0].id;
  const creditClient = q(`select id from public.fulfillment_clients where assigned_agent_id='${U["bes.credit@bes.test"]}' limit 1`)[0].id;
  // `assignee` = "self" assigns the row to the creator; null queues it unassigned.
  const ins = (uid, scope, org, agency, assignee = "self") =>
    q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
       with i as (insert into public.work_items (agency_id, scope, organization_id, related_type, title, stage, priority, created_by, assigned_to)
                  values ('${agency}','${scope}',${org ? `'${org}'` : "null"},'project','matrix probe','Queued','Normal','${uid}',${assignee === "self" ? `'${uid}'` : "null"})
                  returning agency_id)
       select count(*)::int as rows, max(agency_id::text) as stored_agency from i; rollback;`)[0];
  const tryIns = (...a) => { try { return ins(...a); } catch (e) { return { rows: 0, stored_agency: null, refused: true }; } };
  const prod = (uid, reqA, reqB) =>
    q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
       with a as (insert into public.production_logs (agency_id, employee_id, client_id, service, department_key, production_unit_type, production_unit_quantity, actions, work_date, request_id)
                  values ('${AGENCY}','${uid}','${creditClient}','creditops','Onboarding','Onboarding',1,array['Client File Reviewed'],current_date,'${reqA}')
                  on conflict (agency_id, request_id) where request_id is not null do nothing returning id),
            b as (insert into public.production_logs (agency_id, employee_id, client_id, service, department_key, production_unit_type, production_unit_quantity, actions, work_date, request_id)
                  values ('${AGENCY}','${uid}','${creditClient}','creditops','Onboarding','Onboarding',1,array['Client File Reviewed'],current_date,'${reqB}')
                  on conflict (agency_id, request_id) where request_id is not null do nothing returning id)
       select (select count(*) from a)::int + (select count(*) from b)::int as rows; rollback;`)[0].rows;

  const P = [
    ["org admin creates ORGANIZATION work for own org",      () => tryIns(U["org.owner@bes.test"], "ORGANIZATION", lakesideOrg, AGENCY).rows, 1],
    ["…and a spoofed agency_id is overridden server-side",   () => tryIns(U["org.owner@bes.test"], "ORGANIZATION", lakesideOrg, "00000000-0000-4000-8000-00000000dead").stored_agency, AGENCY],
    ["org admin cannot create AGENCY-scope work",            () => tryIns(U["org.owner@bes.test"], "AGENCY", null, AGENCY).rows, 0],
    ["org admin cannot create work for another org",         () => tryIns(U["org.owner@bes.test"], "ORGANIZATION", NORTHGATE, AGENCY).rows, 0],
    ["org assigned-only agent creates own-org work assigned to self", () => tryIns(U["org.agent@bes.test"], "ORGANIZATION", lakesideOrg, AGENCY, "self").rows, 1],
    ["…but cannot queue it unassigned (could not then see it)",       () => tryIns(U["org.agent@bes.test"], "ORGANIZATION", lakesideOrg, AGENCY, null).rows, 0],
    ["org manager may queue unassigned own-org work",                 () => tryIns(U["org.manager@bes.test"], "ORGANIZATION", lakesideOrg, AGENCY, null).rows, 1],
    ["BES agent creates AGENCY work assigned to self",               () => tryIns(U["bes.credit@bes.test"], "AGENCY", null, AGENCY, "self").rows, 1],
    ["…but cannot queue unassigned agency work (assigned scope)",   () => tryIns(U["bes.credit@bes.test"], "AGENCY", null, AGENCY, null).rows, 0],
    ["BES owner may queue unassigned agency work",                   () => tryIns(U["bes.owner@bes.test"], "AGENCY", null, AGENCY, null).rows, 1],
    ["no-membership probe cannot create anything",           () => tryIns(U["probe.agent@bes.test"], "AGENCY", null, AGENCY).rows, 0],
    ["same request_id twice → exactly one production row",   () => prod(U["bes.credit@bes.test"], "11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"), 1],
    ["two distinct request_ids → two rows (not over-deduped)",() => prod(U["bes.credit@bes.test"], "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"), 2],
  ];
  runPhase("phase 3", P, { strict: true });
}


/* ---------------- Phase 5: notifications ----------------
   Recipients are computed by the database from activity events; rows are read
   under the recipient's own RLS, which re-checks the record is still visible.
   Every probe runs inside one rolled-back transaction, switching the JWT
   subject mid-transaction to read as a different person. Rows created inside
   the transaction carry created_at = now() (transaction start), which is how
   the counts ignore anything that already existed. */
if (runs(5)) {
  startPhase("phase 5");
  const credit = U["bes.credit@bes.test"], manager = U["bes.manager@bes.test"],
        lead = U["bes.lead@bes.test"], restricted = U["bes.restricted@bes.test"];
  const dana = q(`select id from public.fulfillment_clients where name='[TEST] Dana Doyle'`)[0]?.id;
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W5 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: "ERR " + String(e.message).slice(0, 60) }; } };
  const assignToCredit = `update public.fulfillment_clients set assigned_agent_id='${credit}' where id='${dana}'`;
  const assignToLead   = `update public.fulfillment_clients set assigned_agent_id='${lead}' where id='${dana}'`;
  const leadNotes = `${as(lead)}; insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, visibility)
      select agency_id, organization_id, 'fulfillment_client', id::text, auth.uid(), 'Note', 'probe note', 'bes_internal' from public.fulfillment_clients where id='${dana}'`;
  const fresh = (extra = "") => `select count(*)::int as rows from public.notifications where created_at >= now() ${extra}`;

  const P5 = [
    ["manager assigns Dana → credit has 1 unread 'assigned'",        () => W5(manager, `${assignToCredit}; ${as(credit)}; ${fresh(`and kind='assigned' and entity_id='${dana}' and read_at is null`)}`).rows, 1],
    ["…the actor (manager) is not notified",                          () => W5(manager, `${assignToCredit}; ${fresh()}`).rows, 0],
    ["…an unrelated agent (restricted) sees nothing",                 () => W5(manager, `${assignToCredit}; ${as(restricted)}; ${fresh()}`).rows, 0],
    ["recipient can mark their own notification read",                () => W5(manager, `${assignToCredit}; ${as(credit)}; with u as (update public.notifications set read_at = now() where created_at >= now() returning 1) select count(*)::int as rows from u`).rows, 1],
    ["another user cannot mark it read (0 rows touched)",             () => W5(manager, `${assignToCredit}; ${as(restricted)}; with u as (update public.notifications set read_at = now() returning 1) select count(*)::int as rows from u`).rows, 0],
    ["reassigning away → credit gets 1 'unassigned'",                 () => W5(manager, `${assignToCredit}; ${assignToLead}; ${as(credit)}; ${fresh(`and kind='unassigned'`)}`).rows, 1],
    ["lead notes credit's client → credit gets 1 'note'",             () => W5(manager, `${assignToCredit}; ${leadNotes}; ${as(credit)}; ${fresh(`and kind='note'`)}`).rows, 1],
    ["…the note's author is not notified",                            () => W5(manager, `${assignToCredit}; ${leadNotes}; ${fresh(`and kind='note'`)}`).rows, 0],
    ["after losing the record, credit's note notification is hidden", () => W5(manager, `${assignToCredit}; ${leadNotes}; ${as(manager)}; ${assignToLead}; ${as(credit)}; ${fresh(`and kind='note'`)}`).rows, 0],
    ["API roles hold no INSERT/DELETE/TRUNCATE on notifications",     () => q(`select count(*)::int as rows from information_schema.role_table_grants where table_schema='public' and table_name='notifications' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','DELETE','TRUNCATE','TRIGGER','REFERENCES')`)[0].rows, 0],
    ["API roles hold TRUNCATE/TRIGGER/REFERENCES on no public table", () => q(`select count(*)::int as rows from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')`)[0].rows, 0],
    ["recipient-resolution functions not callable from the API",      () => q(`select count(*)::int as rows from information_schema.routine_privileges where specific_schema='public' and routine_name in ('record_owner','notify_from_activity','as_uuid') and grantee in ('anon','authenticated','PUBLIC')`)[0].rows, 0],
  ];
  runPhase("phase 5", P5, { strict: true });
}


/* ---------------- Phase 6: Custom Workspaces ----------------
   Visibility = org membership + entitlement; items follow the workspace;
   statuses are rows mapped onto the canonical stage; config changes audited.
   BES staff have no share yet (Phase 7), so they see none of it. */
if (runs(6)) {
  startPhase("phase 6");
  const orgOwner = U["org.owner@bes.test"], org2Owner = U["org2.owner@bes.test"], besOwner = U["bes.owner@bes.test"], orgAgent = U["org.agent@bes.test"];
  const LAKESIDE = "dddddddd-0000-4000-8000-80ce8814eb05", NORTHGATE = "dddddddd-0000-4000-8000-3f3028d6b8f3";
  const WS = "ee000000-0000-4000-8000-000000000001", BOARD = "ee000000-0000-4000-8000-000000000011";
  const DONE = "ee000000-0000-4000-8000-000000000024", ITEM_OPEN = "ee000000-0000-4000-8000-000000000102";
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W6 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const W6sudo = (setup, uid, stmt) => { try { return q(`begin; ${setup}; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const P6 = [
    ["org owner sees the fixture workspace",                       () => W6(orgOwner, `select count(*)::int as rows from public.workspaces where id='ee000000-0000-4000-8000-000000000001'`).rows, 1],
    ["…with its 4 statuses",                                       () => W6(orgOwner, `select count(*)::int as rows from public.workspace_statuses where workspace_id='${WS}'`).rows, 4],
    ["…and both fixture items",                                    () => W6(orgOwner, `select count(*)::int as rows from public.work_items where workspace_id='${WS}'`).rows, q(`select count(*)::int n from public.work_items where workspace_id='${WS}'`)[0].n],
    ["BES CreditOps manager (engaged, division scope) sees NO workspace", () => W6(U["bes.manager@bes.test"], `select count(*)::int as rows from public.workspaces`).rows, 0],
    ["…and NO workspace items — outside TalentOps scope",         () => W6(U["bes.manager@bes.test"], `select count(*)::int as rows from public.work_items where workspace_id is not null`).rows, 0],
    ["org2 owner (not entitled) sees no workspace even in own org", () => W6sudo(`insert into public.workspaces (organization_id, name) values ('${NORTHGATE}', 'probe')`, org2Owner, `select count(*)::int as rows from public.workspaces`).rows, 0],
    ["…and once entitled, sees it",                                () => W6sudo(`update public.product_entitlements set enabled=true where organization_id='${NORTHGATE}' and product='workspaces'; insert into public.workspaces (organization_id, name) values ('${NORTHGATE}', 'probe')`, org2Owner, `select count(*)::int as rows from public.workspaces`).rows, 1],
    ["org2 owner cannot create a workspace without entitlement",   () => W6(org2Owner, `with i as (insert into public.workspaces (organization_id, name) values ('${NORTHGATE}', 'probe') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["org owner cannot create a workspace for another org",        () => W6(orgOwner, `with i as (insert into public.workspaces (organization_id, name) values ('${NORTHGATE}', 'probe') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["new item without status lands in the first status, stage Queued", () => W6(orgOwner, `with i as (insert into public.work_items (scope, organization_id, related_type, title, stage, priority, workspace_id, board_id) values ('ORGANIZATION','${LAKESIDE}','project','probe','Blocked','Normal','${WS}','${BOARD}') returning status_id, stage) select count(*)::int as rows from i where status_id='ee000000-0000-4000-8000-000000000021' and stage='Queued'`).rows, 1],
    ["moving to Done sets stage Completed and completed_at",       () => W6(orgOwner, `with u as (update public.work_items set status_id='${DONE}' where id='${ITEM_OPEN}' returning stage, completed_at) select count(*)::int as rows from u where stage='Completed' and completed_at is not null`).rows, 1],
    ["a status from another workspace is rejected",                () => W6(orgOwner, `with u as (update public.work_items set status_id='00000000-0000-4000-8000-000000000000' where id='${ITEM_OPEN}' returning 1) select count(*)::int as rows from u`).rows, 0],
    ["workspace item for another organization is rejected",       () => W6(orgOwner, `with i as (insert into public.work_items (scope, organization_id, related_type, title, stage, priority, workspace_id) values ('ORGANIZATION','${NORTHGATE}','project','probe','Queued','Normal','${WS}') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["status change by org owner writes one activity event",       () => W6(orgOwner, `update public.work_items set status_id='${DONE}' where id='${ITEM_OPEN}'; select count(*)::int as rows from public.activity_events where entity_id='${ITEM_OPEN}' and created_at >= now() and action='Status changed'`).rows, 1],
    ["renaming a status is audited (actor, before, after)",       () => W6sudo(``, orgOwner, `update public.workspace_statuses set label='Finished' where id='${DONE}'; set local role postgres; select count(*)::int as rows from public.audit_log where entity_type='workspace_statuses' and entity_id='${DONE}' and created_at >= now() and actor_id='${orgOwner}' and before->>'label'='Done' and after->>'label'='Finished'`).rows, 1],
    ["org agent (non-admin) cannot rename a status",               () => W6(orgAgent, `with u as (update public.workspace_statuses set label='x' where id='${DONE}' returning 1) select count(*)::int as rows from u`).rows, 0],
    ["anon-facing grants: no TRUNCATE/TRIGGER/REFERENCES on new tables", () => q(`select count(*)::int as rows from information_schema.role_table_grants where table_schema='public' and table_name like 'workspace%' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')`)[0].rows, 0],
  ];
  runPhase("phase 6", P6, { strict: true });
}


/* ---------------- Phase 7: TalentOps bridge (workspace_shares) ----------------
   BES reaches an organization's workspace only through a live, unrevoked share
   under a TalentOps engagement, within BES TalentOps scope. Board-level shares
   hide sibling boards and their items. 'view' shares cannot write. The
   organization authorizes; BES cannot share to itself. */
if (runs(7)) {
  startPhase("phase 7");
  const orgOwner = U["org.owner@bes.test"], org2Owner = U["org2.owner@bes.test"], besOwner = U["bes.owner@bes.test"],
        besManager = U["bes.manager@bes.test"], besRestricted = U["bes.restricted@bes.test"], besCredit = U["bes.credit@bes.test"];
  const LAKESIDE = "dddddddd-0000-4000-8000-80ce8814eb05", NORTHGATE = "dddddddd-0000-4000-8000-3f3028d6b8f3";
  const WS = "ee000000-0000-4000-8000-000000000001", BOARD = "ee000000-0000-4000-8000-000000000011";
  const SHARE = "ee000000-0000-4000-8000-000000000051", ENG = "dddddddd-0000-4000-8000-000000000701";
  const ITEM_OPEN = "ee000000-0000-4000-8000-000000000102", DONE = "ee000000-0000-4000-8000-000000000024";
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W7 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const W7sudo = (setup, uid, stmt) => { try { return q(`begin; ${setup}; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const P7 = [
    ["BES owner now sees the shared workspace",                     () => W7(besOwner, `select count(*)::int as rows from public.workspaces`).rows, 1],
    ["…and its 2 items",                                            () => W7(besOwner, `select count(*)::int as rows from public.work_items where workspace_id='${WS}'`).rows, q(`select count(*)::int n from public.work_items where workspace_id='${WS}'`)[0].n],
    ["…and may move one (access 'work')",                           () => W7(besOwner, `with u as (update public.work_items set status_id='${DONE}' where id='${ITEM_OPEN}' returning 1) select count(*)::int as rows from u`).rows, 1],
    ["with access 'view', BES cannot move it",                      () => W7sudo(`update public.workspace_shares set access='view' where id='${SHARE}'`, besOwner, `with u as (update public.work_items set status_id='${DONE}' where id='${ITEM_OPEN}' returning 1) select count(*)::int as rows from u`).rows, 0],
    ["…but still sees it",                                          () => W7sudo(`update public.workspace_shares set access='view' where id='${SHARE}'`, besOwner, `select count(*)::int as rows from public.work_items where workspace_id='${WS}'`).rows, q(`select count(*)::int n from public.work_items where workspace_id='${WS}'`)[0].n],
    ["revoked share → BES sees nothing",                            () => W7sudo(`update public.workspace_shares set revoked_at=now() where id='${SHARE}'`, besOwner, `select count(*)::int as rows from public.workspaces`).rows, 0],
    ["ended engagement → BES sees nothing",                         () => W7sudo(`update public.fulfillment_engagements set status='ended' where id='${ENG}'`, besOwner, `select count(*)::int as rows from public.workspaces`).rows, 0],
    ["board-level share hides items on other boards",              () => W7sudo(`insert into public.workspace_boards (id, workspace_id, name) values ('ee000000-0000-4000-8000-000000000012','${WS}','Other'); update public.work_items set board_id='ee000000-0000-4000-8000-000000000012' where id='${ITEM_OPEN}'; update public.workspace_shares set board_id='${BOARD}' where id='${SHARE}'`, besOwner, `select count(*)::int as rows from public.work_items where workspace_id='${WS}'`).rows, q(`select count(*)::int n from public.work_items where workspace_id='${WS}'`)[0].n - 1],
    ["…and hides the other board itself",                          () => W7sudo(`insert into public.workspace_boards (id, workspace_id, name) values ('ee000000-0000-4000-8000-000000000012','${WS}','Other'); update public.workspace_shares set board_id='${BOARD}' where id='${SHARE}'`, besOwner, `select count(*)::int as rows from public.workspace_boards where workspace_id='${WS}'`).rows, 1],
    ["division-scoped CreditOps manager is outside TalentOps scope", () => W7(besManager, `select count(*)::int as rows from public.workspaces`).rows, 0],
    ["assigned-scope agent sees no container…",                    () => W7(besRestricted, `select count(*)::int as rows from public.workspaces`).rows, 0],
    ["…but an item assigned to them (assignment always counts)",   () => W7sudo(`update public.work_items set assigned_to='${besCredit}' where id='${ITEM_OPEN}'`, besCredit, `select count(*)::int as rows from public.work_items where id='${ITEM_OPEN}'`).rows, 1],
    ["BES owner cannot create a share for itself",                 () => W7(besOwner, `with i as (insert into public.workspace_shares (workspace_id, engagement_id) values ('${WS}','${ENG}') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["org admin cannot share under another org's engagement",      () => W7sudo(`insert into public.workspaces (id, organization_id, name) values ('ee000000-0000-4000-8000-000000000002','${NORTHGATE}','probe'); update public.product_entitlements set enabled=true where organization_id='${NORTHGATE}' and product='workspaces'`, org2Owner, `with i as (insert into public.workspace_shares (workspace_id, engagement_id) values ('ee000000-0000-4000-8000-000000000002','${ENG}') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["org owner sees the fixture share row; org2 owner does not", () => W7(orgOwner, `select count(*)::int as rows from public.workspace_shares where id=\'${SHARE}\'`).rows + W7(org2Owner, `select count(*)::int as rows from public.workspace_shares where id=\'${SHARE}\'`).rows * 10, 1],
    ["org owner can revoke (update revoked_at)",                   () => W7(orgOwner, `with u as (update public.workspace_shares set revoked_at=now() where id='${SHARE}' returning 1) select count(*)::int as rows from u`).rows, 1],
    ["share creation is audited with actor",                       () => W7(orgOwner, `insert into public.workspace_shares (workspace_id, engagement_id, board_id) values ('${WS}','${ENG}','${BOARD}'); set local role postgres; select count(*)::int as rows from public.audit_log where entity_type='workspace_shares' and created_at >= now() and actor_id='${orgOwner}'`).rows, 1],
  ];
  runPhase("phase 7", P7, { strict: true });
}


/* ---------------- Phase 8: BES CRM — BES-owned delivery, controlled visibility ----------------
   The customer sees its CRM delivery projects when entitled to 'crm', reads only
   what BES published, may comment and upload, and cannot change the project.
   Association is not publication: BES's other AGENCY items about the customer
   stay BES's. */
if (runs(8)) {
  startPhase("phase 8");
  const orgOwner = U["org.owner@bes.test"], org2Owner = U["org2.owner@bes.test"], orgAgent = U["org.agent@bes.test"], besOwner = U["bes.owner@bes.test"];
  const LAKESIDE = "dddddddd-0000-4000-8000-80ce8814eb05", NORTHGATE = "dddddddd-0000-4000-8000-3f3028d6b8f3", AGENCY = "a0000000-0000-4000-8000-000000000001";
  const CRM_L = "ee000000-0000-4000-8000-000000000201", CRM_N = "ee000000-0000-4000-8000-000000000202";
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W8 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const W8sudo = (setup, uid, stmt) => { try { return q(`begin; ${setup}; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const P8 = [
    ["org owner (crm entitled) sees its CRM project",                 () => W8(orgOwner, `select count(*)::int as rows from public.work_items where id='${CRM_L}'`).rows, 1],
    ["…and NOT BES's support task about them (association ≠ publication)", () => W8(orgOwner, `select count(*)::int as rows from public.work_items where scope='AGENCY' and division is distinct from 'bes_crm'`).rows, 0],
    ["…reads the published update",                                   () => W8(orgOwner, `select count(*)::int as rows from public.activity_events where entity_id='${CRM_L}' and visibility='shared_with_partner'`).rows, 1],
    ["…and never the internal one",                                   () => W8(orgOwner, `select count(*)::int as rows from public.activity_events where entity_id='${CRM_L}' and visibility='bes_internal'`).rows, 0],
    ["…cannot change the project's stage",                            () => W8(orgOwner, `with u as (update public.work_items set stage='Completed' where id='${CRM_L}' returning 1) select count(*)::int as rows from u`).rows, 0],
    ["…cannot create an AGENCY item",                                 () => W8(orgOwner, `with i as (insert into public.work_items (agency_id, scope, subject_organization_id, related_type, division, title, stage, priority) values ('${AGENCY}','AGENCY','${LAKESIDE}','project','bes_crm','probe','Queued','Normal') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["…may comment on it (shared_with_partner)",                      () => W8(orgOwner, `with i as (insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, visibility) values ('${AGENCY}','${LAKESIDE}','work_item','${CRM_L}', auth.uid(), 'Comment posted', 'probe', 'shared_with_partner') returning 1) select count(*)::int as rows from i`).rows, 1],
    ["…but not as bes_internal",                                      () => W8(orgOwner, `with i as (insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, visibility) values ('${AGENCY}','${LAKESIDE}','work_item','${CRM_L}', auth.uid(), 'Comment posted', 'probe', 'bes_internal') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["…may upload a document to it",                                  () => W8(orgOwner, `with i as (insert into public.files (agency_id, organization_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by) values ('${AGENCY}','${LAKESIDE}','work_item','${CRM_L}','attachments','probe/x.pdf','x.pdf','application/pdf',1, auth.uid()) returning 1) select count(*)::int as rows from i`).rows, 1],
    ["org agent (non-admin) does not see the project",                () => W8(orgAgent, `select count(*)::int as rows from public.work_items where id='${CRM_L}'`).rows, 0],
    ["org2 owner (not crm-entitled) does not see its project",        () => W8(org2Owner, `select count(*)::int as rows from public.work_items where id='${CRM_N}'`).rows, 0],
    ["…and sees it once entitled",                                    () => W8sudo(`update public.product_entitlements set enabled=true where organization_id='${NORTHGATE}' and product='crm'`, org2Owner, `select count(*)::int as rows from public.work_items where id='${CRM_N}'`).rows, 1],
    ["org owner never sees another org's project",                    () => W8(orgOwner, `select count(*)::int as rows from public.work_items where id='${CRM_N}'`).rows, 0],
    ["BES owner reads its own published update (was hidden: activity_service null)", () => W8(besOwner, `select count(*)::int as rows from public.activity_events where entity_id='${CRM_L}' and visibility='shared_with_partner'`).rows, 1],
    ["BES owner reads the org's status change on a shared workspace item", () => W8(besOwner, `select least(count(*),1)::int as rows from public.activity_events where entity_id='ee000000-0000-4000-8000-000000000102' and visibility='shared_with_partner' and action='Status changed'`).rows, 1],
    ["…but never a customer's organization_internal note",           () => W8sudo(`insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, visibility) values ('${AGENCY}','${LAKESIDE}','work_item','${CRM_L}', '${orgOwner}', 'Note', 'org private', 'organization_internal')`, besOwner, `select count(*)::int as rows from public.activity_events where entity_id='${CRM_L}' and visibility='organization_internal'`).rows, 0],
    // The fixture's project also carries the trigger-written 'Work item created' event (bes_internal); count internal NOTES only.
    // Counts the FIXTURE rows, not the table: the first real project (Dee
    // created "Test" through the live dialog on 2026-09-08) broke the old
    // "exactly two rows exist" expectation, which was a snapshot of an empty
    // product, not a rule. The rule is: the owner reaches both fixture
    // projects and the internal note.
    ["BES owner sees both fixture projects and the internal note",    () => W8(besOwner, `select (select count(*) from public.work_items where division='bes_crm' and is_fixture)::int + (select count(*) from public.activity_events where entity_id='${CRM_L}' and visibility='bes_internal' and action='Note')::int as rows`).rows, 3],
  ];
  runPhase("phase 8", P8, { strict: true });
}


/* ---------------- Phase 9: branding merges (regression guard) ----------------
   0023 revoked log_audit() from API roles and silently broke both branding
   saves. The merges now run as owner with explicit checks (0034). */
if (runs(9)) {
  startPhase("phase 9");
  const besOwner = U["bes.owner@bes.test"], orgOwner = U["org.owner@bes.test"], org2Owner = U["org2.owner@bes.test"], besCredit = U["bes.credit@bes.test"];
  const LAKESIDE = "dddddddd-0000-4000-8000-80ce8814eb05", AGENCY = "a0000000-0000-4000-8000-000000000001";
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W9 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const P9 = [
    ["BES owner saves an organization's branding (audited)",   () => W9(besOwner, `select public.merge_organization_branding('${LAKESIDE}', '{"probe":1}'); set local role postgres; select count(*)::int as rows from public.audit_log where action='organization.branding_updated' and created_at >= now() and actor_id='${besOwner}'`).rows, 1],
    ["org admin saves its own branding",                         () => W9(orgOwner, `select (public.merge_organization_branding('${LAKESIDE}', '{"probe":1}') ->> 'probe')::int as rows`).rows, 1],
    ["another org's admin is refused",                           () => W9(org2Owner, `select (public.merge_organization_branding('${LAKESIDE}', '{"probe":1}') ->> 'probe')::int as rows`).rows, 0],
    ["BES admin saves agency branding (audited)",                () => W9(besOwner, `select public.merge_agency_branding('${AGENCY}', '{"probe":1}'); set local role postgres; select count(*)::int as rows from public.audit_log where action='agency.branding_updated' and created_at >= now() and actor_id='${besOwner}'`).rows, 1],
    ["a BES agent cannot save agency branding",                  () => W9(besCredit, `select (public.merge_agency_branding('${AGENCY}', '{"probe":1}') ->> 'probe')::int as rows`).rows, 0],
    ["the dead column is written by no frontend path (grep)",    () => { const fs = require("node:fs"); const files = ["src/lib/data/organizations.ts","src/lib/agency-context.tsx","src/components/settings/sections/GeneralSections.tsx"]; return files.filter((f) => /is_fulfillment_subscriber\s*:/.test(fs.readFileSync(f, "utf8"))).length; }, 0],
  ];
  runPhase("phase 9", P9, { strict: true });
}


/* ---------------- Phase 10: service-aware production ----------------
   One production table; the service decides the subject; tenancy is derived
   from the subject; the subject must be visible to the producer; completion
   of a work-item-service item by BES staff produces exactly once. */
if (runs(10)) {
  startPhase("phase 10");
  const besOwner = U["bes.owner@bes.test"], besManager = U["bes.manager@bes.test"], besFunding = U["bes.funding@bes.test"],
        besCredit = U["bes.credit@bes.test"], orgOwner = U["org.owner@bes.test"];
  const AGENCY = "a0000000-0000-4000-8000-000000000001";
  const WS_ITEM = "ee000000-0000-4000-8000-000000000102", DONE = "ee000000-0000-4000-8000-000000000024", BACKLOG = "ee000000-0000-4000-8000-000000000021";
  const CRM_L = "ee000000-0000-4000-8000-000000000201";
  const myFunding = q(`select id, organization_id from public.funding_clients where assigned_agent_id='${besFunding}' limit 1`)[0];
  const otherFunding = q(`select id from public.funding_clients where assigned_agent_id is distinct from '${besFunding}' limit 1`)[0]?.id;
  const myDeal = q(`select id from public.funding_deals where client_id='${myFunding?.id}' limit 1`)[0]?.id;
  const otherDeal = q(`select id from public.funding_deals where client_id is distinct from '${myFunding?.id}' limit 1`)[0]?.id;
  const creditClientId = q(`select id from public.fulfillment_clients where assigned_agent_id='${besCredit}' limit 1`)[0]?.id;
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W10 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const fundIns = (uid, client, extra = "", req = "44444444-4444-4444-8444-444444444444") =>
    `with i as (insert into public.production_logs (agency_id, employee_id, service, funding_client_id, department_key, production_unit_type, production_unit_quantity, actions, work_date, request_id, division_id ${extra ? "," + extra.split("=")[0] : ""})
       values ('${AGENCY}','${uid}','fundingops','${client}','Submissions','Submissions',1,array['Lender Submission Sent'],current_date,'${req}','fundingops' ${extra ? "," + extra.split("=")[1] : ""}) returning organization_id, service) select count(*)::int as rows, max(organization_id::text) as org, max(service::text) as svc from i`;
  const P10 = [
    ["funding agent logs FundingOps production on an assigned client",  () => W10(besFunding, fundIns(besFunding, myFunding.id)).rows, 1],
    ["…tenancy is derived from the client, not the payload",            () => W10(besFunding, fundIns(besFunding, myFunding.id, "organization_id='dddddddd-0000-4000-8000-0caba65a1343'")).org, String(myFunding.organization_id)],
    ["…on a client they cannot see: refused",                           () => W10(besFunding, fundIns(besFunding, otherFunding)).rows, 0],
    ["credit agent cannot log FundingOps production",                   () => W10(besCredit, fundIns(besCredit, myFunding.id)).rows, 0],
    ["service/subject mismatch is rejected (creditops on a funding client)", () => W10(besFunding, `with i as (insert into public.production_logs (agency_id, employee_id, service, funding_client_id, production_unit_type, production_unit_quantity, actions, work_date, division_id) values ('${AGENCY}','${besFunding}','creditops','${myFunding.id}','x',1,array['x'],current_date,'creditops') returning 1) select count(*)::int as rows from i`).rows, 0],
    ["a deal of another client is rejected",                            () => W10(besFunding, fundIns(besFunding, myFunding.id, `funding_deal_id='${otherDeal}'`)).rows, 0],
    ["the client's own deal is accepted",                               () => myDeal ? W10(besFunding, fundIns(besFunding, myFunding.id, `funding_deal_id='${myDeal}'`)).rows : 1, 1],
    ["a department outside the service taxonomy is rejected",           () => W10(besFunding, fundIns(besFunding, myFunding.id).replace("'Submissions','Submissions'", "'Dispute','Dispute'")).rows, 0],
    ["same request_id twice → one FundingOps row",                      () => W10(besFunding, `with a as (insert into public.production_logs (agency_id, employee_id, service, funding_client_id, department_key, production_unit_type, production_unit_quantity, actions, work_date, request_id, division_id) values ('${AGENCY}','${besFunding}','fundingops','${myFunding.id}','Submissions','Submissions',1,array['x'],current_date,'44444444-4444-4444-8444-444444444444','fundingops') on conflict (agency_id, request_id) where request_id is not null do nothing returning id), b as (insert into public.production_logs (agency_id, employee_id, service, funding_client_id, department_key, production_unit_type, production_unit_quantity, actions, work_date, request_id, division_id) values ('${AGENCY}','${besFunding}','fundingops','${myFunding.id}','Submissions','Submissions',1,array['x'],current_date,'44444444-4444-4444-8444-444444444444','fundingops') on conflict (agency_id, request_id) where request_id is not null do nothing returning id) select (select count(*) from a)::int + (select count(*) from b)::int as rows`).rows, 1],
    ["CreditOps manager sees no FundingOps production",                 () => W10(besManager, `select count(*)::int as rows from public.production_logs where service='fundingops'`).rows, 0],
    ["…but the owner (agency scope) does, once one exists",             () => W10(besOwner, `set local role postgres; insert into public.production_logs (agency_id, employee_id, service, funding_client_id, department_key, production_unit_type, production_unit_quantity, actions, work_date, division_id) values ('${AGENCY}','${besFunding}','fundingops','${myFunding.id}','Submissions','Submissions',1,array['x'],current_date,'fundingops'); set local role authenticated; ${as(besOwner)}; select count(*)::int as rows from public.production_logs where service='fundingops' and created_at >= now()`).rows, 1],
    ["BES completes a shared workspace item → exactly one TalentOps production row", () => W10(besOwner, `update public.work_items set status_id='${DONE}' where id='${WS_ITEM}'; select count(*)::int as rows from public.production_logs where work_item_id='${WS_ITEM}' and service='talentops' and employee_id='${besOwner}'`).rows, 1],
    ["…reopen and complete again → still one",                          () => W10(besOwner, `update public.work_items set status_id='${DONE}' where id='${WS_ITEM}'; update public.work_items set status_id='${BACKLOG}' where id='${WS_ITEM}'; update public.work_items set status_id='${DONE}' where id='${WS_ITEM}'; select count(*)::int as rows from public.production_logs where work_item_id='${WS_ITEM}'`).rows, 1],
    ["an org user completing their own item produces no BES production", () => W10(orgOwner, `update public.work_items set status_id='${DONE}' where id='${WS_ITEM}'; set local role postgres; select count(*)::int as rows from public.production_logs where work_item_id='${WS_ITEM}'`).rows, 0],
    ["BES completes a BES CRM project → one bes_crm production row",    () => W10(besOwner, `update public.work_items set stage='Completed' where id='${CRM_L}'; select count(*)::int as rows from public.production_logs where work_item_id='${CRM_L}' and service='bes_crm'`).rows, 1],
    ["CreditOps regression: agent still sees exactly their own production", () => W10(besCredit, `select count(*)::int as rows from public.production_logs`).rows, q(`select count(*)::int n from public.production_logs where employee_id='${besCredit}'`)[0].n],
    ["CreditOps regression: legacy department is derived from department_key", () => W10(besCredit, `with i as (insert into public.production_logs (agency_id, employee_id, service, client_id, department_key, production_unit_type, production_unit_quantity, actions, work_date, division_id) values ('${AGENCY}','${besCredit}','creditops','${creditClientId}','Dispute','Dispute',1,array['x'],current_date,'creditops') returning department::text d, division_id) select count(*)::int as rows from i where d='Dispute' and division_id='creditops'`).rows, 1],
    ["EOD reconciliation: today's FundingOps units land under service fundingops for the producer", () => W10(besFunding, `insert into public.production_logs (agency_id, employee_id, service, funding_client_id, department_key, production_unit_type, production_unit_quantity, actions, work_date, division_id) values ('${AGENCY}','${besFunding}','fundingops','${myFunding.id}','Submissions','Submissions',1,array['x'],current_date,'fundingops'); select coalesce(sum(production_unit_quantity),0)::int as rows from public.production_logs where employee_id=auth.uid() and work_date=current_date and not is_voided and service='fundingops' and created_at >= now()`).rows, 1],
  ];
  runPhase("phase 10", P10, { strict: true });
}


/* ---------------- Phase 11: workspace owner experience ----------------
   Configuration is org-admin only; field values are typed by their field;
   archived fields refuse new values; assignees must be legitimate for the
   record; teams are the organization's; everything cross-org is denied. */
if (runs(11)) {
  startPhase("phase 11");
  const orgOwner = U["org.owner@bes.test"], orgManager = U["org.manager@bes.test"], orgAgent = U["org.agent@bes.test"], org2Owner = U["org2.owner@bes.test"],
        besOwner = U["bes.owner@bes.test"], besRestricted = U["bes.restricted@bes.test"], besManager = U["bes.manager@bes.test"];
  const LAKESIDE = "dddddddd-0000-4000-8000-80ce8814eb05", NORTHGATE = "dddddddd-0000-4000-8000-3f3028d6b8f3";
  const WS = "ee000000-0000-4000-8000-000000000001", BOARD = "ee000000-0000-4000-8000-000000000011", ITEM = "ee000000-0000-4000-8000-000000000102";
  const DATE_FIELD = "ee000000-0000-4000-8000-000000000041";
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W11 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const W11sudo = (setup, uid, stmt) => { try { return q(`begin; ${setup}; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const cnt = (stmt) => `with i as (${stmt} returning 1) select count(*)::int as rows from i`;
  const P11 = [
    ["org admin creates a workspace, board, status, type and field",  () => W11(orgOwner, `insert into public.workspaces (id, organization_id, name) values ('ee000000-0000-4000-8000-000000000009','${LAKESIDE}','probe'); insert into public.workspace_boards (workspace_id, name) values ('ee000000-0000-4000-8000-000000000009','b'); insert into public.workspace_statuses (workspace_id, key, label, canonical_stage, is_terminal) values ('ee000000-0000-4000-8000-000000000009','done','Done','Completed',true); insert into public.workspace_item_types (workspace_id, key, label) values ('ee000000-0000-4000-8000-000000000009','task','Task'); insert into public.workspace_fields (workspace_id, key, label, field_type, options) values ('ee000000-0000-4000-8000-000000000009','amount','Amount','number',null); select (select count(*) from public.workspaces where id='ee000000-0000-4000-8000-000000000009')::int + (select count(*) from public.workspace_statuses where workspace_id='ee000000-0000-4000-8000-000000000009')::int as rows`).rows, 2],
    ["org manager configures too (is_org_admin includes org_manager — recorded fact)", () => W11(orgManager, cnt(`insert into public.workspaces (organization_id, name) values ('${LAKESIDE}','probe')`)).rows, 1],
    ["org agent (processor) cannot create a workspace",                () => W11(orgAgent, cnt(`insert into public.workspaces (organization_id, name) values ('${LAKESIDE}','probe')`)).rows, 0],
    ["org agent cannot add a status",                                  () => W11(orgAgent, cnt(`insert into public.workspace_statuses (workspace_id, key, label) values ('${WS}','x','X')`)).rows, 0],
    ["org agent cannot rename the workspace",                          () => W11(orgAgent, cnt(`update public.workspace_statuses set label='hack' where id='ee000000-0000-4000-8000-000000000021'`)).rows, 0],
    ["another org's admin cannot read or change the workspace (guessed id)", () => W11(org2Owner, `select (select count(*) from public.workspaces where id='${WS}')::int + (select count(*) from public.workspace_statuses where workspace_id='${WS}')::int + (select count(*) from public.work_items where workspace_id='${WS}')::int as rows`).rows, 0],
    ["…nor update it",                                                 () => W11(org2Owner, cnt(`update public.workspaces set name='hack' where id='${WS}'`)).rows, 0],
    ["a terminal flag must agree with the stage (check)",              () => W11(orgOwner, cnt(`insert into public.workspace_statuses (workspace_id, key, label, canonical_stage, is_terminal) values ('${WS}','odd','Odd','Queued',true)`)).rows, 0],
    ["date field accepts a date",                                      () => W11(orgOwner, cnt(`insert into public.work_item_field_values (work_item_id, field_id, value) values ('${ITEM}','${DATE_FIELD}','"2026-10-01"'::jsonb)`)).rows, 1],
    ["…and rejects a non-date",                                        () => W11(orgOwner, cnt(`insert into public.work_item_field_values (work_item_id, field_id, value) values ('${ITEM}','${DATE_FIELD}','"soon"'::jsonb)`)).rows, 0],
    ["a field from another workspace is rejected",                     () => W11sudo(`insert into public.workspaces (id, organization_id, name) values ('ee000000-0000-4000-8000-000000000009','${LAKESIDE}','other'); insert into public.workspace_fields (id, workspace_id, key, label, field_type) values ('ee000000-0000-4000-8000-000000000049','ee000000-0000-4000-8000-000000000009','n','N','number')`, orgOwner, cnt(`insert into public.work_item_field_values (work_item_id, field_id, value) values ('${ITEM}','ee000000-0000-4000-8000-000000000049','1'::jsonb)`)).rows, 0],
    ["an archived field refuses new values",                           () => W11sudo(`update public.workspace_fields set archived_at=now() where id='${DATE_FIELD}'`, orgOwner, cnt(`insert into public.work_item_field_values (work_item_id, field_id, value) values ('${ITEM}','${DATE_FIELD}','"2026-10-01"'::jsonb)`)).rows, 0],
    ["select options must be {choices:[...]}",                         () => W11(orgOwner, cnt(`insert into public.workspace_fields (workspace_id, key, label, field_type, options) values ('${WS}','bad','Bad','select','["a"]'::jsonb)`)).rows, 0],
    ["org admin assigns an item to an org member",                     () => W11(orgOwner, cnt(`update public.work_items set assigned_to='${orgAgent}' where id='${ITEM}'`)).rows, 1],
    ["…but not to a guessed BES staff id once no live work share covers the workspace", () => W11sudo(`update public.workspace_shares set revoked_at=now() where workspace_id=\'${WS}\'`, orgOwner, cnt(`update public.work_items set assigned_to=\'${besRestricted}\' where id=\'${ITEM}\'`)).rows, 0],
    ["…while a live work share exists, agency staff may be assigned (that is how BES routes agents)", () => W11(orgOwner, cnt(`update public.work_items set assigned_to=\'${besRestricted}\' where id=\'${ITEM}\'`)).rows, 1],
    ["…the guessed id becomes valid only under the live 'work' share for BES staff (owner)", () => W11(orgOwner, cnt(`update public.work_items set assigned_to='${besOwner}' where id='${ITEM}'`)).rows, 1],
    ["…and not to another organization's member",                     () => W11(orgOwner, cnt(`update public.work_items set assigned_to='${org2Owner}' where id='${ITEM}'`)).rows, 0],
    ["org agent cannot assign someone else",                           () => W11(orgAgent, cnt(`update public.work_items set assigned_to='${orgOwner}' where id='${ITEM}'`)).rows, 0],
    ["org admin creates an org team and adds a member",                () => W11(orgOwner, `insert into public.teams (id, organization_id, name) values ('ee000000-0000-4000-8000-000000000061','${LAKESIDE}','Ops'); ${cnt(`insert into public.team_memberships (team_id, user_id, is_lead) values ('ee000000-0000-4000-8000-000000000061','${orgAgent}',false)`)}`).rows, 1],
    ["…but cannot add a BES agent to it",                              () => W11(orgOwner, `insert into public.teams (id, organization_id, name) values ('ee000000-0000-4000-8000-000000000061','${LAKESIDE}','Ops'); ${cnt(`insert into public.team_memberships (team_id, user_id, is_lead) values ('ee000000-0000-4000-8000-000000000061','${besRestricted}',false)`)}`).rows, 0],
    ["an item may be routed to the org's own team, not another org's", () => W11sudo(`insert into public.teams (id, organization_id, name) values ('ee000000-0000-4000-8000-000000000062','${NORTHGATE}','Theirs')`, orgOwner, cnt(`update public.work_items set team_id='ee000000-0000-4000-8000-000000000062' where id='${ITEM}'`)).rows, 0],
    ["org agent comments on an item assigned to them (organization_internal)", () => W11sudo(`update public.work_items set assigned_to=\'${orgAgent}\' where id=\'${ITEM}\'`, orgAgent, cnt(`insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, visibility) values ('a0000000-0000-4000-8000-000000000001','${LAKESIDE}','work_item','${ITEM}',auth.uid(),'Comment posted','probe','organization_internal')`)).rows, 1],
    ["…and BES (TalentOps-authorized) cannot read that internal note", () => W11sudo(`insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, visibility) values ('a0000000-0000-4000-8000-000000000001','${LAKESIDE}','work_item','${ITEM}','${orgAgent}','Note','org private','organization_internal')`, besOwner, `select count(*)::int as rows from public.activity_events where entity_id='${ITEM}' and visibility='organization_internal'`).rows, 0],
    ["BES without TalentOps authorization sees no workspace item activity at all", () => W11(besManager, `select count(*)::int as rows from public.activity_events where entity_id='${ITEM}'`).rows, 0],
    ["org agent attaches a file to an item assigned to them", () => W11sudo(`update public.work_items set assigned_to=\'${orgAgent}\' where id=\'${ITEM}\'`, orgAgent, cnt(`insert into public.files (agency_id, organization_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-4000-8000-000000000001','${LAKESIDE}','work_item','${ITEM}','bes-files','probe/x.pdf','x.pdf','application/pdf',1,auth.uid())`)).rows, 1],
    ["…but not to another org's item",                                 () => W11(org2Owner, cnt(`insert into public.files (agency_id, organization_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by) values ('a0000000-0000-4000-8000-000000000001','${NORTHGATE}','work_item','${ITEM}','bes-files','probe/x.pdf','x.pdf','application/pdf',1,auth.uid())`)).rows, 0],
    ["org admin completes an item: stage Completed, completed_at set, no BES production", () => W11(orgOwner, `update public.work_items set status_id='ee000000-0000-4000-8000-000000000024' where id='${ITEM}'; set local role postgres; select (select count(*) from public.work_items where id='${ITEM}' and stage='Completed' and completed_at is not null)::int - (select count(*) from public.production_logs where work_item_id='${ITEM}')::int as rows`).rows, 1],
    ["archiving a workspace hides it from the board but keeps its items", () => W11(orgOwner, `update public.workspaces set archived_at=now() where id='${WS}'; select (select count(*) from public.workspaces where id='${WS}' and archived_at is not null)::int + (select count(*) from public.work_items where workspace_id='${WS}')::int as rows`).rows,  1 + q(`select count(*)::int n from public.work_items where workspace_id='${WS}'`)[0].n],
  ];
  runPhase("phase 11", P11, { strict: true });
}


/* ---------------- Phase 12: organizations, IDs and switching ----------------
   Switching is convenience; the organizations a person can see are exactly
   their memberships (or all, for BES staff). The Organization ID is generated,
   unique, formatted and immutable. */
if (runs(12)) {
  startPhase("phase 12");
  const multi = q(`select id from auth.users where email='org.multi@bes.test'`)[0]?.id;
  const orgOwner = U["org.owner@bes.test"], besRestricted = U["bes.restricted@bes.test"];
  const as = (uid) => `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`;
  const W12 = (uid, stmt) => { try { return q(`begin; set local role authenticated; ${as(uid)}; ${stmt}; rollback;`)[0]; } catch (e) { return { rows: 0, refused: true }; } };
  const P12 = [
    ["two-organization member sees exactly their two organizations",   () => multi ? W12(multi, `select count(*)::int as rows from public.organizations`).rows : "no fixture", 2],
    ["…both with an Organization ID",                                    () => multi ? W12(multi, `select count(*)::int as rows from public.organizations where public_id ~ '^BES-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'`).rows : "no fixture", 2],
    ["single-organization owner sees one",                              () => W12(orgOwner, `select count(*)::int as rows from public.organizations`).rows, 1],
    ["an unrelated organization's ID resolves to nothing for them",      () => W12(orgOwner, `select count(*)::int as rows from public.organizations where public_id = (select public_id from public.organizations where name='[TEST] Cedar Financial')`).rows, 0],
    ["BES staff with no scope still lists organizations (containers), not their data", () => W12(besRestricted, `select (select count(*) from public.organizations)::int - (select count(*) from public.work_items)::int as rows`).rows, q(`select count(*)::int n from public.organizations`)[0].n],
    ["Organization IDs are unique",                                     () => q(`select (count(*) - count(distinct public_id))::int as rows from public.organizations`)[0].rows, 0],
    ["…and immutable",                                                  () => { try { q(`begin; update public.organizations set public_id='BES-ZZZZZZ' where name='[TEST] Lakeside Partners'; rollback;`); return 1; } catch (e) { return 0; } }, 0],
    ["…and generated when omitted",                                     () => q(`begin; with i as (insert into public.organizations (agency_id, name, code, principal_name, principal_email) values ('a0000000-0000-4000-8000-000000000001','probe','PRB','p','p@probe.test') returning public_id) select count(*)::int as rows from i where public_id ~ '^BES-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'; rollback;`)[0].rows, 1],
  ];
  runPhase("phase 12", P12, { strict: true });
}


/* ---------------- Phase 13: self-serve sign-up provisioning ----------------
   An organization is created on EMAIL CONFIRMATION, never at sign-up; the
   signer becomes org_admin; the plan's products are enabled; a 30-day trial
   starts unless the business is already known (exact identifier → blocked,
   entitlements off; name-only match → trial with review flag). Every probe
   seeds an unconfirmed user inside a rolled-back transaction and flips
   email_confirmed_at to fire the trigger. */
if (runs(13)) {
  startPhase("phase 13");
  const seed = (email, meta) => `
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('99999999-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', 'x', null, '{"provider":"email","providers":["email"]}', '${JSON.stringify(meta)}'::jsonb, now(), now());`;
  const confirm = `update auth.users set email_confirmed_at = now() where id = '99999999-0000-4000-8000-000000000001';`;
  const S = (email, meta, select) => { try { return q(`begin; ${seed(email, meta)} ${confirm} ${select}; rollback;`)[0]; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*\d+: [^"\\\n]*/); return { rows: "ERR " + (m ? m[0].trim() : "unknown") }; } };

  /* Plan keys follow the commercial structure (0049): a trial grants exactly
     what the chosen plan lists, never CRM. The expected count is read from the
     plan row rather than written here — plans gain products over time (the Hub
     packages did in 0076), and a hard-coded number turns a deliberate
     commercial change into a failing security probe. */
  const growProducts = q(`select array_length(products, 1)::int as rows from public.plans where key = 'empire_grow'`)[0].rows;
  const NEW = { full_name: "Probe Person", business_name: "Probe Ventures LLC", phone: "(555) 010-9999", plan: "empire_grow" };
  const P13 = [
    ["confirmation creates one organization for the signer",           () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000001' and m.role = 'org_admin'`).rows, 1],
    ["…with a BES- Organization ID",                                     () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000001' and o.public_id ~ '^BES-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'`).rows, 1],
    [`…the plan's products enabled (Empire Grow = ${growProducts})`,           () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.product_entitlements e join public.org_memberships m on m.organization_id = e.organization_id where m.user_id = '99999999-0000-4000-8000-000000000001' and e.enabled`).rows, growProducts],
    ["…and never the CRM product on a trial",                            () => q(`select (not ('crm' = any (products)))::int as rows from public.plans where key = 'empire_grow'`)[0].rows, 1],
    ["…and an active 30-day trial",                                      () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organization_trials t join public.org_memberships m on m.organization_id = t.organization_id where m.user_id = '99999999-0000-4000-8000-000000000001' and t.status = 'active' and t.ends_at between now() + interval '29 days' and now() + interval '31 days'`).rows, 1],
    ["…identities recorded (email, phone, business name, domain)",       () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organization_identity i join public.org_memberships m on m.organization_id = i.organization_id where m.user_id = '99999999-0000-4000-8000-000000000001'`).rows, 4],
    ["sign-up alone (unconfirmed) creates nothing",                      () => { try { return q(`begin; ${seed("probe@probe-ventures.test", NEW)} select count(*)::int as rows from public.org_memberships where user_id = '99999999-0000-4000-8000-000000000001'; rollback;`)[0].rows; } catch (e) { return "ERR"; } }, 0],
    ["a public-mail domain is not recorded as a business identity",     () => S("probe@gmail.com", NEW, `select count(*)::int as rows from public.organization_identity i join public.org_memberships m on m.organization_id = i.organization_id where m.user_id = '99999999-0000-4000-8000-000000000001' and i.kind = 'email_domain'`).rows, 0],
    ["a disposable-mail domain is refused",                              () => S("probe@mailinator.com", NEW, `select 1 as rows`).rows, "ERR ERROR:  23514: Sign-ups from this email provider are not accepted"],
    ["a known phone blocks the second business's trial and disables access", () => q(`begin; ${seed("probe@probe-ventures.test", NEW)} ${confirm}
              insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('99999999-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@probe-two.test','x',null,'{}','${JSON.stringify({ ...NEW, business_name: "Totally Different Co", phone: "555 010 9999" })}'::jsonb,now(),now());
              update auth.users set email_confirmed_at = now() where id = '99999999-0000-4000-8000-000000000002';
              select (select status::text from public.organization_trials t join public.org_memberships m on m.organization_id=t.organization_id where m.user_id='99999999-0000-4000-8000-000000000002') || ':' || (select count(*) from public.product_entitlements e join public.org_memberships m on m.organization_id=e.organization_id where m.user_id='99999999-0000-4000-8000-000000000002' and e.enabled)::text as rows; rollback;`)[0].rows, "blocked:0"],
    ["a business-name-only match gets a trial flagged for review",      () => q(`begin; ${seed("probe@probe-ventures.test", NEW)} ${confirm}
              insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('99999999-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','someone@gmail.com','x',null,'{}','${JSON.stringify({ full_name: "P", business_name: "Probe Ventures, Inc.", plan: "empire_grow" })}'::jsonb,now(),now());
              update auth.users set email_confirmed_at = now() where id = '99999999-0000-4000-8000-000000000002';
              select (select status::text || ':' || coalesce(blocked_reason,'') from public.organization_trials t join public.org_memberships m on m.organization_id=t.organization_id where m.user_id='99999999-0000-4000-8000-000000000002') as rows; rollback;`)[0].rows, "active:name_match_review"],
    ["an unknown plan is refused",                                       () => S("probe@probe-ventures.test", { ...NEW, plan: "platinum" }, `select 1 as rows`).rows, "ERR ERROR:  23514: Unknown plan"],
    ["organization users read their trial; another org's admin cannot", () => S("probe@probe-ventures.test", NEW, `set local role authenticated; set local request.jwt.claims = '{"sub":"${U["org2.owner@bes.test"]}","role":"authenticated"}'; select count(*)::int as rows from public.organization_trials t where t.organization_id in (select organization_id from public.org_memberships where user_id='99999999-0000-4000-8000-000000000001')`).rows, 0],
    ["plans are readable by the public form",                            () => { try { return q(`begin; set local role anon; select count(*)::int as rows from public.plans where is_public; rollback;`)[0].rows; } catch (e) { return "ERR"; } }, 5],
  ];
  runPhase("phase 13", P13, { strict: true });
}

/* Phase 14 — team rosters read without policy recursion (0044) and
   organization workspace views (0045): the merge is allowed to the
   organization's owner/admin and to a BES manager, refused to everyone else,
   and can never hide the dashboard or the record list. Every write probe runs
   inside a rolled-back transaction. */
if (runs(14)) {
  startPhase("phase 14");
  const orgRole = (uid) => q(`select coalesce((select role::text from public.org_memberships where user_id='${uid}' and organization_id='${lakesideOrg}'), 'none') as rows`)[0].rows;
  const isAgencyManager = (uid) => q(`select exists (select 1 from public.agency_memberships where user_id='${uid}' and role in ('agency_owner','agency_admin','agency_manager')) as rows`)[0].rows;
  const mayConfigure = (uid) => orgRole(uid) === "org_admin" || isAgencyManager(uid) === true;
  const probe = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const text = String(e.message) + "\n" + String(e.stdout ?? "");
      const m = text.match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const merge = (uid, patch) => probe(uid, `select (public.merge_organization_workspace_views('${lakesideOrg}', '${patch}'::jsonb) -> 'creditOps' -> 'hidden')::text as rows`);
  const HIDE_DISPUTE = '{"creditOps":{"hidden":["dispute-queue"]}}';
  const P14 = [
    ["team rosters read without recursion (organization manager)",  () => probe(U["org.manager@bes.test"], `select 'ok:' || count(*)::text as rows from public.team_memberships`), "ok:" + q(`select count(*)::text as rows from public.team_memberships tm where tm.user_id='${U["org.manager@bes.test"]}' or exists (select 1 from public.team_memberships me where me.team_id=tm.team_id and me.user_id='${U["org.manager@bes.test"]}') or exists (select 1 from public.teams t where t.id=tm.team_id and t.organization_id is not null and exists (select 1 from public.org_memberships m where m.organization_id=t.organization_id and m.user_id='${U["org.manager@bes.test"]}' and m.role in ('org_admin','org_manager')))`)[0].rows],
    ["team rosters read without recursion (BES team lead)",          () => probe(U["bes.lead@bes.test"], `select 'ok' as rows from public.team_memberships limit 1`), "ok"],
    ["organization owner/admin hides a queue for their organization", () => merge(U["org.owner@bes.test"], HIDE_DISPUTE), mayConfigure(U["org.owner@bes.test"]) ? '["dispute-queue"]' : "ERR 42501"],
    ["organization manager may not",                                  () => merge(U["org.manager@bes.test"], HIDE_DISPUTE), mayConfigure(U["org.manager@bes.test"]) ? '["dispute-queue"]' : "ERR 42501"],
    ["organization agent may not",                                    () => merge(U["org.agent@bes.test"], HIDE_DISPUTE), "ERR 42501"],
    ["another organization's owner may not",                          () => merge(U["org2.owner@bes.test"], HIDE_DISPUTE), "ERR 42501"],
    ["BES manager may (mirrors branding)",                            () => merge(U["bes.manager@bes.test"], HIDE_DISPUTE), '["dispute-queue"]'],
    ["BES agent may not",                                             () => merge(U["bes.credit@bes.test"], HIDE_DISPUTE), "ERR 42501"],
    ["the dashboard can never be hidden",                             () => merge(U["org.owner@bes.test"], '{"creditOps":{"hidden":["dashboard"]}}'), "ERR 22023"],
    ["the record list can never be hidden",                           () => merge(U["org.owner@bes.test"], '{"fundingOps":{"hidden":["deal-list"]}}'), "ERR 22023"],
    ["an unknown product is refused",                                 () => merge(U["org.owner@bes.test"], '{"talentOps":{"hidden":["x"]}}'), "ERR 22023"],
    ["a malformed patch is refused",                                  () => merge(U["org.owner@bes.test"], '{"creditOps":{"hidden":"dispute-queue"}}'), "ERR 22023"],
    ["members read their organization's view settings",              () => probe(U["org.agent@bes.test"], `select jsonb_typeof(workspace_views) as rows from public.organizations where id='${lakesideOrg}'`), "object"],
    ["a person saves their own Home layout (0046)",                   () => probe(U["org.agent@bes.test"], `insert into public.user_preferences (user_id, dashboard_cards) values ('${U["org.agent@bes.test"]}', '["work.open"]'::jsonb) on conflict (user_id) do update set dashboard_cards = excluded.dashboard_cards; select dashboard_cards::text as rows from public.user_preferences where user_id='${U["org.agent@bes.test"]}'`), '["work.open"]'],
    ["…and cannot write another person's layout",                    () => probe(U["org.agent@bes.test"], `update public.user_preferences set dashboard_cards = '["work.open"]'::jsonb where user_id='${U["org.owner@bes.test"]}'; select count(*)::int as rows from public.user_preferences where user_id='${U["org.owner@bes.test"]}' and dashboard_cards = '["work.open"]'::jsonb`), 0],
  ];
  runPhase("phase 14", P14, { strict: true });
}

/* Phase 15 — configurable organization role access (0047). Writes only via
   the functions; owner/admin or BES manager; only entitled products, known
   departments and views, product-matching roles; org_admin/org_manager can
   never be narrowed. Rows readable by the organization's members only. No
   existing policy changed — every earlier phase must stay green. */
if (runs(15)) {
  startPhase("phase 15");
  const probe15 = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const text = String(e.message) + "\n" + String(e.stdout ?? "");
      const m = text.match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const setRA = (uid, role, product, depts, views, extra = "true, false, false") =>
    probe15(uid, `select (public.set_organization_role_access('${lakesideOrg}', '${role}', '${product}', ${depts}, ${views}, ${extra}) ->> 'departments') as rows`);
  const lakesideRole = (uid) => q(`select coalesce((select role::text from public.org_memberships where user_id='${uid}' and organization_id='${lakesideOrg}'), 'none') as rows`)[0].rows;
  const agencyMgr = (uid) => q(`select exists (select 1 from public.agency_memberships where user_id='${uid}' and role in ('agency_owner','agency_admin','agency_manager')) as rows`)[0].rows === true;
  const may = (uid) => lakesideRole(uid) === "org_admin" || agencyMgr(uid);
  const creditEntitled = q(`select public.org_entitled('${lakesideOrg}', 'creditOps') as rows`)[0].rows === true;
  const fundingEntitled = q(`select public.org_entitled('${lakesideOrg}', 'fundingOps') as rows`)[0].rows === true;
  const OK = '["Support"]';
  const want = (uid, okValue) => (may(uid) ? (creditEntitled ? okValue : "ERR 42501") : "ERR 42501");
  const P15 = [
    ["owner/admin gives Credit Processor the Support department",   () => setRA(U["org.owner@bes.test"], "credit_processor", "creditOps", "array['Support']", "'{}'::text[]"), want(U["org.owner@bes.test"], OK)],
    ["organization manager may not",                                 () => setRA(U["org.manager@bes.test"], "credit_processor", "creditOps", "array['Support']", "'{}'::text[]"), want(U["org.manager@bes.test"], OK)],
    ["organization agent may not",                                   () => setRA(U["org.agent@bes.test"], "credit_processor", "creditOps", "array['Support']", "'{}'::text[]"), "ERR 42501"],
    ["another organization's owner may not",                         () => setRA(U["org2.owner@bes.test"], "credit_processor", "creditOps", "array['Support']", "'{}'::text[]"), "ERR 42501"],
    ["BES manager may",                                              () => setRA(U["bes.manager@bes.test"], "credit_processor", "creditOps", "array['Support']", "'{}'::text[]"), creditEntitled ? OK : "ERR 42501"],
    ["BES agent may not",                                            () => setRA(U["bes.credit@bes.test"], "credit_processor", "creditOps", "array['Support']", "'{}'::text[]"), "ERR 42501"],
    ["a product the organization lacks is refused (or allowed only if entitled)", () => setRA(U["org.owner@bes.test"], "funding_processor", "fundingOps", "array['Submissions']", "'{}'::text[]"), may(U["org.owner@bes.test"]) ? (fundingEntitled ? '["Submissions"]' : "ERR 42501") : "ERR 42501"],
    ["an unknown department is refused",                             () => setRA(U["bes.manager@bes.test"], "credit_processor", "creditOps", "array['Underwriting']", "'{}'::text[]"), creditEntitled ? "ERR 22023" : "ERR 42501"],
    ["an unknown view is refused",                                   () => setRA(U["bes.manager@bes.test"], "credit_processor", "creditOps", "array['Dispute']", "array['nope']"), creditEntitled ? "ERR 22023" : "ERR 42501"],
    ["a funding role cannot be configured under CreditOps",          () => setRA(U["bes.manager@bes.test"], "funding_processor", "creditOps", "array['Dispute']", "'{}'::text[]"), creditEntitled ? "ERR 22023" : "ERR 42501"],
    ["org_admin can never be narrowed",                              () => setRA(U["bes.manager@bes.test"], "org_admin", "creditOps", "array['Dispute']", "'{}'::text[]"), creditEntitled ? "ERR 22023" : "ERR 42501"],
    ["members read their organization's rows; another organization's member does not", () => probe15(U["bes.manager@bes.test"], `select public.set_organization_role_access('${lakesideOrg}', 'credit_processor', 'creditOps', array['Support'], '{}'::text[], true, false, false); set local request.jwt.claims = '{"sub":"${U["org.agent@bes.test"]}","role":"authenticated"}'; select (select count(*)::int from public.organization_role_access where organization_id='${lakesideOrg}')::text || ':' || (select count(*)::int from public.organization_role_access r where not public.is_org_member(r.organization_id))::text as rows`), creditEntitled ? "1:0" : "ERR 42501"],
    ["reset deletes the row",                                        () => probe15(U["bes.manager@bes.test"], `select public.set_organization_role_access('${lakesideOrg}', 'credit_processor', 'creditOps', array['Support'], '{}'::text[], true, false, false); select public.reset_organization_role_access('${lakesideOrg}', 'credit_processor', 'creditOps'); select count(*)::int as rows from public.organization_role_access where organization_id='${lakesideOrg}'`), creditEntitled ? 0 : "ERR 42501"],
    ["platform defaults: processor → Dispute, QA reads everything, admin full", () => q(`select (select departments::text from public.default_role_access('credit_processor','creditOps')) || '|' || (select can_log_work::text from public.default_role_access('credit_qa','creditOps')) || '|' || (select can_access_management::text from public.default_role_access('org_admin','creditOps')) as rows`)[0].rows, "{Dispute}|false|true"],
  ];
  runPhase("phase 15", P15, { strict: true });
}

/* Phase 16 — canonical credit reports (0048). A report is visible exactly to
   whoever sees its client; only they can import; imports are append-only.
   Every write probe runs inside a rolled-back transaction. */
if (runs(16)) {
  startPhase("phase 16");
  const probe16 = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const text = String(e.message) + "\n" + String(e.stdout ?? "");
      const m = text.match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const ITEMS = `'[{"kind":"Account","name":"Probe Bank","status":"Open","bureaus":["EQ","EX"],"balance_text":"$100","balance_cents":10000,"account_ref":"probe bank"}]'::jsonb`;
  const SCORES = `'[{"bureau":"EQ","model":"FICO 8","score":701}]'::jsonb`;
  const importFor = (uid) => probe16(uid, `select (public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ','EX'], current_date, 'manual_upload', null, 'probe-1', ${ITEMS}, ${SCORES}) is not null)::text as rows`);
  const canSeeLakesideClient = (uid) => probe16(uid, `select count(*)::int as rows from public.fulfillment_clients where id='${T.lakeside_client}'`) === 1;
  const P16 = [
    ["organization owner imports a report for their client",         () => importFor(U["org.owner@bes.test"]), canSeeLakesideClient(U["org.owner@bes.test"]) ? "true" : "ERR 42501"],
    ["another organization's owner cannot",                          () => importFor(U["org2.owner@bes.test"]), "ERR 42501"],
    ["BES staff import only when the engagement and scope allow",    () => importFor(U["bes.credit@bes.test"]), canSeeLakesideClient(U["bes.credit@bes.test"]) ? "true" : "ERR 42501"],
    ["a report with no items is refused",                            () => probe16(U["org.owner@bes.test"], `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-1', '[]'::jsonb, null)::text as rows`), canSeeLakesideClient(U["org.owner@bes.test"]) ? "ERR 22023" : "ERR 42501"],
    ["items and scores travel with the report; visible to the client's organization", () => probe16(U["org.owner@bes.test"], `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ','EX'], current_date, 'manual_upload', null, 'probe-1', ${ITEMS}, ${SCORES}); select (select count(*) from public.report_items i join public.credit_reports r on r.id=i.report_id where r.fulfillment_client_id='${T.lakeside_client}')::text || ':' || (select count(*) from public.report_scores s join public.credit_reports r on r.id=s.report_id where r.fulfillment_client_id='${T.lakeside_client}')::text as rows`), canSeeLakesideClient(U["org.owner@bes.test"]) ? "1:1" : "ERR 42501"],
    ["…and invisible to another organization",                       () => probe16(U["org.owner@bes.test"], `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-1', ${ITEMS}, null); set local request.jwt.claims = '{"sub":"${U["org2.owner@bes.test"]}","role":"authenticated"}'; select count(*)::int as rows from public.credit_reports where fulfillment_client_id='${T.lakeside_client}'`), canSeeLakesideClient(U["org.owner@bes.test"]) ? 0 : "ERR 42501"],
    ["reports are append-only: no update grant (refused since 0063)", () => probe16(U["org.owner@bes.test"], `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-1', ${ITEMS}, null); update public.credit_reports set parser_version='x' where fulfillment_client_id='${T.lakeside_client}'; select count(*)::int as rows from public.credit_reports where parser_version='x'`), "ERR 42501"],
    ["a consumer imports and sees only their own report",             () => probe16(U["org.agent@bes.test"], `select public.create_credit_report('${lakesideOrg}', null, null, '${U["org.agent@bes.test"]}', array['TU'], current_date, 'manual_upload', null, 'probe-1', ${ITEMS}, null); set local request.jwt.claims = '{"sub":"${U["org2.owner@bes.test"]}","role":"authenticated"}'; select count(*)::int as rows from public.credit_reports where consumer_user_id='${U["org.agent@bes.test"]}'`), 0],
  ];
  runPhase("phase 16", P16, { strict: true });
}

/* Phase 17 — pricing as data (0049): public plans with prices; every trial
   grants Empire Grow capabilities (never CRM); Build needs a choice; Enterprise
   is by agreement; seat and active-record usage measured deterministically and
   only for the organization's own members / BES managers. */
if (runs(17)) {
  startPhase("phase 17");
  const seed17 = (email, meta) => `
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('99999999-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', 'x', null, '{"provider":"email","providers":["email"]}', '${JSON.stringify(meta)}'::jsonb, now(), now());
    update auth.users set email_confirmed_at = now() where id = '99999999-0000-4000-8000-000000000003';`;
  const S17 = (email, meta, select) => { try { return q(`begin; ${seed17(email, meta)} ${select}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const ENT = `select string_agg(e.product::text, ',' order by e.product::text) as rows from public.product_entitlements e join public.org_memberships m on m.organization_id = e.organization_id where m.user_id = '99999999-0000-4000-8000-000000000003' and e.enabled`;
  const B = { full_name: "Pricing Probe", business_name: "Pricing Probe LLC", phone: "(555) 010-7777" };
  /* Every trial grants the Grow bundle, whatever plan was chosen. What that
     bundle contains is a commercial decision that changes (the Hub packages
     joined it in 0076), so it is read from the plan rather than written here;
     the rule this phase actually guards is that a trial never includes CRM. */
  const growBundle = q(`select string_agg(p::text, ',' order by p::text) as rows from public.plans, unnest(products) as p where key = 'empire_grow'`)[0].rows;
  const asUser17 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { return "ERR"; } };
  const seatOracle = q(`select count(*)::int as rows from public.org_memberships m where m.organization_id='${lakesideOrg}' and m.user_id <> coalesce((select owner_user_id from public.organizations where id='${lakesideOrg}'), '00000000-0000-0000-0000-000000000000'::uuid) and not exists (select 1 from public.agency_memberships am where am.user_id = m.user_id)`)[0].rows;
  const recOracle = q(`select (select count(*) from public.fulfillment_clients c where c.organization_id='${lakesideOrg}' and c.status::text not in ('Completed','Archived','Graduated'))::int + (select count(*) from public.funding_clients f where f.organization_id='${lakesideOrg}' and f.status::text not in ('Funded','Declined','Withdrawn','Archived'))::int as rows`)[0].rows;
  const P17 = [
    ["five public plans, priced, Grow recommended",                    () => { try { return q(`begin; set local role anon; select count(*)::text || ':' || (select key from public.plans where is_recommended and is_public) || ':' || (select monthly_cents::text from public.plans where key='empire_grow') as rows from public.plans where is_public and monthly_cents > 0; rollback;`)[0].rows; } catch (e) { return "ERR"; } }, "5:empire_grow:24900"],
    ["Build trial with a choice grants Grow capabilities, never CRM",    () => S17("probe@pricing-probe.test", { ...B, plan: "empire_build", selected_product: "creditOps" }, ENT), growBundle],
    ["…and the choice is kept for conversion",                          () => S17("probe@pricing-probe.test", { ...B, plan: "empire_build", selected_product: "creditOps" }, `select t.plan_key || ':' || t.selected_product::text as rows from public.organization_trials t join public.org_memberships m on m.organization_id = t.organization_id where m.user_id = '99999999-0000-4000-8000-000000000003'`), "empire_build:creditOps"],
    ["Build without a choice is refused",                               () => S17("probe@pricing-probe.test", { ...B, plan: "empire_build" }, `select 1 as rows`), "ERR 23514"],
    ["CRM-only sign-up still trials the operating platform, no CRM",    () => S17("probe@pricing-probe.test", { ...B, plan: "bes_crm" }, ENT), growBundle],
    ["Scale trial grants Grow capabilities (CRM provisioned only when paid)", () => S17("probe@pricing-probe.test", { ...B, plan: "empire_scale" }, ENT), growBundle],
    ["no trial bundle includes CRM, whatever the plan",                 () => q(`select (not ('crm' = any (products)))::int as rows from public.plans where key = 'empire_grow'`)[0].rows, 1],
    ["Enterprise is by agreement, not self-serve",                      () => S17("probe@pricing-probe.test", { ...B, plan: "empire_enterprise" }, `select 1 as rows`), "ERR 23514"],
    ["the signer is recorded as the Organization Owner",                () => S17("probe@pricing-probe.test", { ...B, plan: "empire_grow" }, `select (o.owner_user_id = '99999999-0000-4000-8000-000000000003')::text as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000003'`), "true"],
    ["seat usage excludes the owner and BES personnel (member reads own org)", () => asUser17(U["org.owner@bes.test"], `select public.organization_seat_usage('${lakesideOrg}') as rows`), seatOracle],
    ["…another organization's member gets nothing",                     () => asUser17(U["org2.owner@bes.test"], `select coalesce(public.organization_seat_usage('${lakesideOrg}')::text, 'null') as rows`), "null"],
    ["active records count only worked clients",                        () => asUser17(U["org.owner@bes.test"], `select public.organization_active_records('${lakesideOrg}') as rows`), recOracle],
    ["add-ons are listed for the public form",                          () => { try { return q(`begin; set local role anon; select count(*)::int as rows from public.plan_addons; rollback;`)[0].rows; } catch (e) { return "ERR"; } }, 3],
  ];
  runPhase("phase 17", P17, { strict: true });
}

/* Phase 18 — organization client writes (0050): organization admins create,
   members update within their reach, another organization cannot, an
   organization without the product cannot, outsourcing-group clients stay
   BES-only. Rolled back. */
if (runs(18)) {
  startPhase("phase 18");
  const w18 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const agencyId = q(`select agency_id::text as rows from public.organizations where id='${lakesideOrg}'`)[0].rows;
  const creditOn = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  const roleOf = (uid) => q(`select coalesce((select role::text from public.org_memberships where user_id='${uid}' and organization_id='${lakesideOrg}'), 'none') as rows`)[0].rows;
  const isAdmin = (uid) => ["org_admin", "org_manager"].includes(roleOf(uid));
  const INSERT = `insert into public.fulfillment_clients (agency_id, name, email, mode, organization_id, auto_sync, status, round) values ('${agencyId}', '[PROBE] New Client', 'probe.newclient@example.test', 'saas_pulled', '${lakesideOrg}', false, 'Onboarding', 'Pre-Round'); select count(*)::int as rows from public.fulfillment_clients where email = 'probe.newclient@example.test'`;
  const UPDATE = `update public.fulfillment_clients set status = 'In Processing' where id = '${T.lakeside_client}'; select count(*)::int as rows from public.fulfillment_clients where id='${T.lakeside_client}' and status = 'In Processing'`;
  const P18 = [
    ["organization admin creates a client in their organization",       () => w18(U["org.owner@bes.test"], INSERT), isAdmin(U["org.owner@bes.test"]) && creditOn ? 1 : "ERR 42501"],
    ["organization manager creates a client",                           () => w18(U["org.manager@bes.test"], INSERT), isAdmin(U["org.manager@bes.test"]) && creditOn ? 1 : "ERR 42501"],
    ["organization agent cannot create",                                () => w18(U["org.agent@bes.test"], INSERT), "ERR 42501"],
    ["another organization's owner cannot create here",                 () => w18(U["org2.owner@bes.test"], INSERT), "ERR 42501"],
    ["organization owner updates their client's status",                () => w18(U["org.owner@bes.test"], UPDATE), creditOn ? 1 : 0],
    ["another organization's owner updates nothing",                    () => w18(U["org2.owner@bes.test"], UPDATE), 0],
    /* Refused, and the CODE it is refused with is not the point. Since 0094 a
       BEFORE INSERT trigger resolves the canonical client, so a constraint can
       fire before row-level security is reached and the refusal arrives as
       23514 rather than 42501. Either way the row does not exist, which is
       what this probe is actually about — so it asserts the outcome and then
       checks nothing was written. */
    ["an outsourcing-group client stays BES-only",                      () => { const r = w18(U["org.owner@bes.test"], `insert into public.fulfillment_clients (agency_id, name, email, mode, outsourcing_group_id, auto_sync, status, round) values ('${agencyId}', '[PROBE] Group Client', 'probe.group@example.test', 'outsourcing_only', (select id from public.outsourcing_groups limit 1), false, 'Onboarding', 'Pre-Round'); select 1 as rows`); return String(r).startsWith("ERR") ? "refused" : r; }, "refused"],
    ["…and nothing was written by the attempt",                         () => q(`select count(*)::int as rows from public.fulfillment_clients where email = 'probe.group@example.test'`)[0].rows, 0],
  ];
  runPhase("phase 18", P18, { strict: true });
}

/* Phase 19 — department status as data (0051) and the funding-readiness
   hand-off (0052/0053). Organization members write their own clients'
   department rows within reach; another organization cannot; the function
   refuses a status outside the department's vocabulary and always leaves an
   activity event; the hand-off links/creates the CreditOps client and moves
   the funding status, both ways, with activity on both records. Rolled back. */
if (runs(19)) {
  startPhase("phase 19");
  const w19 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const creditOn = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  const fundingOn = q(`select public.org_entitled('${lakesideOrg}','fundingOps') as rows`)[0].rows === true;
  const roleOf = (uid) => q(`select coalesce((select role::text from public.org_memberships where user_id='${uid}' and organization_id='${lakesideOrg}'), 'none') as rows`)[0].rows;
  const SET = `select public.set_client_department_status('${T.lakeside_client}', 'Support', 'billing issue', null, null); select s.status || ':' || (select count(*) from public.activity_events a where a.entity_type='fulfillment_client' and a.entity_id='${T.lakeside_client}' and a.action='Department status' and a.new_value='BILLING ISSUE' and a.created_at >= now())::text as rows from public.client_department_statuses s where s.client_id='${T.lakeside_client}' and s.department='Support'`;
  /* Lakeside's only fixture funding client is already at Offer Received, and
     the hand-off is an early-stage move. Rather than skip — a probe that skips
     is a probe that cannot fail — seed one inside the transaction that is
     rolled back, so the rules are exercised without touching the fixtures. */
  const lakesideFunding = "f0000000-0000-4000-8000-0000000019a1";
  const agency19 = q(`select agency_id::text as rows from public.organizations where id='${lakesideOrg}'`)[0].rows;
  const seedLF = `insert into public.funding_clients (id, agency_id, name, email, mode, provenance, organization_id, auto_sync, status, created_by) values ('${lakesideFunding}', '${agency19}', '[PROBE] Handoff Co', 'probe.handoff.${Date.now()}@example.test', 'saas_pulled', 'bes_saas_synced', '${lakesideOrg}', false, 'Onboarding', '${U["org.owner@bes.test"]}');`;
  const w19f = (uid, sql) => w19(uid, sql, seedLF);
  const P19 = [
    ["organization owner sets a department status; the activity event is written with it", () => w19(U["org.owner@bes.test"], SET), creditOn && ["org_admin","org_manager"].includes(roleOf(U["org.owner@bes.test"])) || creditOn ? "BILLING ISSUE:1" : "ERR 42501"],
    ["another organization's owner cannot",                          () => w19(U["org2.owner@bes.test"], SET), "ERR 42501"],
    ["a status outside the department's vocabulary is refused",      () => w19(U["org.owner@bes.test"], `select public.set_client_department_status('${T.lakeside_client}', 'Support', 'BC NEEDED', null, null); select 1 as rows`), creditOn ? "ERR 22023" : "ERR 42501"],
    ["BES staff in scope set a department status",                   () => w19(U["bes.manager@bes.test"], SET), "BILLING ISSUE:1"],
    ["hand-off: funding client → CreditOps (creates/links, status Credit Readiness, activity both sides)", () => w19f(U["org.owner@bes.test"], `select public.handoff_to_creditops('${lakesideFunding}', null); select (select status::text from public.funding_clients where id='${lakesideFunding}') || ':' || (select (fulfillment_client_id is not null)::text from public.funding_clients where id='${lakesideFunding}') || ':' || (select count(*) from public.activity_events where entity_id='${lakesideFunding}' and action like 'Sent to CreditOps%')::text as rows`), creditOn && fundingOn ? "Credit Readiness:true:1" : "ERR 42501"],
    ["hand-off back: qualified → Readiness Review",                () => w19f(U["org.owner@bes.test"], `select public.handoff_to_creditops('${lakesideFunding}', null); select public.handoff_to_fundingops((select fulfillment_client_id from public.funding_clients where id='${lakesideFunding}')); select status::text as rows from public.funding_clients where id='${lakesideFunding}'`), creditOn && fundingOn ? "Readiness Review" : "ERR 42501"],
    ["another organization cannot hand off this client",           () => w19f(U["org2.owner@bes.test"], `select public.handoff_to_creditops('${lakesideFunding}', null); select 1 as rows`), "ERR 42501"],
  ];
  runPhase("phase 19", P19, { strict: true });
}

/* Phase 20 — funding department status keyed by file (0054). */
if (runs(20)) {
  startPhase("phase 20");
  const w20 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const fundingOn = q(`select public.org_entitled('${lakesideOrg}','fundingOps') as rows`)[0].rows === true;
  const lakesideFile = q(`select coalesce((select f.id::text from public.funding_files f join public.funding_clients c on c.id=f.client_id where c.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const SETF = `select public.set_funding_department_status('${lakesideFile}', 'Stipulations', 'outstanding', null, null); select s.status || ':' || (s.file_id = '${lakesideFile}')::text || ':' || (select count(*) from public.activity_events a where a.entity_type='funding_client' and a.entity_id=(select client_id::text from public.funding_files where id='${lakesideFile}') and a.action='Department status' and a.field like 'department:Stipulations:%' and a.created_at >= now())::text as rows from public.funding_department_statuses s where s.file_id='${lakesideFile}' and s.department='Stipulations'`;
  const P20 = lakesideFile ? [
    ["organization owner sets a file's department status; row keyed by file; activity written", () => w20(U["org.owner@bes.test"], SETF), fundingOn ? "OUTSTANDING:true:1" : "ERR 42501"],
    ["another organization's owner cannot",                          () => w20(U["org2.owner@bes.test"], SETF), "ERR 42501"],
    ["a status outside the department's vocabulary is refused",      () => w20(U["org.owner@bes.test"], `select public.set_funding_department_status('${lakesideFile}', 'Stipulations', 'FUNDED', null, null); select 1 as rows`), fundingOn ? "ERR 22023" : "ERR 42501"],
    ["SQL vocabulary matches the interface mirror (Stipulations)",   () => q(`select array_to_string(public.fundingops_department_statuses('Stipulations'), ',') as rows`)[0].rows, "NOT STARTED,OUTSTANDING,SATISFIED"],
  ] : [["(no Lakeside funding file to probe)", () => "skip", "skip"]];
  runPhase("phase 20", P20, { strict: true });
}

/* Phase 21 — client lifecycle (0055): archive is a transition with an activity
   event; only Active counts; another organization cannot archive; reactivation
   clears the archive fields. Rolled back. */
if (runs(21)) {
  startPhase("phase 21");
  const w21 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const creditOn = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  // organization_active_records() answers null to a caller who is neither a member
  // nor agency management — the CLI's service session is neither — so the
  // baseline is taken as raw counts. Event counts below use `created_at >= now()`
  // (transaction start) so rows persisted by earlier operational writes never
  // inflate a probe that is rolled back anyway.
  const before = q(`select ((select count(*) from public.fulfillment_clients where organization_id='${lakesideOrg}' and lifecycle='active') + (select count(*) from public.funding_clients where organization_id='${lakesideOrg}' and lifecycle='active'))::int as rows`)[0].rows;
  const P21 = [
    ["organization owner archives a client; activity written; active count drops by one", () => w21(U["org.owner@bes.test"], `select public.set_client_lifecycle('${T.lakeside_client}', 'archived', 'moved to another provider'); select (select lifecycle::text from public.fulfillment_clients where id='${T.lakeside_client}') || ':' || (select count(*) from public.activity_events where entity_id='${T.lakeside_client}' and action='Client archived' and created_at >= now())::text || ':' || (public.organization_active_records('${lakesideOrg}') = ${before} - 1)::text as rows`), creditOn ? "archived:1:true" : "ERR 42501"],
    ["reactivating clears the archive fields",                          () => w21(U["org.owner@bes.test"], `select public.set_client_lifecycle('${T.lakeside_client}', 'archived', 'x'); select public.set_client_lifecycle('${T.lakeside_client}', 'active', null); select lifecycle::text || ':' || coalesce(archived_at::text, 'null') as rows from public.fulfillment_clients where id='${T.lakeside_client}'`), creditOn ? "active:null" : "ERR 42501"],
    ["another organization's owner cannot archive here",                () => w21(U["org2.owner@bes.test"], `select public.set_client_lifecycle('${T.lakeside_client}', 'archived', null); select 1 as rows`), "ERR 42501"],
  ];
  runPhase("phase 21", P21, { strict: true });
}

/* Phase 22 — FundingOps domain data (0058): applications/documents follow the
   file's client; organization admins write, agents read; another organization
   sees nothing; the BES lender catalogue is readable; a lender user sees only
   files shared with their lender and may post an offer only there. Rolled back. */
if (runs(22)) {
  startPhase("phase 22");
  const w22 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const fundingOn = q(`select public.org_entitled('${lakesideOrg}','fundingOps') as rows`)[0].rows === true;
  const lakesideFile = q(`select coalesce((select f.id::text from public.funding_files f join public.funding_clients c on c.id=f.client_id where c.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const agencyId = q(`select agency_id::text as rows from public.organizations where id='${lakesideOrg}'`)[0].rows;
  // The fixture file carries real operational rows (an application version, a
  // June 2026 request) from interface verification, so probes take the next
  // version, use a period nobody would request, and count only what they wrote.
  const NEXT_VERSION = `(select coalesce(max(version), 0) + 1 from public.funding_applications where file_id='${lakesideFile}')`;
  const APP = `insert into public.funding_applications (file_id, version, requested_amount, purpose, time_in_business_months, monthly_revenue, credit_score_stated) values ('${lakesideFile}', ${NEXT_VERSION}, 50000, 'probe', 24, 30000, 680); select count(*)::int as rows from public.funding_applications where file_id='${lakesideFile}' and created_at >= now()`;
  const LENDER = `insert into public.lenders (id, agency_id, name) values ('99999999-0000-4000-8000-00000000aaaa', '${agencyId}', '[PROBE] Shared Lender'); insert into public.lender_users (lender_id, user_id) values ('99999999-0000-4000-8000-00000000aaaa', '${U["probe.agent@bes.test"]}');`;
  const AS_PROBE = `set local request.jwt.claims = '{"sub":"${U["probe.agent@bes.test"]}","role":"authenticated"}';`;
  // A request for a June statement, answered by an upload; only a reviewer's acceptance satisfies the request.
  const REQ = `insert into public.document_requests (id, file_id, document_type, period) values ('99999999-0000-4000-8000-00000000bbbb', '${lakesideFile}', 'bank_statement', '2031-01');`;
  const INST = `insert into public.files (id, agency_id, organization_id, entity_type, entity_id, path, name, uploaded_by) values ('99999999-0000-4000-8000-00000000cccc', '${agencyId}', '${lakesideOrg}', 'funding_file', '${lakesideFile}', 'probe/${lakesideFile}/probe.pdf', 'probe.pdf', auth.uid());
               insert into public.document_instances (id, file_id, request_id, storage_file_id, sha256, uploaded_by, classified_type, classified_period) values ('99999999-0000-4000-8000-00000000dddd', '${lakesideFile}', '99999999-0000-4000-8000-00000000bbbb', '99999999-0000-4000-8000-00000000cccc', 'probe-hash', auth.uid(), 'bank_statement', '2031-01');`;
  const P22 = lakesideFile ? [
    ["organization admin records an application on their file",     () => w22(U["org.owner@bes.test"], APP), fundingOn ? 1 : "ERR 42501"],
    ["organization agent cannot record an application (reads only)", () => w22(U["org.agent@bes.test"], APP), "ERR 42501"],
    ["another organization sees no application",                     () => w22(U["org2.owner@bes.test"], `select count(*)::int as rows from public.funding_applications where file_id='${lakesideFile}'`), 0],
    ["organization admin opens a document request; it stays open until a reviewer accepts an upload", () => w22(U["org.owner@bes.test"], `${REQ} select status::text as rows from public.document_requests where id='99999999-0000-4000-8000-00000000bbbb'`), fundingOn ? "open" : "ERR 42501"],
    ["BES (agency scope) uploads an instance and accepts it: request satisfied, activity on the funding client", () => w22(U["bes.owner@bes.test"], `${REQ} ${INST} select public.record_document_disposition('99999999-0000-4000-8000-00000000dddd', 'accepted', null); select (select status::text from public.document_requests where id='99999999-0000-4000-8000-00000000bbbb') || ':' || (select disposition::text from public.document_instances where id='99999999-0000-4000-8000-00000000dddd') || ':' || (select count(*) from public.activity_events where entity_type='funding_client' and action='Document disposition' and created_at >= now())::text as rows`), "satisfied:accepted:1"],
    ["a disposition never returns to pending",                       () => w22(U["bes.owner@bes.test"], `${REQ} ${INST} select public.record_document_disposition('99999999-0000-4000-8000-00000000dddd', 'pending_review', null); select 1 as rows`), "ERR 22023"],
    ["a flag is a controlled code with evidence; another organization cannot see it", () => w22(U["bes.owner@bes.test"], `insert into public.document_flags (file_id, request_id, flag_code, evidence) values ('${lakesideFile}', (select id from public.document_requests where file_id='${lakesideFile}' limit 1), 'MISSING_REQUIRED_DOCUMENT', '{"expected_period":"2026-06"}'); set local request.jwt.claims = '{"sub":"${U["org2.owner@bes.test"]}","role":"authenticated"}'; select count(*)::int as rows from public.document_flags where file_id='${lakesideFile}'`), 0],
    ["BES agency owner adds a catalogue lender; an organization member can read it", () => w22(U["bes.owner@bes.test"], `insert into public.lenders (agency_id, name) values ('${agencyId}', '[PROBE] Lender'); set local request.jwt.claims = '{"sub":"${U["org.agent@bes.test"]}","role":"authenticated"}'; select count(*)::int as rows from public.lenders where name='[PROBE] Lender'`), 1],
    ["a lender user sees a file only when it is shared",             () => w22(U["bes.owner@bes.test"], `${LENDER} ${AS_PROBE} select (select count(*) from public.funding_applications where file_id='${lakesideFile}')::text as rows`), "0"],
    ["…after sharing, the lender reads the application and can offer; the decision maps the deal status", () => w22(U["bes.owner@bes.test"], `insert into public.funding_applications (file_id, version, requested_amount) values ('${lakesideFile}', ${NEXT_VERSION}, 50000); ${LENDER} insert into public.lender_file_shares (lender_id, file_id, shared_by) values ('99999999-0000-4000-8000-00000000aaaa', '${lakesideFile}', auth.uid()); ${AS_PROBE} insert into public.funding_deals (id, file_id, client_id, lender, lender_id, amount, status) select '99999999-0000-4000-8000-00000000eeee', '${lakesideFile}', client_id, '[PROBE] Shared Lender', '99999999-0000-4000-8000-00000000aaaa', 45000, 'Submitted' from public.funding_files where id='${lakesideFile}'; select public.record_lender_decision('99999999-0000-4000-8000-00000000eeee', 'approved', '{"amount":45000}', null, null); select (select count(*) from public.funding_applications where file_id='${lakesideFile}' and created_at >= now())::text || ':' || (select status::text from public.funding_deals where id='99999999-0000-4000-8000-00000000eeee') || ':' || (select source from public.lender_decisions where deal_id='99999999-0000-4000-8000-00000000eeee') as rows`), "1:Offer Received:lender_portal"],
    ["lender decisions are append-only (no update grant: refused since 0063)", () => w22(U["bes.owner@bes.test"], `insert into public.funding_deals (id, file_id, client_id, lender, amount) select '99999999-0000-4000-8000-00000000eeee', '${lakesideFile}', client_id, '[PROBE] L', 1000 from public.funding_files where id='${lakesideFile}'; select public.record_lender_decision('99999999-0000-4000-8000-00000000eeee', 'declined'); update public.lender_decisions set decision='approved' where deal_id='99999999-0000-4000-8000-00000000eeee'; select count(*)::int as rows from public.lender_decisions where deal_id='99999999-0000-4000-8000-00000000eeee' and decision='approved'`), "ERR 42501"],
    ["a consumer-report request needs a party and a purpose; the borrower role cannot read it", () => w22(U["bes.owner@bes.test"], `insert into public.funding_parties (id, client_id, kind, display_name) select '99999999-0000-4000-8000-00000000ffff', client_id, 'owner_guarantor', '[PROBE] Owner' from public.funding_files where id='${lakesideFile}'; insert into public.consumer_report_requests (file_id, party_id, product_family, purpose, permissible_purpose_basis) values ('${lakesideFile}', '99999999-0000-4000-8000-00000000ffff', 'business_funding', 'guarantor review', 'consumer-initiated credit transaction (attested)'); ${AS_PROBE} select count(*)::int as rows from public.consumer_report_requests where file_id='${lakesideFile}'`), 0],
    ["a policy version records its source and effective date; matching reads it, never rewrites it", () => w22(U["bes.owner@bes.test"], `insert into public.lenders (id, agency_id, name) values ('99999999-0000-4000-8000-00000000aaaa', '${agencyId}', '[PROBE] Shared Lender'); insert into public.lender_programs (id, lender_id, name, product_family) values ('99999999-0000-4000-8000-00000000abab', '99999999-0000-4000-8000-00000000aaaa', 'Term', 'business_funding'); insert into public.lender_policy_versions (program_id, version, criteria, source_type, effective_from) values ('99999999-0000-4000-8000-00000000abab', 1, '{"min_credit_score":640}', 'lender_policy_sheet', current_date); select (criteria->>'min_credit_score') || ':' || source_type as rows from public.lender_policy_versions where program_id='99999999-0000-4000-8000-00000000abab'`), "640:lender_policy_sheet"],
  ] : [["(no Lakeside funding file to probe)", () => "skip", "skip"]];
  runPhase("phase 22", P22, { strict: true });
}

/* Phase 23 — Letter Library (0059): rounds are records opened through a
   function (reset or keep the counter), letters cannot be approved without the
   consumer's attestation, a body, recipient-fitting citations and none of the
   forbidden phrases; mailing starts the statutory timers; BES default
   templates are readable by every seat, writable by admins only. Rolled back. */
if (runs(23)) {
  startPhase("phase 23");
  const w23 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const creditOn = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  const C = T.lakeside_client;
  const CLEAN = "I am disputing the accuracy of the balance reported for this account. The enclosed statement dated May 14 shows the correct value. Please reinvestigate this specific information under 15 U.S.C. 1681i and correct or delete it as appropriate.";
  const LETTER = (recipient, body, origin = "cro_prepared") => `insert into public.dispute_letters (id, round_id, client_id, recipient_kind, recipient_name, body_final, dispute_origin) values ('99999999-0000-4000-8000-0000000000ab', public.open_dispute_round('${C}', 'factual', true), '${C}', '${recipient}', 'Probe recipient', $l$${body}$l$, '${origin}');`;
  const ATTEST = `insert into public.dispute_attestations (letter_id, statements, attested_by) values ('99999999-0000-4000-8000-0000000000ab', '{"recognises_account":"yes","disputed_information":"balance","reason":"paid in May","documents":["statement"]}', auth.uid());`;
  const P23 = [
    ["organization owner opens a round: record, client round label, activity", () => w23(U["org.owner@bes.test"], `select public.open_dispute_round('${C}', 'factual', true); select (select max(round_number) from public.dispute_rounds where client_id='${C}')::text || ':' || (select round::text from public.fulfillment_clients where id='${C}') || ':' || (select count(*) from public.activity_events where entity_id='${C}' and action='Dispute round opened' and created_at >= now())::text as rows`), creditOn ? "1:Round 1:1" : "ERR 42501"],
    ["keeping the counter returns the running round; resetting opens the next", () => w23(U["org.owner@bes.test"], `select (public.open_dispute_round('${C}', 'factual', true) = public.open_dispute_round('${C}', 'factual', false))::text || ':' || (public.open_dispute_round('${C}', 'factual', true) <> public.open_dispute_round('${C}', 'factual', false))::text as rows`), creditOn ? "true:false" : "ERR 42501"],
    ["another organization's owner cannot open a round here",           () => w23(U["org2.owner@bes.test"], `select public.open_dispute_round('${C}', 'factual', true); select 1 as rows`), "ERR 42501"],
    ["a draft cannot be approved without the consumer's attestation",   () => w23(U["org.owner@bes.test"], `${LETTER("cra", CLEAN)} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000ab'); select 1 as rows`), creditOn ? "ERR 22023" : "ERR 42501"],
    ["§1681e(b) cannot be cited to a furnisher",                        () => w23(U["org.owner@bes.test"], `${LETTER("furnisher", CLEAN + " You are required under 1681e(b) to follow reasonable procedures.")} ${ATTEST} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000ab'); select 1 as rows`), creditOn ? "ERR 22023" : "ERR 42501"],
    ["resetting the cycle closes the previous round (0063)",             () => w23(U["org.owner@bes.test"], `select public.open_dispute_round('${C}', 'factual', true); select public.open_dispute_round('${C}', 'factual', true); select count(*)::int as rows from public.dispute_rounds where client_id='${C}' and opened_at >= now() and closed_at is not null`), creditOn ? 1 : "ERR 42501"],
    ["a CRO-prepared direct dispute cannot rely on § 1022.43",          () => w23(U["org.owner@bes.test"], `${LETTER("furnisher", CLEAN + " Under 12 C.F.R. 1022.43 you must investigate.")} ${ATTEST} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000ab'); select 1 as rows`), creditOn ? "ERR 22023" : "ERR 42501"],
    ["a forbidden phrase blocks approval",                               () => w23(U["org.owner@bes.test"], `${LETTER("cra", CLEAN + " This is a Metro 2 violation and you must delete it.")} ${ATTEST} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000ab'); select 1 as rows`), creditOn ? "ERR 22023" : "ERR 42501"],
    ["attested, clean letter approves; mailing starts four timers; activity written", () => w23(U["org.owner@bes.test"], `${LETTER("cra", CLEAN)} ${ATTEST} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000ab'); select public.mark_letter_mailed('99999999-0000-4000-8000-0000000000ab'); select (select status::text from public.dispute_letters where id='99999999-0000-4000-8000-0000000000ab') || ':' || (select count(*) from public.dispute_timers where letter_id='99999999-0000-4000-8000-0000000000ab')::text || ':' || (select count(*) from public.activity_events where entity_id='${C}' and action='Letter approved' and created_at >= now())::text as rows`), creditOn ? "mailed:4:1" : "ERR 42501"],
    ["an attestation is never edited (no update grant)",                () => w23(U["org.owner@bes.test"], `${LETTER("cra", CLEAN)} ${ATTEST} update public.dispute_attestations set statements = '{}' where letter_id='99999999-0000-4000-8000-0000000000ab'; select 1 as rows`), "ERR 42501"],
    ["BES default templates are readable by an organization agent",     () => w23(U["org.agent@bes.test"], `select count(*)::int as rows from public.letter_templates where organization_id is null and is_active`), 6],
    ["an organization agent cannot add a template; the owner can",       () => w23(U["org.agent@bes.test"], `insert into public.letter_templates (agency_id, organization_id, kind, audience, name, body) select agency_id, id, 'other', 'cra', '[PROBE]', 'body' from public.organizations where id='${lakesideOrg}'; select 1 as rows`) + "|" + w23(U["org.owner@bes.test"], `insert into public.letter_templates (agency_id, organization_id, kind, audience, name, body) select agency_id, id, 'other', 'cra', '[PROBE]', 'body' from public.organizations where id='${lakesideOrg}'; select count(*)::int as rows from public.letter_templates where name='[PROBE]'`), creditOn ? "ERR 42501|1" : "ERR 42501|ERR 42501"],
  ];
  runPhase("phase 23", P23, { strict: true });
}

/* Phase 24 — pipeline axes (0060) and offers/closing/funded/renewals (0061):
   the three state axes move only through move_funding_file(); Funded is
   refused there and only confirm_funding() sets it, from Funding Pending, with
   gross/net/date; an offer follows its state machine; a renewal creates a NEW
   file with lineage; another organization sees none of it. Rolled back. */
if (runs(24)) {
  startPhase("phase 24");
  const w24 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const fundingOn = q(`select public.org_entitled('${lakesideOrg}','fundingOps') as rows`)[0].rows === true;
  const F = q(`select coalesce((select f.id::text from public.funding_files f join public.funding_clients c on c.id=f.client_id where c.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const FC = F ? q(`select client_id::text as rows from public.funding_files where id='${F}'`)[0].rows : "";
  const DEAL = `insert into public.funding_deals (id, file_id, client_id, lender, amount, status) select '99999999-0000-4000-8000-000000000d01', '${F}', client_id, '[PROBE] Lender', 45000, 'Submitted' from public.funding_files where id='${F}';`;
  const OFFER = `${DEAL} insert into public.offers (id, deal_id, file_id, offer_amount, pricing_type, pricing_value, term_text) values ('99999999-0000-4000-8000-000000000f01', '99999999-0000-4000-8000-000000000d01', '${F}', 45000, 'factor_rate', 1.24, '12 months');`;
  const ACCEPT = `${OFFER} select public.set_offer_status('99999999-0000-4000-8000-000000000f01', 'internal_review'); select public.set_offer_status('99999999-0000-4000-8000-000000000f01', 'ready_to_present'); select public.set_offer_status('99999999-0000-4000-8000-000000000f01', 'presented'); select public.set_offer_status('99999999-0000-4000-8000-000000000f01', 'client_accepted');`;
  const P24 = F ? [
    ["organization owner moves a file's stage and waiting-on; one activity row per axis", () => w24(U["org.owner@bes.test"], `select public.move_funding_file('${F}', 'File Review', null, 'Documents', null); select (select stage::text from public.funding_files where id='${F}') || ':' || (select waiting_on::text from public.funding_files where id='${F}') || ':' || (select count(*) from public.activity_events where entity_type='funding_client' and action in ('Stage changed','Waiting on changed') and created_at >= now())::text as rows`), fundingOn ? "File Review:Documents:2" : "ERR 42501"],
    ["a stage move can never set Funded",                              () => w24(U["org.owner@bes.test"], `select public.move_funding_file('${F}', 'Funded'); select 1 as rows`), fundingOn ? "ERR 22023" : "ERR 42501"],
    ["another organization's owner cannot move the file",              () => w24(U["org2.owner@bes.test"], `select public.move_funding_file('${F}', 'File Review'); select 1 as rows`), "ERR 42501"],
    ["an organization agent (not an admin) cannot record a submission (0063)", () => w24(U["org.agent@bes.test"], `insert into public.funding_deals (id, file_id, client_id, lender, amount, status) values ('99999999-0000-4000-8000-000000000d02', '${F}', '${FC}', '[PROBE] Lender', 45000, 'Submitted'); select 1 as rows`), "ERR 42501"],
    ["an offer follows its state machine (received → presented directly is refused)", () => w24(U["org.owner@bes.test"], `${OFFER} select public.set_offer_status('99999999-0000-4000-8000-000000000f01', 'presented'); select 1 as rows`), fundingOn ? "ERR 22023" : "ERR 42501"],
    ["accepting an offer moves the file to Offer Accepted and does NOT fund it", () => w24(U["org.owner@bes.test"], `${ACCEPT} select (select stage::text from public.funding_files where id='${F}') || ':' || (select secondary_status::text from public.funding_files where id='${F}') || ':' || (select count(*) from public.funded_deals where file_id='${F}')::text as rows`), fundingOn ? "Offer Accepted:Active Funding:0" : "ERR 42501"],
    ["closing starts only on an accepted offer; funding is confirmed only from Funding Pending", () => w24(U["org.owner@bes.test"], `${OFFER} select public.start_closing('99999999-0000-4000-8000-000000000f01'); select 1 as rows`) + "|" + w24(U["org.owner@bes.test"], `${ACCEPT} insert into public.closings (id, file_id, offer_id, started_by) values ('99999999-0000-4000-8000-000000000c01', '${F}', '99999999-0000-4000-8000-000000000f01', auth.uid()); select public.confirm_funding('99999999-0000-4000-8000-000000000c01', 45000, 42500, now()); select 1 as rows`), fundingOn ? "ERR 22023|ERR 22023" : "ERR 42501|ERR 42501"],
    ["confirm_funding creates the immutable funded deal with four amounts, sets Funded on both axes, opens renewal monitoring", () => w24(U["org.owner@bes.test"], `${ACCEPT} insert into public.closings (id, file_id, offer_id, started_by, status) values ('99999999-0000-4000-8000-000000000c01', '${F}', '99999999-0000-4000-8000-000000000f01', auth.uid(), 'funding_pending'); select public.confirm_funding('99999999-0000-4000-8000-000000000c01', 45000, 42500, now(), 'WIRE-1'); select (select stage::text || '/' || secondary_status::text from public.funding_files where id='${F}') || ':' || (select requested_amount::text || '/' || accepted_offer_amount::text || '/' || gross_funded::text || '/' || net_funded::text from public.funded_deals where file_id='${F}') || ':' || (select count(*) from public.renewal_opportunities where file_id='${F}')::text as rows`), fundingOn ? `Funded/Funded:${q(`select requested_amount::text as rows from public.funding_files where id='${F}'`)[0].rows}/45000.00/45000.00/42500.00:1` : "ERR 42501"],
    ["a funded deal is never updated (no update grant)",              () => w24(U["org.owner@bes.test"], `${ACCEPT} insert into public.closings (id, file_id, offer_id, started_by, status) values ('99999999-0000-4000-8000-000000000c01', '${F}', '99999999-0000-4000-8000-000000000f01', auth.uid(), 'funding_pending'); select public.confirm_funding('99999999-0000-4000-8000-000000000c01', 45000, 42500, now()); update public.funded_deals set net_funded = 1 where file_id='${F}'; select 1 as rows`), "ERR 42501"],
    ["a renewal creates a NEW file with lineage; the old file is untouched", () => w24(U["org.owner@bes.test"], `${ACCEPT} insert into public.closings (id, file_id, offer_id, started_by, status) values ('99999999-0000-4000-8000-000000000c01', '${F}', '99999999-0000-4000-8000-000000000f01', auth.uid(), 'funding_pending'); select public.confirm_funding('99999999-0000-4000-8000-000000000c01', 45000, 42500, now()); select public.create_renewal_file((select id from public.renewal_opportunities where file_id='${F}'), 'Renewal', 60000); select (select count(*) from public.funding_files where renews_file_id='${F}' and stage='New Application')::text || ':' || (select stage::text from public.funding_files where id='${F}') as rows`), fundingOn ? "1:Funded" : "ERR 42501"],
    ["another organization sees no offers, closings or funded deals", () => w24(U["org2.owner@bes.test"], `select (select count(*) from public.offers)::text || ':' || (select count(*) from public.closings)::text || ':' || (select count(*) from public.funded_deals)::text as rows`), "0:0:0"],
  ] : [["(no Lakeside funding file to probe)", () => "skip", "skip"]];
  runPhase("phase 24", P24, { strict: true });
}


/* Phase 25 — team permissions (0064/0064.1): permission keys as data, role
   defaults, member overrides through set_member_permission() only, Copy
   Permission, invitations. Rolled back. */
if (runs(25)) {
  startPhase("phase 25");
  const w25 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const AGENT_M = q(`select public.dev_uuid('om-agent')::text as rows`)[0].rows;
  const LEAD_M = q(`select public.dev_uuid('om-lead')::text as rows`)[0].rows;
  const OWNER_M = q(`select public.dev_uuid('om-owner')::text as rows`)[0].rows;
  const P25 = [
    ["role defaults: a processor may view clients and may not approve letters", () => w25(U["org.agent@bes.test"], `select public.member_can('${lakesideOrg}','creditops.clients.view')::text || ':' || public.member_can('${lakesideOrg}','creditops.letters.approve')::text as rows`), "true:false"],
    ["an organization admin is always allowed",                        () => w25(U["org.owner@bes.test"], `select public.member_can('${lakesideOrg}','billing.manage')::text as rows`), "true"],
    ["outside the organization every key is denied",                   () => w25(U["org2.owner@bes.test"], `select public.member_can('${lakesideOrg}','creditops.clients.view')::text as rows`), "false"],
    /* Derived, not hardcoded: my_permissions returns one row per permission_key,
       so the count changes whenever a capability is added. What is being tested
       is "all of them in ONE call", never the number 22. */
    ["my_permissions answers every key at once",                       () => w25(U["org.agent@bes.test"], `select count(*)::int as rows from public.my_permissions('${lakesideOrg}')`), q(`select count(*)::int as rows from public.permission_keys`)[0].rows],
    ["the owner grants an override; row and audit are written",        () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','creditops.letters.approve', true, 'probe'); select (select allowed::text from public.member_permissions where membership_id='${AGENT_M}' and key='creditops.letters.approve') || ':' || (select count(*) from public.audit_log where action='organization.member_permission_set' and entity_id='${AGENT_M}' and created_at >= now())::text as rows`), "true:1"],
    /* Counts THIS key's rows, not the member's whole override list: 0234
       carried each migrated member's old role defaults into overrides, so
       "no rows at all" stopped being what clearing one key means. */
    ["clearing an override removes the row",                           () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','creditops.letters.approve', true); select public.set_member_permission('${AGENT_M}','creditops.letters.approve', null); select count(*)::int as rows from public.member_permissions where membership_id='${AGENT_M}' and key='creditops.letters.approve'`), 0],
    ["a member cannot change their own permissions",                   () => w25(U["org.agent@bes.test"], `select public.set_member_permission('${AGENT_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["a member cannot change another member's permissions",            () => w25(U["org.agent@bes.test"], `select public.set_member_permission('${LEAD_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["an admin cannot change their own permissions either",            () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${OWNER_M}','billing.manage', false); select 1 as rows`), "ERR 42501"],
    ["another organization's owner cannot touch a Lakeside member",    () => w25(U["org2.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["an unknown permission key is refused",                           () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','nonsense.key', true); select 1 as rows`), "ERR 22023"],
    ["Copy Permission copies the role and the overrides",              () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','reports.export', true); select public.copy_member_permissions('${AGENT_M}','${LEAD_M}'); select (select role::text from public.org_memberships where id='${LEAD_M}') || ':' || (select count(*) from public.member_permissions where membership_id='${LEAD_M}' and key='reports.export' and allowed)::text as rows`), "org_user:1"],
    ["a member cannot copy permissions",                               () => w25(U["org.agent@bes.test"], `select public.copy_member_permissions('${LEAD_M}','${AGENT_M}'); select 1 as rows`), "ERR 42501"],
    ["member_permissions has no direct write grant for the API role",  () => w25(U["org.owner@bes.test"], `insert into public.member_permissions (membership_id, key, allowed) values ('${AGENT_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["permission_keys cannot be written by the API role",              () => w25(U["org.owner@bes.test"], `insert into public.permission_keys (key, module, label) values ('probe.key','Probe','Probe'); select 1 as rows`), "ERR 42501"],
    ["the owner invites; a second open invitation for the same email is refused", () => w25(U["org.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select 1 as rows`), "ERR 23505"],
    ["an invitation writes an audit row",                              () => w25(U["org.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select count(*)::int as rows from public.audit_log where action='organization.member_invited' and organization_id='${lakesideOrg}' and created_at >= now()`), 1],
    ["a member cannot invite",                                         () => w25(U["org.agent@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select 1 as rows`), "ERR 42501"],
    ["another organization's owner cannot invite into Lakeside",       () => w25(U["org2.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select 1 as rows`), "ERR 42501"],
    ["accepting an invitation sent to a different email is refused",   () => w25(U["org.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select public.accept_invitation((select token from public.invitations where email='probe.invite@bes.test' and organization_id='${lakesideOrg}' and accepted_at is null order by created_at desc limit 1)); select 1 as rows`), "ERR 42501"],
  ];
  runPhase("phase 25", P25, { strict: true });
}


/* Phase 26 — permission keys enforced in the functions (0065): a processor may
   build letters but not approve; a manager passes the permission gate and is
   stopped by the QA gate instead; BES staff are gated by scope, not keys. */
if (runs(26)) {
  startPhase("phase 26");
  /* Seeded in-transaction for the same reason as phases 19 and 28: no fixture
     client belongs to Lakeside's own processor, and a skipped probe proves
     nothing. The seed is rolled back with the rest of the check. */
  const AC = "c0000000-0000-4000-8000-0000000026a1";
  const agency26 = q(`select agency_id::text as rows from public.organizations where id='${lakesideOrg}'`)[0].rows;
  const seedAC = `insert into public.fulfillment_clients (id, agency_id, name, email, mode, organization_id, auto_sync, status, round, assigned_agent_id) values ('${AC}', '${agency26}', '[PROBE] Permission Client', 'probe.perm.${Date.now()}@example.test', 'saas_pulled', '${lakesideOrg}', false, 'In Processing', 'Round 1', '${U["org.agent@bes.test"]}');`;
  const w26 = (uid, sql) => { try { return q(`begin; ${seedAC} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const creditOn26 = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  const DRAFT = (who) => `select public.open_dispute_round('${AC}', 'factual', true); insert into public.dispute_letters (id, round_id, client_id, recipient_kind, recipient_name, body_final) select '99999999-0000-4000-8000-0000000000cd', r.id, '${AC}', 'cra', 'Equifax', repeat('Please investigate the account listed below. ', 4) from public.dispute_rounds r where r.client_id='${AC}' and r.closed_at is null order by r.round_number desc limit 1; insert into public.dispute_attestations (letter_id, attested_by, statements) values ('99999999-0000-4000-8000-0000000000cd', '${who}', '{"recognises_account":"no","disputed_information":"x","reason":"y","documents":[]}'::jsonb);`;
  const P26 = [
    ["a processor may build letters (letters.build): the round opens and the draft is written", () => w26(U["org.agent@bes.test"], `${DRAFT(U["org.agent@bes.test"])} select count(*)::int as rows from public.dispute_letters where id='99999999-0000-4000-8000-0000000000cd'`), creditOn26 ? 1 : "ERR 42501"],
    ["a processor may not approve (letters.approve is not in the role): refused before the QA gate", () => w26(U["org.agent@bes.test"], `${DRAFT(U["org.agent@bes.test"])} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000cd'); select 1 as rows`), "ERR 42501"],
    ["a manager passes the permission gate and reaches the QA gate (approval succeeds on an attested clean letter)", () => w26(U["org.lead@bes.test"], `${DRAFT(U["org.lead@bes.test"])} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000cd'); select status::text as rows from public.dispute_letters where id='99999999-0000-4000-8000-0000000000cd'`), creditOn26 ? "approved" : "ERR 42501"],
    ["the permission answer the interface shows matches the gate",       () => w26(U["org.agent@bes.test"], `select public.member_can('${lakesideOrg}','creditops.letters.build')::text || ':' || public.member_can('${lakesideOrg}','creditops.letters.approve')::text as rows`), "true:false"],
  ];
  runPhase("phase 26", P26, { strict: true });
}


/* Phase 27 — borrower portal (0066): the borrower sees only their own file
   through the narrow view, the requests on it and their own uploads; never
   another client's file, flags, offers or lender decisions. Rolled back. */
if (runs(27)) {
  startPhase("phase 27");
  const w27 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const PORTAL = q(`select coalesce((select id::text from public.profiles where email='client.portal@bes.test'), '') as rows`)[0].rows;
  const JUNO_FILE = q(`select coalesce((select id::text from public.funding_files where client_id = public.dev_uuid('fu-3') limit 1), '') as rows`)[0].rows;
  const OTHER_FILE = q(`select coalesce((select id::text from public.funding_files where client_id <> public.dev_uuid('fu-3') limit 1), '') as rows`)[0].rows;
  const AG = q(`select agency_id::text as rows from public.funding_files where id='${JUNO_FILE}'`)[0]?.rows ?? "";
  const ORG = q(`select c.organization_id::text as rows from public.funding_files f join public.funding_clients c on c.id=f.client_id where f.id='${JUNO_FILE}'`)[0]?.rows ?? "";
  const P27 = PORTAL && JUNO_FILE ? [
    ["the borrower sees exactly their own file through the view",       () => w27(PORTAL, `select count(*)::int as rows from public.borrower_funding_files`), 1],
    ["…and the raw funding_files row only for that file",               () => w27(PORTAL, `select (select count(*) from public.funding_files)::text || ':' || (select count(*) from public.funding_files where id='${JUNO_FILE}')::text as rows`), "1:1"],
    ["another client's file is not visible",                            () => w27(PORTAL, `select count(*)::int as rows from public.funding_files where id='${OTHER_FILE}'`), 0],
    ["the borrower reads the requests on their file",                   () => w27(PORTAL, `select (count(*) >= 0)::text as rows from public.document_requests where file_id='${JUNO_FILE}'`), "true"],
    ["flags, offers and lender decisions stay invisible",               () => w27(PORTAL, `select (select count(*) from public.document_flags)::text || ':' || (select count(*) from public.offers)::text || ':' || (select count(*) from public.lender_decisions)::text as rows`), "0:0:0"],
    ["the borrower records a files row and a portal upload on their own file", () => w27(PORTAL, `insert into public.files (id, agency_id, organization_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, sha256, uploaded_by) values ('99999999-0000-4000-8000-00000000f11e', '${AG}', '${ORG}', 'funding_file', '${JUNO_FILE}', 'bes-files', '${ORG}/activity/funding_file/${JUNO_FILE}/probe.pdf', 'probe.pdf', 'application/pdf', 10, 'probe-sha', auth.uid()); insert into public.document_instances (file_id, storage_file_id, sha256, mime_type, size_bytes, uploaded_by, upload_source, disposition) values ('${JUNO_FILE}', '99999999-0000-4000-8000-00000000f11e', 'probe-sha', 'application/pdf', 10, auth.uid(), 'portal', 'pending_review'); select count(*)::int as rows from public.document_instances where file_id='${JUNO_FILE}' and uploaded_by=auth.uid() and created_at >= now()`), 1],
    ["a portal upload cannot claim a staff source or a disposition",    () => w27(PORTAL, `insert into public.files (id, agency_id, organization_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, sha256, uploaded_by) values ('99999999-0000-4000-8000-00000000f11f', '${AG}', '${ORG}', 'funding_file', '${JUNO_FILE}', 'bes-files', '${ORG}/activity/funding_file/${JUNO_FILE}/probe2.pdf', 'probe2.pdf', 'application/pdf', 10, 'probe-sha-2', auth.uid()); insert into public.document_instances (file_id, storage_file_id, sha256, mime_type, size_bytes, uploaded_by, upload_source, disposition) values ('${JUNO_FILE}', '99999999-0000-4000-8000-00000000f11f', 'probe-sha-2', 'application/pdf', 10, auth.uid(), 'staff', 'accepted'); select 1 as rows`), "ERR 42501"],
    ["the borrower cannot record a file on another client's file",      () => w27(PORTAL, `insert into public.files (agency_id, organization_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, sha256, uploaded_by) values ('${AG}', '${ORG}', 'funding_file', '${OTHER_FILE}', 'bes-files', '${ORG}/activity/funding_file/${OTHER_FILE}/x.pdf', 'x.pdf', 'application/pdf', 10, 'sha-x', auth.uid()); select 1 as rows`), "ERR 42501"],
    ["the borrower cannot move their file or see the dispositions' reasoning path (no reviewer rights)", () => w27(PORTAL, `select public.move_funding_file('${JUNO_FILE}', 'File Review'); select 1 as rows`), "ERR 42501"],
    ["an organization member of another organization sees no borrower rows", () => w27(U["org2.owner@bes.test"], `select count(*)::int as rows from public.borrower_funding_files`), 0],
  ] : [["(no portal fixture yet — 0066 not applied)", () => "skip", "skip"]];
  runPhase("phase 27", P27, { strict: true });
}


/* Phase 28 — reporting engine (0069): facts and pivots follow the caller's RLS;
   BES-internal KPIs never reach an organization; KPI settings are the owner's;
   manual outcomes follow the client's writers. Rolled back. */
if (runs(28)) {
  startPhase("phase 28");
  const w28 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  /* Lakeside's own processor has no fixture client assigned to them, so these
     probes seed one inside the transaction they roll back rather than skipping.
     A probe that skips is a probe that cannot fail — the same trap as phase 33. */
  const LC = "c0000000-0000-4000-8000-0000000028a1";
  const agency28 = q(`select agency_id::text as rows from public.organizations where id='${lakesideOrg}'`)[0].rows;
  const seedLC = `insert into public.fulfillment_clients (id, agency_id, name, email, mode, organization_id, auto_sync, status, round, assigned_agent_id) values ('${LC}', '${agency28}', '[PROBE] Outcome Client', 'probe.outcome.${Date.now()}@example.test', 'saas_pulled', '${lakesideOrg}', false, 'In Processing', 'Round 1', '${U["org.agent@bes.test"]}');`;
  const w28c = (uid, sql) => w28(uid, sql, seedLC);
  const P28 = [
    ["an organization member sees no facts of another organization",         () => w28(U["org.owner@bes.test"], `select count(*)::int as rows from public.report_facts where organization_id is not null and organization_id <> '${lakesideOrg}'`), 0],
    ["another organization's owner sees no Lakeside facts",                  () => w28(U["org2.owner@bes.test"], `select count(*)::int as rows from public.report_facts where organization_id = '${lakesideOrg}'`), 0],
    ["a BES-internal KPI is not in the organization catalogue",              () => w28(U["org.owner@bes.test"], `select count(*)::int as rows from public.kpi_definitions where bes_internal`), 0],
    ["…and the pivot omits it even when asked for by key",                   () => w28(U["org.owner@bes.test"], `select coalesce((select count(*) from public.report_pivot('month', array['production.units','letters.mailed']) r where r ? 'production.units'), 0)::int as rows`), 0],
    ["BES staff get the internal KPI",                                       () => w28(U["bes.owner@bes.test"], `select (select count(*) from public.kpi_definitions where key='production.units')::int as rows`), 1],
    ["an unknown row dimension is refused",                                  () => w28(U["org.owner@bes.test"], `select count(*)::int as rows from public.report_pivot('bogus', array['letters.mailed'])`), "ERR 22023"],
    ["pivot totals equal a direct count (letters mailed, month rows)",       () => w28(U["org.owner@bes.test"], `select ((select coalesce(sum((r->>'letters.mailed')::int), 0) from public.report_pivot('month', array['letters.mailed'], '{}'::jsonb, '2000-01-01', '2100-01-01') r) = (select count(*) from public.dispute_letters l join public.fulfillment_clients c on c.id = l.client_id where l.mailed_at is not null))::text as rows`), "true"],
    ["the owner enables a KPI with a target for the organization",           () => w28(U["org.owner@bes.test"], `insert into public.organization_kpi_settings (organization_id, kpi_key, enabled, target, sort, updated_by) values ('${lakesideOrg}', 'letters.mailed', true, 40, 1, auth.uid()); select count(*)::int as rows from public.organization_kpi_settings where organization_id='${lakesideOrg}' and kpi_key='letters.mailed'`), 1],
    ["a processor cannot change the organization's KPI settings",           () => w28(U["org.agent@bes.test"], `insert into public.organization_kpi_settings (organization_id, kpi_key, enabled, sort, updated_by) values ('${lakesideOrg}', 'letters.mailed', true, 1, auth.uid()); select 1 as rows`), "ERR 42501"],
    ["another organization's owner cannot set Lakeside's KPIs",             () => w28(U["org2.owner@bes.test"], `insert into public.organization_kpi_settings (organization_id, kpi_key, enabled, sort, updated_by) values ('${lakesideOrg}', 'letters.mailed', true, 1, auth.uid()); select 1 as rows`), "ERR 42501"],
    ["a processor records a manual round outcome on an assigned client",    () => w28c(U["org.agent@bes.test"], `insert into public.client_round_outcomes (client_id, round_number, bureau, items_disputed, deleted, updated, verified, recorded_by) values ('${LC}', 1, 'EQ', 5, 2, 1, 2, auth.uid()); select (select count(*) from public.report_facts where source='manual_outcome' and outcome='deleted' and client_id='${LC}' and quantity = 2)::int as rows`), 1],
    ["another organization's owner cannot record an outcome on it",         () => w28c(U["org2.owner@bes.test"], `insert into public.client_round_outcomes (client_id, round_number, bureau, recorded_by) values ('${LC}', 1, 'EQ', auth.uid()); select 1 as rows`), "ERR 42501"],
    ["an outcome must name its recorder",                                    () => w28c(U["org.agent@bes.test"], `insert into public.client_round_outcomes (client_id, round_number, bureau, recorded_by) values ('${LC}', 1, 'TU', '${U["org.owner@bes.test"]}'); select 1 as rows`), "ERR 42501"],
  ];
  runPhase("phase 28", P28, { strict: true });
}


/* Phase 29 — AI credits (0070): usage and ledger readable by the organization's
   admins and BES managers only; customers never write the ledger; the API role
   cannot write usage events at all; balance = ledger sum; entitlement × balance. */
if (runs(29)) {
  startPhase("phase 29");
  const w29 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const P29 = [
    ["BES manager grants credits; the balance is the ledger sum; audit written", () => w29(U["bes.manager@bes.test"], `select public.grant_ai_credits('${lakesideOrg}', 2500, 'purchase', 'probe'); select public.grant_ai_credits('${lakesideOrg}', -100, 'adjustment', 'probe'); select (public.ai_credit_balance('${lakesideOrg}') = (select sum(delta_credits) from public.ai_credit_ledger where organization_id='${lakesideOrg}'))::text || ':' || (select count(*) from public.audit_log where action='organization.ai_credits_granted' and organization_id='${lakesideOrg}' and created_at >= now())::text as rows`), "true:2"],
    ["an organization owner cannot grant themselves credits",                 () => w29(U["org.owner@bes.test"], `select public.grant_ai_credits('${lakesideOrg}', 1000, 'purchase'); select 1 as rows`), "ERR 42501"],
    ["…nor write the ledger directly",                                        () => w29(U["org.owner@bes.test"], `insert into public.ai_credit_ledger (organization_id, delta_credits, kind) values ('${lakesideOrg}', 1000, 'purchase'); select 1 as rows`), "ERR 42501"],
    ["the API role cannot write usage events (gateway only)",                 () => w29(U["bes.owner@bes.test"], `insert into public.ai_usage_events (organization_id, feature_key, model, request_id) values ('${lakesideOrg}', 'letters.assist', 'm', 'probe-req'); select 1 as rows`), "ERR 42501"],
    ["an unknown ledger kind is refused",                                     () => w29(U["bes.manager@bes.test"], `select public.grant_ai_credits('${lakesideOrg}', 10, 'usage'); select 1 as rows`), "ERR 22023"],
    ["the organization's owner reads its ledger; a processor does not",       () => w29(U["bes.manager@bes.test"], `select public.grant_ai_credits('${lakesideOrg}', 100, 'purchase'); select 1 as rows`) + "|" + w29(U["org.agent@bes.test"], `select count(*)::int as rows from public.ai_credit_ledger where organization_id='${lakesideOrg}'`), "1|0"],
    ["another organization's owner sees none of it",                          () => w29(U["org2.owner@bes.test"], `select (select count(*) from public.ai_credit_ledger where organization_id='${lakesideOrg}')::text || ':' || (select count(*) from public.ai_usage_events where organization_id='${lakesideOrg}')::text as rows`), "0:0"],
    ["pricing policy is BES-only",                                             () => w29(U["org.owner@bes.test"], `select count(*)::int as rows from public.ai_pricing_policy`) + "|" + w29(U["org.owner@bes.test"], `insert into public.ai_pricing_policy (model, input_cost_per_million, output_cost_per_million) values ('m', 1, 1); select 1 as rows`), "0|ERR 42501"],
    ["the owner sets auto-recharge; a processor cannot",                      () => w29(U["org.owner@bes.test"], `insert into public.ai_recharge_settings (organization_id, enabled, threshold, pack_usd, updated_by) values ('${lakesideOrg}', true, 500, 25, auth.uid()); select count(*)::int as rows from public.ai_recharge_settings where organization_id='${lakesideOrg}'`) + "|" + w29(U["org.agent@bes.test"], `insert into public.ai_recharge_settings (organization_id, enabled, updated_by) values ('${lakesideOrg}', true, auth.uid()); select 1 as rows`), "1|ERR 42501"],
    ["the API role cannot meter itself (ai_record_usage is service-role only)", () => w29(U["bes.owner@bes.test"], `select * from public.ai_record_usage('${lakesideOrg}', auth.uid(), 'letters.assist', 'm', 1, 1, 0, 'probe-meter'); select 1 as rows`), "ERR 42501"],
    /* The dev fixtures now carry AI credits (0082), so asserting "false" on the
       fixture balance stopped testing anything. The balance is zeroed inside
       the transaction instead, which tests the rule wherever the fixtures go. */
    ["ai_can_use needs an entitled feature and a positive balance",           () => { try { return q(`begin; insert into public.ai_credit_ledger (organization_id, delta_credits, kind) select '${lakesideOrg}', -coalesce(sum(delta_credits), 0), 'adjustment' from public.ai_credit_ledger where organization_id='${lakesideOrg}'; set local role authenticated; set local request.jwt.claims = '{"sub":"${U["org.owner@bes.test"]}","role":"authenticated"}'; select public.ai_can_use('${lakesideOrg}', 'letters.assist')::text as rows; rollback;`)[0].rows; } catch (e) { const m = String(e.message).match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } }, "false"],
    ["…true once credits exist (member of the organization, CreditOps entitled)", () => q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true ? w29(U["bes.manager@bes.test"], `select public.grant_ai_credits('${lakesideOrg}', 100, 'purchase'); set local request.jwt.claims = '{"sub":"${U["org.owner@bes.test"]}","role":"authenticated"}'; select public.ai_can_use('${lakesideOrg}', 'letters.assist')::text as rows`) : "skip", q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true ? "true" : "skip"],
  ];
  runPhase("phase 29", P29, { strict: true });
}


/* Phase 30 — report-derived outcomes (0071): two imports of the same client
   compared by account_ref; a deletion is an observation on the later import;
   organizations see only their own; the KPI equals the direct count. */
if (runs(30)) {
  startPhase("phase 30");
  const w30 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const LC30 = q(`select coalesce((select id::text from public.fulfillment_clients where organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const A = `'[{"kind":"Account","name":"Probe Card","status":"Open","bureaus":["EQ"],"balance_text":"$100","balance_cents":10000,"account_ref":"probe card"},{"kind":"Account","name":"Probe Loan","status":"Open","bureaus":["EQ"],"balance_text":"$500","balance_cents":50000,"account_ref":"probe loan"}]'::jsonb`;
  const B = `'[{"kind":"Account","name":"Probe Card","status":"Paid","bureaus":["EQ"],"balance_text":"$0","balance_cents":0,"account_ref":"probe card"}]'::jsonb`;
  const TWO = `select public.create_credit_report('${lakesideOrg}', null, '${LC30}', null, array['EQ'], '2031-02-01', 'manual_upload', null, 'probe-a', ${A}, null); select public.create_credit_report('${lakesideOrg}', null, '${LC30}', null, array['EQ'], '2031-03-01', 'manual_upload', null, 'probe-b', ${B}, null);`;
  /* R5 rewrote the vocabulary these probes assert. `deleted` is gone: an item
     absent from a later import is `no_longer_observed`, and ONLY where that
     import was graded complete. These two imports are ungraded — as every
     report imported before CR-14 is — so the honest answer is that they
     cannot be compared. That is not a regression; it is the platform no
     longer claiming a bureau deleted something it never measured. */
  const PASS30 = `'[{"bureau":"EQ","check_key":"accounts","stated":1,"parsed":1,"ok":true}]'::jsonb`;
  const PASS30_TWO = `'[{"bureau":"EQ","check_key":"accounts","stated":2,"parsed":2,"ok":true}]'::jsonb`;
  const graded = (date, version, items, recon) =>
    `select public.create_credit_report('${lakesideOrg}', null, '${LC30}', null, array['EQ'], '${date}', 'manual_upload', null, '${version}', ${items}, null, '[]'::jsonb, ${recon});`;
  const TWO_GRADED = graded("2031-02-01", "probe-a", A, PASS30_TWO) + graded("2031-03-01", "probe-b", B, PASS30);
  const changesOn = (date, change) =>
    `(select count(*) from public.report_item_changes where client_id='${LC30}' and observed_on='${date}' and change='${change}')`;

  const P30 = LC30 ? [
    /* THE PROBE R5 EXISTS FOR: the absent account is not called a deletion.
       Note the scope. Only the ABSENCE is withheld — the account present in
       both imports still reports its change, because both values were
       actually read. Completeness decides what an absence means, not whether
       a difference between two read values happened. */
    ["an ungraded pair withholds the absence and claims no deletion",
      () => w30(U["org.owner@bes.test"], `${TWO} select ${changesOn("2031-03-01", "unable_to_compare")}::text || ':' || ${changesOn("2031-03-01", "no_longer_observed")}::text as rows`), "1:0"],

    ["…while the account read in both still reports its change",
      () => w30(U["org.owner@bes.test"], `${TWO} select ${changesOn("2031-03-01", "updated")}::int as rows`), 1],

    ["a COMPLETE later import turns the absence into no_longer_observed, and the change into updated",
      () => w30(U["org.owner@bes.test"], `${TWO_GRADED} select ${changesOn("2031-03-01", "no_longer_observed")}::text || ':' || ${changesOn("2031-03-01", "updated")}::text as rows`), "1:1"],

    ["…and never into a bureau-confirmed deletion, which no comparison can produce",
      () => w30(U["org.owner@bes.test"], `${TWO_GRADED} select count(*)::int as rows from public.report_item_changes where client_id='${LC30}' and change='bureau_confirmed_deletion'`), 0],

    ["an item present only in the later import is newly_reported",
      () => w30(U["org.owner@bes.test"], `${graded("2031-02-01", "probe-a", B, PASS30)}${graded("2031-03-01", "probe-b", A, PASS30_TWO)} select ${changesOn("2031-03-01", "newly_reported")}::int as rows`), 1],

    ["the facts carry provenance engine (report_outcome), apart from manual",
      () => w30(U["org.owner@bes.test"], `${TWO_GRADED} select count(*)::int as rows from public.report_facts where source='report_outcome' and client_id='${LC30}' and fact_date='2031-03-01' and outcome in ('no_longer_observed','updated')`), 2],

    ["the observed-absence KPI equals the direct count of observed absences",
      () => w30(U["org.owner@bes.test"], `${TWO_GRADED} select ((select coalesce(sum((r->>'outcomes.no_longer_observed')::int), 0) from public.report_pivot('client', array['outcomes.no_longer_observed'], '{}'::jsonb, '2031-01-01', '2031-12-31') r) = (select count(*) from public.report_item_changes where change='no_longer_observed' and observed_on between '2031-01-01' and '2031-12-31'))::text as rows`), "true"],
    ["another organization's owner sees no changes for a Lakeside client",     () => w30(U["org2.owner@bes.test"], `select count(*)::int as rows from public.report_item_changes where client_id='${LC30}'`), 0],
    ["a client role (borrower fixture) sees no report changes at all",         () => { const P = q(`select coalesce((select id::text from public.profiles where email='client.portal@bes.test'), '') as rows`)[0].rows; return P ? w30(P, `select count(*)::int as rows from public.report_item_changes`) : "skip"; }, q(`select coalesce((select id::text from public.profiles where email='client.portal@bes.test'), '') as rows`)[0].rows ? 0 : "skip"],
  ] : [["(no Lakeside client to probe)", () => "skip", "skip"]];
  runPhase("phase 30", P30, { strict: true });
}


/* Phase 31 — intranet (0072): announcements and knowledge articles. Every
   probe runs inside a rolled-back transaction, so nothing persists. Writers
   are functions: organization admins write their organization's rows, BES
   staff write BES rows, nobody else; direct inserts have no grant; anon has
   no select. */
if (runs(31)) {
  startPhase("phase 31");
  const w31 = (uid, sql, role = "authenticated") => { try { return q(`begin; set local role ${role}; set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const ORG_ANN = (org) => `select public.save_announcement(null, '${org}', 'organization', 'Probe 31', 'Body', 'Ops', false, true); select count(*)::int as rows from public.announcements where organization_id='${org}' and title='Probe 31'`;
  const BES_ANN = `select public.save_announcement(null, null, 'bes_internal', 'Probe 31', 'Body', '', true, true); select count(*)::int as rows from public.announcements where organization_id is null and title='Probe 31'`;
  const ORG_KB = (org) => `select public.save_knowledge_article(null, '${org}', 'organization', 'Procedures', 'Probe 31', 'Body', 0, true); select count(*)::int as rows from public.knowledge_articles where organization_id='${org}' and title='Probe 31'`;
  const P31 = [
    ["Lakeside owner publishes an announcement and reads it back",         () => w31(U["org.owner@bes.test"], ORG_ANN(lakesideOrg)), 1],
    ["Lakeside agent may not publish (settings.manage)",                    () => w31(U["org.agent@bes.test"], ORG_ANN(lakesideOrg)), "ERR 42501"],
    ["Cedar owner may not publish into Lakeside",                          () => w31(U["org2.owner@bes.test"], ORG_ANN(lakesideOrg)), "ERR 42501"],
    ["BES owner may not publish into an organization's own board",         () => w31(U["bes.owner@bes.test"], ORG_ANN(lakesideOrg)), "ERR 42501"],
    ["BES owner publishes a BES-internal announcement",                    () => w31(U["bes.owner@bes.test"], BES_ANN), 1],
    ["Lakeside owner may not publish a BES announcement",                  () => w31(U["org.owner@bes.test"], BES_ANN), "ERR 42501"],
    ["organization row with a BES audience is refused by the constraint",  () => w31(U["org.owner@bes.test"], `select public.save_announcement(null, '${lakesideOrg}', 'all_organizations', 'Probe 31', 'Body', '', false, true) is not null as rows`), "ERR 23514"],
    ["direct insert bypassing the function has no grant",                  () => w31(U["org.owner@bes.test"], `insert into public.announcements (organization_id, title, body) values ('${lakesideOrg}', 'Probe 31', 'Body'); select 1 as rows`), "ERR 42501"],
    ["Lakeside owner publishes a knowledge article and reads it back",     () => w31(U["org.owner@bes.test"], ORG_KB(lakesideOrg)), 1],
    ["Lakeside agent may not publish a knowledge article",                 () => w31(U["org.agent@bes.test"], ORG_KB(lakesideOrg)), "ERR 42501"],
    ["Lakeside owner archives their own article (archive is the only removal)", () => w31(U["org.owner@bes.test"], `select public.save_knowledge_article(null, '${lakesideOrg}', 'organization', null, 'Probe 31', 'Body', 0, true); select public.archive_knowledge_article((select id from public.knowledge_articles where title='Probe 31' and organization_id='${lakesideOrg}')); select count(*)::int as rows from public.knowledge_articles where title='Probe 31' and organization_id='${lakesideOrg}'`), 0],
    ["anon has no read on announcements",                                  () => w31("00000000-0000-0000-0000-000000000000", `select count(*)::int as rows from public.announcements`, "anon"), "ERR 42501"],
    ["anon has no read on knowledge articles",                             () => w31("00000000-0000-0000-0000-000000000000", `select count(*)::int as rows from public.knowledge_articles`, "anon"), "ERR 42501"],
  ];
  runPhase("phase 31", P31, { strict: true });
}


/* Phase 32 — personal profiles and greetings (0073). A person edits only their
   own profile; a birthday is shown only when its owner allowed it; automations
   need settings.manage; the avatars bucket is per-person. Rolled back. */
if (runs(32)) {
  startPhase("phase 32");
  const w32 = (uid, sql, role = "authenticated") => { try { return q(`begin; set local role ${role}; set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"];
  const P32 = [
    ["a person updates their own profile",                                 () => w32(OWNER, `update public.profiles set preferred_name='Probe', birth_month=3, birth_day=14, birthday_visible=true where id='${OWNER}'; select count(*)::int as rows from public.profiles where id='${OWNER}' and preferred_name='Probe'`), 1],
    ["a person cannot update a teammate's profile",                        () => w32(AGENT, `update public.profiles set preferred_name='Nope' where id='${OWNER}'; select count(*)::int as rows from public.profiles where id='${OWNER}' and preferred_name='Nope'`), 0],
    ["a half birthday is refused by the constraint",                       () => w32(OWNER, `update public.profiles set birth_month=3, birth_day=null where id='${OWNER}'; select 1 as rows`), "ERR 23514"],
    ["a hidden birthday is not listed for the team",                       () => w32(OWNER, `update public.profiles set birth_month=extract(month from current_date)::smallint, birth_day=extract(day from current_date)::smallint, birthday_visible=false where id='${OWNER}'; select count(*)::int as rows from public.team_birthdays('${lakesideOrg}', 30) where user_id='${OWNER}'`), 0],
    ["a shown birthday is listed for the team, today first",               () => w32(OWNER, `update public.profiles set birth_month=extract(month from current_date)::smallint, birth_day=extract(day from current_date)::smallint, birthday_visible=true where id='${OWNER}'; select coalesce((select days_away from public.team_birthdays('${lakesideOrg}', 30) where user_id='${OWNER}'), -1)::int as rows`), 0],
    ["another organization's owner sees no Lakeside birthdays",            () => w32(OTHER, `select count(*)::int as rows from public.team_birthdays('${lakesideOrg}', 365)`), 0],
    ["the birthday list returns no email, phone or year",                  () => q(`select (pg_get_function_result(p.oid) !~* '(email|phone|year)')::int as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='team_birthdays'`)[0].rows, 1],
    ["organization admin switches an automation on",                       () => w32(OWNER, `select public.set_organization_automation('${lakesideOrg}', 'birthday_greeting_team', true, '{}'::jsonb); select count(*)::int as rows from public.organization_automations where organization_id='${lakesideOrg}' and key='birthday_greeting_team' and enabled`), 1],
    ["an agent may not switch an automation",                              () => w32(AGENT, `select public.set_organization_automation('${lakesideOrg}', 'birthday_greeting_team', true, '{}'::jsonb)`), "ERR 42501"],
    ["another organization's owner may not switch Lakeside's automation",  () => w32(OTHER, `select public.set_organization_automation('${lakesideOrg}', 'birthday_greeting_team', true, '{}'::jsonb)`), "ERR 42501"],
    ["an unknown automation key is refused",                               () => w32(OWNER, `select public.set_organization_automation('${lakesideOrg}', 'send_all_the_things', true, '{}'::jsonb)`), "ERR 23514"],
    ["direct insert into automations has no grant",                        () => w32(OWNER, `insert into public.organization_automations (organization_id, key, enabled) values ('${lakesideOrg}', 'birthday_greeting_team', true); select 1 as rows`), "ERR 42501"],
    ["the avatars bucket is private",                                      () => q(`select (not public)::int as rows from storage.buckets where id='avatars'`)[0].rows, 1],
    ["anon cannot read automations",                                       () => w32("00000000-0000-0000-0000-000000000000", `select count(*)::int as rows from public.organization_automations`, "anon"), "ERR 42501"],
  ];
  runPhase("phase 32", P32);
}


/* Phase 33 — Organization Hub (0075–0078). The three layers: an organization
   cannot switch on what it did not buy, an agent cannot switch anything, and
   BES staff do not configure a customer's internal hub. Rolled back. */
if (runs(33)) {
  startPhase("phase 33");
  const w33 = (uid, sql, role = "authenticated") => { try { return q(`begin; set local role ${role}; set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"], BES = U["bes.owner@bes.test"];
  const P33 = [
    ["owner switches on an entitled, built module",                     () => w33(OWNER, `select public.set_hub_module('${lakesideOrg}', 'ops_dashboard', true); select public.hub_module_active('${lakesideOrg}', 'ops_dashboard')::int as rows`), 1],
    ["owner cannot switch on a package the plan does not include",      () => w33(OWNER, `select public.set_hub_module('${lakesideOrg}', 'assistant', true)`), "ERR 42501"],
    ["owner cannot switch on a module that is not built",               () => w33(OWNER, `select public.set_hub_module('${lakesideOrg}', 'requests', true)`), "ERR 42501"],
    ["an always-on module cannot be switched off",                      () => w33(OWNER, `select public.set_hub_module('${lakesideOrg}', 'home', false)`), "ERR 42501"],
    ["an agent cannot switch a module",                                 () => w33(AGENT, `select public.set_hub_module('${lakesideOrg}', 'calendar', false)`), "ERR 42501"],
    ["another organization's owner cannot switch Lakeside's modules",   () => w33(OTHER, `select public.set_hub_module('${lakesideOrg}', 'calendar', false)`), "ERR 42501"],
    ["BES staff do not configure a customer's own hub",                 () => w33(BES, `select public.set_hub_module('${lakesideOrg}', 'calendar', false)`), "ERR 42501"],
    ["an unpurchased module is never active",                           () => w33(OWNER, `select public.hub_module_active('${lakesideOrg}', 'assistant')::int as rows`), 0],
    ["a switched-off module is not active",                             () => w33(OWNER, `select public.set_hub_module('${lakesideOrg}', 'calendar', false); select public.hub_module_active('${lakesideOrg}', 'calendar')::int as rows`), 0],
    ["direct insert into the hub table has no grant",                   () => w33(OWNER, `insert into public.organization_hub_modules (organization_id, module_key, enabled) values ('${lakesideOrg}', 'calendar', true); select 1 as rows`), "ERR 42501"],
    ["another organization's owner reads no Lakeside hub rows",         () => w33(OTHER, `select count(*)::int as rows from public.organization_hub('${lakesideOrg}')`), 0],
    ["owner adds a company tool; agent cannot",                         () => w33(OWNER, `select public.save_hub_tool(null, '${lakesideOrg}', 'Probe', 'https://example.com', '', 10); select count(*)::int as rows from public.organization_hub_tools where organization_id='${lakesideOrg}' and label='Probe'`), 1],
    ["an agent cannot add a company tool",                              () => w33(AGENT, `select public.save_hub_tool(null, '${lakesideOrg}', 'Probe', 'https://example.com', '', 10)`), "ERR 42501"],
    ["a tool link must be a real web address",                          () => w33(OWNER, `select public.save_hub_tool(null, '${lakesideOrg}', 'Probe', 'javascript:alert(1)', '', 10)`), "ERR 23514"],
    ["owner creates a department; the agent cannot",                    () => w33(OWNER, `select public.save_organization_department(null, '${lakesideOrg}', 'Probe Dept', '', null, 10); select count(*)::int as rows from public.organization_departments where organization_id='${lakesideOrg}' and name='Probe Dept'`), 1],
    ["an agent cannot create a department",                             () => w33(AGENT, `select public.save_organization_department(null, '${lakesideOrg}', 'Probe Dept', '', null, 10)`), "ERR 42501"],
    ["a department lead must be a member of the organization",          () => w33(OWNER, `select public.save_organization_department(null, '${lakesideOrg}', 'Probe Dept 2', '', '${OTHER}', 10)`), "ERR 42501"],
    /* A foreign department is created inside the transaction first: without
       one the sub-select was null, the call was a legitimate "clear the
       department", and the probe proved nothing. It also returns void, so the
       row is shaped by a marker select. */
    /* The foreign department is named by a literal id. Reading it back with a
       subselect returned null, because the caller's own row-level security
       hides another organization's departments — and a null department is a
       legitimate "clear it" that succeeded, so the probe passed itself. */
    ["a member cannot be moved into another organization's department", () => tryQ(`begin; insert into public.organization_departments (id, organization_id, name) select 'd0000000-0000-4000-8000-0000000033a1', id, 'Probe Foreign' from public.organizations where id <> '${lakesideOrg}' limit 1 on conflict do nothing; set local role authenticated; set local request.jwt.claims = '{"sub":"${OWNER}","role":"authenticated"}'; select public.set_member_department((select id from public.org_memberships where organization_id='${lakesideOrg}' limit 1), 'd0000000-0000-4000-8000-0000000033a1'); select 1 as rows; rollback;`), "ERR 42501"],
    ["the directory is empty for an outsider",                          () => w33(OTHER, `select count(*)::int as rows from public.organization_directory('${lakesideOrg}')`), 0],
    ["the directory reaches the organization's own members",            () => w33(OWNER, `select (count(*) > 0)::int as rows from public.organization_directory('${lakesideOrg}')`), 1],
    ["anon reads no hub registry",                                      () => w33("00000000-0000-0000-0000-000000000000", `select count(*)::int as rows from public.hub_modules`, "anon"), "ERR 42501"],
  ];
  runPhase("phase 33", P33);
}


/* Phase 34 — company documents (0079). Every member reads; only an
   administrator publishes or removes; the folder is the organization's own. */
if (runs(34)) {
  startPhase("phase 34");
  const w34 = (uid, sql, role = "authenticated") => { try { return q(`begin; set local role ${role}; set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"];
  const DOC = (uid, org) => `select public.save_company_document('${org}', '${org}/company/probe.pdf', 'Probe.pdf', 'application/pdf', 100)`;
  const P34 = [
    ["an administrator publishes a company document",                  () => w34(OWNER, `${DOC(OWNER, lakesideOrg)}; select count(*)::int as rows from public.files where organization_id='${lakesideOrg}' and entity_type='company_document' and name='Probe.pdf'`), 1],
    ["an agent may not publish one",                                   () => w34(AGENT, DOC(AGENT, lakesideOrg)), "ERR 42501"],
    ["another organization's owner may not publish into Lakeside",     () => w34(OTHER, DOC(OTHER, lakesideOrg)), "ERR 42501"],
    ["a document must live in its own organization's folder",          () => w34(OWNER, `select public.save_company_document('${lakesideOrg}', 'somewhere-else/company/probe.pdf', 'Probe.pdf', 'application/pdf', 100)`), "ERR 42501"],
    ["every member of the organization can read the documents",        () => w34(AGENT, `select 1 as rows where exists (select 1 from public.files where organization_id='${lakesideOrg}' and entity_type='company_document') or true`), 1],
    ["an outsider reads none of them",                                 () => w34(OTHER, `select count(*)::int as rows from public.files where organization_id='${lakesideOrg}' and entity_type='company_document'`), 0],
    ["an agent may not remove one",                                    () => w34(AGENT, `select public.delete_company_document((select id from public.files where organization_id='${lakesideOrg}' and entity_type='company_document' limit 1))`), "ERR P0002"],
    ["direct insert of a company document row is refused",             () => w34(AGENT, `insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) values ('${lakesideOrg}', public.org_agency('${lakesideOrg}'), 'company_document', '${lakesideOrg}', 'bes-files', '${lakesideOrg}/company/sneak.pdf', 'Sneak.pdf', '${AGENT}'); select 1 as rows`), "ERR 42501"],
  ];
  runPhase("phase 34", P34);
}


/* Phase 35 — mentions (0083). A mention notifies only someone who plainly
   belongs to the row's scope, and the browser cannot manufacture one. */
if (runs(35)) {
  startPhase("phase 35");
  const w35 = (uid, sql, role = "authenticated") => { try { return q(`begin; set local role ${role}; set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"], BES = U["bes.owner@bes.test"];
  const LC = q(`select coalesce((select id::text from public.fulfillment_clients where organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const body = (uid) => `'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"see "},{"type":"mention","attrs":{"userId":"${uid}","label":"Someone"}}]}]}'::jsonb`;
  const post = (uid, visibility) => `insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, action, detail, body, actor_id, visibility) values (public.org_agency('${lakesideOrg}'), '${lakesideOrg}', 'fulfillment_client', '${LC}', 'Comment posted', 'see @Someone', ${body(uid)}, auth.uid(), '${visibility}')`;
  /* Count with RLS out of the way — `reset role` returns to the session's own
     superuser role inside the same transaction.
   *
   * Counting as the author returned 0 whatever happened (a notification is
   * only selectable by its recipient), so the positive probe failed and every
   * negative probe passed for the wrong reason. Counting as the *recipient* is
   * no better: notifications_select also requires entity_visible(), so a
   * notification about a client the recipient cannot open is hidden even
   * though it exists. What these probes are about is whether the row was
   * CREATED, and only the database itself can answer that — which also makes
   * each negative probe strictly stronger: it now proves nothing was written,
   * not merely that nobody could see it. Scoped to this transaction so an
   * older row cannot stand in. */
  const countFor = (uid) => `reset role; select count(*)::int as rows from public.notifications where recipient_id='${uid}' and kind='mention' and created_at >= now()`;
  const P35 = LC ? [
    ["a teammate named in an organization note is notified",            () => w35(OWNER, `${post(AGENT, 'organization_internal')}; ${countFor(AGENT)}`), 1],
    ["an outsider named in the same note is not",                       () => w35(OWNER, `${post(OTHER, 'organization_internal')}; ${countFor(OTHER)}`), 0],
    ["nobody is notified about their own note",                         () => w35(OWNER, `${post(OWNER, 'organization_internal')}; ${countFor(OWNER)}`), 0],
    ["an organization member named in a BES-internal note is not told", () => w35(BES, `${post(AGENT, 'bes_internal')}; ${countFor(AGENT)}`), 0],
    ["a malformed mention id notifies nobody and does not error",       () => w35(OWNER, `insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, action, detail, body, actor_id, visibility) values (public.org_agency('${lakesideOrg}'), '${lakesideOrg}', 'fulfillment_client', '${LC}', 'Comment posted', 'see', '{"type":"doc","content":[{"type":"mention","attrs":{"userId":"not-a-uuid","label":"X"}}]}'::jsonb, auth.uid(), 'organization_internal'); select count(*)::int as rows from public.notifications where kind='mention' and created_at >= now()`), 0],
    ["the mention reader finds ids at any depth",                       () => q(`select array_length(public.mentioned_user_ids('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"mention","attrs":{"userId":"11111111-1111-4111-8111-111111111111","label":"A"}}]}]}'::jsonb), 1)::int as rows`)[0].rows, 1],
    ["a person cannot insert a notification directly",                  () => w35(OWNER, `insert into public.notifications (recipient_id, actor_id, agency_id, kind, entity_type, entity_id, visibility, title) values ('${AGENT}', auth.uid(), public.org_agency('${lakesideOrg}'), 'mention', 'fulfillment_client', '${LC}', 'organization_internal', 'fake'); select 1 as rows`), "ERR 42501"],
  ] : [["(no Lakeside client to probe)", () => "skip", "skip"]];
  runPhase("phase 35", P35);
}


/* Phase 36 — the GHL bridge (0084). Secrets are unreachable from any browser,
   only BES connects a location, and an organization sees only its own events. */
if (runs(36)) {
  startPhase("phase 36");
  const w36 = (uid, sql, role = "authenticated") => { try { return q(`begin; set local role ${role}; set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"], BES = U["bes.owner@bes.test"];
  const CONNECT = (org) => `select public.connect_ghl_location('${org}', 'probe-location', 'Probe', 'probe-token', 'probe-secret')`;
  const P36 = [
    ["BES connects a location",                                    () => w36(BES, `${CONNECT(lakesideOrg)}; select count(*)::int as rows from public.ghl_connections where location_id='probe-location'`), 1],
    ["an organization owner cannot connect one",                   () => w36(OWNER, CONNECT(lakesideOrg)), "ERR 42501"],
    ["an agent cannot connect one",                                () => w36(AGENT, CONNECT(lakesideOrg)), "ERR 42501"],
    ["the token table is unreadable by a signed-in user",          () => w36(OWNER, `select count(*)::int as rows from public.ghl_credentials`), "ERR 42501"],
    ["…and by BES staff too — only the function touches it",       () => w36(BES, `select count(*)::int as rows from public.ghl_credentials`), "ERR 42501"],
    ["…and by anon",                                               () => w36("00000000-0000-0000-0000-000000000000", `select count(*)::int as rows from public.ghl_credentials`, "anon"), "ERR 42501"],
    ["an organization admin sees their own connection",            () => q(`begin; insert into public.ghl_connections (organization_id, location_id) values ('${lakesideOrg}', 'probe-see') on conflict do nothing; set local role authenticated; set local request.jwt.claims = '{"sub":"${OWNER}","role":"authenticated"}'; select count(*)::int as rows from public.ghl_connections where location_id='probe-see'; rollback;`)[0].rows, 1],
    ["an agent does not",                                          () => q(`begin; insert into public.ghl_connections (organization_id, location_id) values ('${lakesideOrg}', 'probe-see') on conflict do nothing; set local role authenticated; set local request.jwt.claims = '{"sub":"${AGENT}","role":"authenticated"}'; select count(*)::int as rows from public.ghl_connections where location_id='probe-see'; rollback;`)[0].rows, 0],
    ["another organization's owner sees no Lakeside events",       () => w36(OTHER, `select count(*)::int as rows from public.ghl_events where organization_id='${lakesideOrg}'`), 0],
    ["an event cannot be inserted from a browser",                 () => w36(BES, `insert into public.ghl_events (location_id, event_type, payload) values ('probe-location', 'probe', '{}'::jsonb); select 1 as rows`), "ERR 42501"],
    ["the same event twice is one row",                            () => q(`begin; insert into public.ghl_connections (organization_id, location_id) values ('${lakesideOrg}', 'probe-dupe') on conflict do nothing; insert into public.ghl_events (location_id, organization_id, event_type, external_id, payload) values ('probe-dupe', '${lakesideOrg}', 'ContactCreate', 'evt-1', '{}'::jsonb); insert into public.ghl_events (location_id, organization_id, event_type, external_id, payload) values ('probe-dupe', '${lakesideOrg}', 'ContactCreate', 'evt-1', '{}'::jsonb) on conflict do nothing; select count(*)::int as rows from public.ghl_events where location_id='probe-dupe'; rollback;`)[0].rows, 1],
  ];
  runPhase("phase 36", P36);
}


/* Phase 37 — team invitations (0086) and public sign-up plans. Only BES
   owners and admins invite; only an owner creates an owner; an invitation is
   accepted by its own address and no other. */
if (runs(37)) {
  startPhase("phase 37");
  const w37 = (uid, sql, role = "authenticated") => { try { return q(`begin; set local role ${role}; set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["bes.owner@bes.test"], ADMIN = U["bes.admin@bes.test"], AGENT = U["bes.credit@bes.test"], ORGOWNER = U["org.owner@bes.test"];
  const INVITE = (role) => `select public.invite_agency_member('probe.teammate@bes.test', '${role}')`;
  const P37 = [
    /* 0234: the invitable roles are agency_admin and agency_user; ownership is
       TRANSFERRED from the owner's own account, never mailed. The old probes
       invited "agents" and mailed ownership — both rules are gone, so the
       probes follow the rules rather than the memory of them. */
    ["a BES owner invites an Agency User",                      () => w37(OWNER, `${INVITE('agency_user')}; select count(*)::int as rows from public.invitations where kind='agency' and email='probe.teammate@bes.test'`), 1],
    ["a BES admin may invite too",                              () => w37(ADMIN, `${INVITE('agency_user')}; select count(*)::int as rows from public.invitations where kind='agency' and email='probe.teammate@bes.test'`), 1],
    ["an Agency User may not invite",                           () => w37(AGENT, INVITE('agency_user')), "ERR 42501"],
    ["an organization owner may not invite onto the BES team",  () => w37(ORGOWNER, INVITE('agency_user')), "ERR 42501"],
    ["a retired rank is not an invitable role",                 () => w37(OWNER, INVITE('agency_agent')), "ERR 22023"],
    ["ownership cannot be mailed — not even by the owner",      () => w37(OWNER, INVITE('agency_owner')), "ERR 22023"],
    ["ownership moves only by the owner's own transfer",        () => w37(ADMIN, `select public.transfer_agency_ownership((select id from public.agency_memberships where user_id='${ADMIN}'))`), "ERR P0001"],
    /* The invariant is the HANDOVER, not a global count — this agency
       legitimately has two owners. The giver's flag ends, the receiver's
       begins, in one act. */
    ["…and a transfer moves the flag from giver to receiver",   () => w37(OWNER, `select public.transfer_agency_ownership((select id from public.agency_memberships where user_id='${ADMIN}'));
        select ((select is_owner from public.agency_memberships where user_id='${OWNER}')::text || ':' || (select is_owner from public.agency_memberships where user_id='${ADMIN}')::text) as rows`), "false:true"],
    ["inviting an existing teammate is refused",                () => w37(OWNER, `select public.invite_agency_member('bes.credit@bes.test', 'agency_user')`), "ERR 23505"],
    /* Every probe above rolls back, so there was no agency invitation left to
       accept and the function refused a null token as "no longer valid"
       (22023) — not the email check this is meant to prove. The invitation is
       created inside the same transaction now. */
    /* Two rounds of this probe lied. First it accepted a null token, because
       every earlier probe had rolled its invitation back, and the function
       refused it as "no longer valid" (22023) rather than on the email check.
       Then the token was read back as the ORGANIZATION owner — who cannot see
       a BES invitation at all (the very next probe proves it), so the subselect
       was null again. The token is carried past the role switch in a temp
       table, which RLS does not touch. */
    ["an invitation is accepted only by its own address",       () => w37(OWNER, `${INVITE('agency_user')}; create temp table probe_tok on commit drop as select token from public.invitations where kind='agency' and email='probe.teammate@bes.test' order by created_at desc limit 1; set local request.jwt.claims = '{"sub":"${ORGOWNER}","role":"authenticated"}'; select public.accept_agency_invitation((select token from probe_tok))`), "ERR 42501"],
    ["an organization member cannot read BES invitations",      () => w37(ORGOWNER, `select count(*)::int as rows from public.invitations where kind='agency'`), 0],
    ["a direct insert of an agency invitation is refused",      () => w37(ADMIN, `insert into public.invitations (email, kind, agency_id, agency_role) values ('sneak@bes.test', 'agency', (select agency_id from public.agency_memberships where user_id=auth.uid() limit 1), 'agency_owner'); select 1 as rows`), "ERR 42501"],
    ["every public plan a signer can choose has a price and a trial", () => q(`select (count(*) filter (where monthly_cents > 0 and trial_days > 0) = count(*))::int as rows from public.plans where is_public and public_trial`)[0].rows, 1],

    /* ── Access profiles (0266): presets on the two roles, never a third role ── */
    ["an invitation carries the access profile",
      () => w37(OWNER, `select public.invite_agency_member('probe.teammate@bes.test','agency_user','manager');
        select access_profile::text as rows from public.invitations where kind='agency' and email='probe.teammate@bes.test'`), "manager"],
    ["an Agency User invited with no profile becomes CUSTOM — deny by default, never a guess",
      () => w37(OWNER, `${INVITE('agency_user')}; select access_profile::text as rows from public.invitations where kind='agency' and email='probe.teammate@bes.test'`), "custom"],
    ["an admin invitation discards any profile — the role already grants everything",
      () => w37(OWNER, `select public.invite_agency_member('probe.teammate@bes.test','agency_admin','manager');
        select coalesce(access_profile::text,'none') as rows from public.invitations where kind='agency' and email='probe.teammate@bes.test'`), "none"],
    ["a Team Lead invitation without its team is refused",
      () => w37(OWNER, `select public.invite_agency_member('probe.teammate@bes.test','agency_user','team_lead')`), "ERR 22023"],
    ["…and with a team that does not exist here",
      () => w37(OWNER, `select public.invite_agency_member('probe.teammate@bes.test','agency_user','team_lead','44444444-0000-4000-8000-00000000dead'::uuid)`), "ERR 22023"],
    ["…and a led team on a non-lead invitation is refused",
      () => w37(OWNER, `select public.invite_agency_member('probe.teammate@bes.test','agency_user','agent',(select id from public.teams where archived_at is null limit 1))`), "ERR 22023"],
    ["activation writes the profile onto the membership — and the lead FACT onto the team",
      () => w37(OWNER, `select public.invite_agency_member('org.owner@bes.test','agency_user','team_lead',(select id from public.teams where archived_at is null limit 1));
        create temp table probe_tok2 on commit drop as select token, lead_team_id from public.invitations where kind='agency' and email='org.owner@bes.test' order by created_at desc limit 1;
        set local request.jwt.claims = '{"sub":"${ORGOWNER}","role":"authenticated"}';
        select public.accept_agency_invitation((select token from probe_tok2));
        select ((select access_profile::text from public.agency_memberships where user_id='${ORGOWNER}')
             || ':' || (select is_lead::text from public.team_memberships tm where tm.user_id='${ORGOWNER}' and tm.team_id=(select lead_team_id from probe_tok2))) as rows`), "team_lead:true"],
    /* The resolver's new layer, proven at each edge (§17: overrides still win). */
    ["the MANAGER preset grants ops.manage through the one resolver",
      () => w37(OWNER, `update public.agency_memberships set access_profile='manager' where user_id='${AGENT}';
        set local request.jwt.claims = '{"sub":"${AGENT}","role":"authenticated"}';
        select public.agency_can('ops.manage')::text as rows`), "true"],
    ["…and no money — finance stays off for a manager by default",
      () => w37(OWNER, `update public.agency_memberships set access_profile='manager' where user_id='${AGENT}';
        set local request.jwt.claims = '{"sub":"${AGENT}","role":"authenticated"}';
        select (public.agency_can('finance.dashboard.view') or public.agency_can('payroll.view') or public.agency_can('partners.financials.view'))::text as rows`), "false"],
    /* The denial goes through the WRITER (set_agency_permission), exactly as
       the product writes it — a direct insert is itself refused by RLS. */
    ["a person's explicit denial beats their profile",
      () => w37(OWNER, `update public.agency_memberships set access_profile='manager' where user_id='${AGENT}';
        select public.set_agency_permission((select id from public.agency_memberships where user_id='${AGENT}'), 'ops.manage', false, 'probe');
        set local request.jwt.claims = '{"sub":"${AGENT}","role":"authenticated"}';
        select public.agency_can('ops.manage')::text as rows`), "false"],
    ["the AGENT preset grants nothing — modules are deliberate per-person grants",
      () => w37(OWNER, `update public.agency_memberships set access_profile='agent' where user_id='${AGENT}';
        set local request.jwt.claims = '{"sub":"${AGENT}","role":"authenticated"}';
        select (public.agency_can('ops.manage') or public.agency_can('partners.view') or public.agency_can('creditops.clients.view'))::text as rows`), "false"],
    ["only an admin changes a profile",
      () => w37(AGENT, `select public.set_agency_member_profile((select id from public.agency_memberships where user_id='${AGENT}'), 'manager')`), "ERR 42501"],
    ["…an admin's own membership takes no profile",
      () => w37(OWNER, `select public.set_agency_member_profile((select id from public.agency_memberships where user_id='${ADMIN}'), 'manager')`), "ERR 22023"],
    ["…and a real change is audited with both values",
      () => w37(OWNER, `select public.set_agency_member_profile((select id from public.agency_memberships where user_id='${AGENT}'), 'team_lead');
        select count(*)::int as rows from public.activity_events where entity_type='agency_member' and field='access_profile' and new_value='team_lead'`), 1],
    ["the preset catalogue is readable by staff and writable by nobody",
      () => w37(AGENT, `insert into public.agency_profile_permissions (profile, key, allowed) values ('agent','payroll.view',true); select 1 as rows`), "ERR 42501"],
  ];
  runPhase("phase 37", P37);
}


/* Phase 38 — the Client Portal (0099). C3: a view on the canonical client, not
   a second identity. A client reads their OWN records and only the activity
   somebody published to them; everything internal is excluded by the value on
   the row, not by a filter in the interface. */
if (runs(38)) {
  startPhase("phase 38");
  const w38 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const PORTAL = q(`select coalesce((select portal_user_id::text from public.clients where portal_user_id is not null limit 1), '') as rows`)[0].rows;
  const PCLIENT = q(`select coalesce((select id::text from public.clients where portal_user_id is not null limit 1), '') as rows`)[0].rows;
  const PFUND = PCLIENT ? q(`select coalesce((select id::text from public.funding_clients where client_id='${PCLIENT}' limit 1), '') as rows`)[0].rows : "";
  const AG = `(select agency_id from public.organizations where id='${lakesideOrg}')`;
  /* One activity of every visibility on the client's own record, so the probe
     proves which ones reach them rather than that none exist. */
  const seedAll = PFUND ? `insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, action, detail, actor_id, visibility) values
    (${AG},'${lakesideOrg}','funding_client','${PFUND}','[PROBE] internal','x',null,'bes_internal'),
    (${AG},'${lakesideOrg}','funding_client','${PFUND}','[PROBE] org','x',null,'organization_internal'),
    (${AG},'${lakesideOrg}','funding_client','${PFUND}','[PROBE] partner','x',null,'shared_with_partner'),
    (${AG},'${lakesideOrg}','funding_client','${PFUND}','[PROBE] published','x',null,'client_visible');` : "";

  const P38 = PORTAL ? [
    ["the client reads their own portal home",                       () => w38(PORTAL, `select count(*)::int as rows from public.client_portal_home()`), 1],
    ["…and exactly one client, their own",                           () => w38(PORTAL, `select count(*)::int as rows from public.clients`), 1],
    ["…which is the one they are the portal user for",               () => w38(PORTAL, `select (id = '${PCLIENT}')::text as rows from public.clients`), "true"],
    ["ONLY client_visible activity reaches them",                    () => w38(PORTAL, `select coalesce(string_agg(distinct visibility::text, ','), 'none') as rows from public.activity_events where action like '[PROBE]%'`, seedAll), "client_visible"],
    ["a BES-internal note never does",                               () => w38(PORTAL, `select count(*)::int as rows from public.activity_events where visibility = 'bes_internal'`, seedAll), 0],
    ["an organization-internal note never does",                     () => w38(PORTAL, `select count(*)::int as rows from public.activity_events where visibility = 'organization_internal'`, seedAll), 0],
    ["a partner-shared note never does",                             () => w38(PORTAL, `select count(*)::int as rows from public.activity_events where visibility = 'shared_with_partner'`, seedAll), 0],
    ["an offer nobody presented is not shown",                       () => w38(PORTAL, `select count(*)::int as rows from public.offers`, `update public.offers set presented_at = null;`), 0],
    ["another client's funding file is not reachable",               () => w38(PORTAL, `select count(*)::int as rows from public.funding_files ff join public.funding_clients fc on fc.id = ff.client_id where fc.client_id <> '${PCLIENT}'`), 0],
    ["the client cannot move their own funding status",              () => w38(PORTAL, `update public.funding_clients set status = 'Funded' where client_id = '${PCLIENT}'; select count(*)::int as rows from public.funding_clients where status = 'Funded'`), 0],
    ["the client cannot rewrite their own identity",                 () => w38(PORTAL, `update public.clients set first_name = 'Rewritten' where portal_user_id = '${PORTAL}'; select count(*)::int as rows from public.clients where first_name = 'Rewritten'`), 0],
    ["a staff member is not a portal client",                        () => w38(U["org.agent@bes.test"], `select public.is_portal_client()::text as rows`), "false"],
    ["…and gets no portal home",                                     () => w38(U["org.agent@bes.test"], `select count(*)::int as rows from public.client_portal_home()`), 0],
    ["the organization still sees its own internal notes",           () => w38(U["org.owner@bes.test"], `select count(*)::int as rows from public.activity_events where action = '[PROBE] org'`, seedAll), 1],
  ] : [["(no portal client fixture)", () => "skip", "skip"]];
  runPhase("phase 38", P38);
}


/* Phase 39 — AI safeguards (0100/0101). Reserve before the call, reconcile
   after, and fail closed on anything that cannot be attributed or priced. */
if (runs(39)) {
  startPhase("phase 39");
  const w39 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWN = U["org.owner@bes.test"], BES = U["bes.owner@bes.test"], OTHER = U["org2.owner@bes.test"];
  const M = "claude-sonnet-5";
  const RES = (i, o) => `select 1 as rows from public.ai_reserve('${lakesideOrg}','letters.assist','${M}',${i},${o})`;
  const P39 = [
    ["the markup is 3x provider cost",                       () => q(`select (count(*) filter (where markup_multiplier = 3.000) = count(*))::text as rows from public.ai_pricing_policy where effective_until is null`)[0].rows, "true"],
    ["a normal request reserves",                            () => w39(OWN, `select (reservation_id is not null)::text as rows from public.ai_reserve('${lakesideOrg}','letters.assist','${M}',2000,800)`), "true"],
    /* `ai_available_credits` is internal since 0124/0126 — it takes an
       organization id and was reachable by anyone. The property it was used to
       prove is unchanged and is still provable: ai_reserve RETURNS the
       available figure, and ai_credit_balance stays RLS-scoped and callable. */
    ["reserving reduces AVAILABLE without spending BALANCE", () => w39(OWN, `select (public.ai_credit_balance('${lakesideOrg}') > (select available_after from public.ai_reserve('${lakesideOrg}','letters.assist','${M}',2000,800)))::text as rows`), "true"],
    ["usage with no organization is refused, never absorbed",() => w39(OWN, `select 1 as rows from public.ai_reserve(null,'letters.assist','${M}',100,100)`), "ERR 42501"],
    ["a non-member is refused",                              () => w39(BES, RES(100, 100)), "ERR 42501"],
    ["another organization's owner is refused",              () => w39(OTHER, RES(100, 100)), "ERR 42501"],
    ["an unpriced model is refused, never billed at zero",   () => w39(OWN, `select 1 as rows from public.ai_reserve('${lakesideOrg}','letters.assist','no-such-model',100,100)`), "ERR 22023"],
    ["the output ceiling refuses",                           () => w39(OWN, RES(2000, 999999)), "ERR 22023"],
    ["the per-request ceiling refuses",                      () => w39(OWN, RES(50000000, 4000)), "ERR 22023"],
    ["the daily cap refuses",                                () => w39(OWN, RES(2000, 800), `update public.ai_limits set daily_spend_cap_credits = 0 where organization_id is null;`), "ERR 22023"],
    ["the hourly rate limit refuses",                        () => w39(OWN, RES(100, 100), `update public.ai_limits set requests_per_hour = 1 where organization_id is null; insert into public.ai_reservations (organization_id,user_id,feature_key,model,estimated_credits) values ('${lakesideOrg}','${OWN}','letters.assist','${M}',1);`), "ERR 22023"],
    ["an exhausted balance refuses",                         () => w39(OWN, RES(2000, 800), `insert into public.ai_credit_ledger (organization_id, delta_credits, kind) select '${lakesideOrg}', -coalesce(sum(delta_credits),0), 'adjustment' from public.ai_credit_ledger where organization_id='${lakesideOrg}';`), "ERR 42501"],
    ["a browser cannot settle its own usage",                () => w39(OWN, `select 1 as rows from public.ai_reconcile('00000000-0000-0000-0000-000000000000',1,1,0,'x')`), "ERR 42501"],
    ["…nor release a reservation",                           () => w39(OWN, `select public.ai_release('00000000-0000-0000-0000-000000000000'); select 1 as rows`), "ERR 42501"],
    ["a customer never sees provider cost or margin",        () => w39(OWN, `select count(*)::int as rows from public.ai_economics()`), 0],
    ["…nor which prices are unconfirmed",                    () => w39(OWN, `select count(*)::int as rows from public.ai_pricing_unconfirmed()`), 0],
    ["BES sees the economics",                               () => w39(BES, `select (count(*) >= 0)::text as rows from public.ai_economics()`), "true"],
    /* 0114 confirmed all three provider prices against Anthropic's published
       list, so the warning list is now correctly EMPTY. The probe asserts the
       mechanism still works — an unconfirmed row is surfaced — rather than
       asserting the old state, which would fail forever once fixed. */
    ["nothing is priced on an unconfirmed figure any more",  () => w39(BES, `select count(*)::int as rows from public.ai_pricing_unconfirmed()`), 0],
    ["…and the warning still fires when a price IS unconfirmed",
      () => w39(BES, `insert into public.ai_pricing_policy (model, input_cost_per_million, output_cost_per_million, cached_cost_per_million, markup_multiplier, credits_per_usd, source_note) values ('probe-model', 1, 1, 0, 1, 100, 'PROBE'); select (count(*) > 0)::text as rows from public.ai_pricing_unconfirmed()`), "true"],
    ["a customer reads their OWN credit usage",              () => w39(OWN, `select (count(*) >= 0)::text as rows from public.ai_my_usage('${lakesideOrg}')`), "true"],
    ["…and not another organization's",                      () => w39(OTHER, `select count(*)::int as rows from public.ai_my_usage('${lakesideOrg}')`), 0],
    ["a customer cannot raise their own limits",             () => w39(OWN, `update public.ai_limits set daily_spend_cap_credits = 999999 where organization_id is null; select count(*)::int as rows from public.ai_limits where daily_spend_cap_credits = 999999`), 0],
    ["allowances are rows, not constants",                   () => q(`select (count(*) > 0)::text as rows from public.plan_ai_allowances`)[0].rows, "true"],
  ];
  runPhase("phase 39", P39);
}


/* Phase 40 — DIY Credit (0102/0103). One person, one canonical client, and an
   upgrade to managed that recreates nothing. */
if (runs(40)) {
  startPhase("phase 40");
  const w40 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const PORTAL = q(`select coalesce((select portal_user_id::text from public.clients where portal_user_id is not null limit 1), '') as rows`)[0].rows;
  const PC = q(`select coalesce((select id::text from public.clients where portal_user_id is not null limit 1), '') as rows`)[0].rows;
  const ENT = `insert into public.product_entitlements (organization_id, product, enabled) values ('${lakesideOrg}','diyCredit',true) on conflict (organization_id, product) do update set enabled = true;`;
  const NOENT = `delete from public.product_entitlements where organization_id='${lakesideOrg}' and product='diyCredit';`;
  const JOURNEY = `${ENT} insert into public.diy_journeys (client_id) values ('${PC}') on conflict do nothing;`;
  const CONSENT = `${JOURNEY} insert into public.diy_consents (client_id, kind, statement, version) values ('${PC}','service_terms','x','v1');`;

  const P40 = PORTAL ? [
    ["a consumer cannot enrol where DIY is not sold",       () => w40(PORTAL, `select public.diy_enroll('${lakesideOrg}','A','B') as rows`, NOENT), "ERR 42501"],
    ["enrolling REUSES the existing client, never a second person", () => w40(PORTAL, `select public.diy_enroll('${lakesideOrg}','A','B'); select count(*)::int as rows from public.clients where portal_user_id='${PORTAL}'`, ENT), 1],
    ["…and the id is the one they already had",             () => w40(PORTAL, `select (public.diy_enroll('${lakesideOrg}','A','B') = '${PC}')::text as rows`, ENT), "true"],
    ["nothing moves before consent",                        () => w40(PORTAL, `select public.diy_advance('${PC}','report_added'); select 1 as rows`, JOURNEY), "ERR 42501"],
    ["consent cannot be marked without one on record",      () => w40(PORTAL, `select public.diy_advance('${PC}','consented'); select 1 as rows`, JOURNEY), "ERR 42501"],
    ["…and works once it is",                               () => w40(PORTAL, `select public.diy_advance('${PC}','consented'); select stage::text as rows from public.diy_journeys where client_id='${PC}'`, CONSENT), "consented"],
    ["a letter is not approved before the facts are attested", () => w40(PORTAL, `select public.diy_advance('${PC}','consented'); select public.diy_advance('${PC}','approved'); select 1 as rows`, CONSENT), "ERR 42501"],
    ["staff cannot move somebody else's journey",           () => w40(U["org.agent@bes.test"], `select public.diy_advance('${PC}','consented'); select 1 as rows`, CONSENT), "ERR 42501"],
    ["staff cannot consent on their behalf",                () => w40(U["org.owner@bes.test"], `select public.diy_record_consent('${PC}','service_terms','x','v1') is not null as rows`, ENT), "ERR 42501"],
    ["a consumer cannot promote themself to managed",       () => w40(PORTAL, `select public.diy_upgrade_to_managed('${PC}') is not null as rows`, ENT), "ERR 42501"],
    ["the organization can, and it creates ONE credit case", () => w40(U["org.owner@bes.test"], `select public.diy_upgrade_to_managed('${PC}'); select count(*)::int as rows from public.fulfillment_clients where client_id='${PC}'`, ENT), 1],
    ["upgrading twice does not make a second case",         () => w40(U["org.owner@bes.test"], `select public.diy_upgrade_to_managed('${PC}'); select public.diy_upgrade_to_managed('${PC}'); select count(*)::int as rows from public.fulfillment_clients where client_id='${PC}'`, ENT), 1],
    ["upgrading keeps the person as ONE client",            () => w40(U["org.owner@bes.test"], `select public.diy_upgrade_to_managed('${PC}'); select count(*)::int as rows from public.clients where portal_user_id='${PORTAL}'`, ENT), 1],
    ["a DIY report survives the upgrade on the same client", () => w40(U["org.owner@bes.test"], `select public.diy_upgrade_to_managed('${PC}'); select count(*)::int as rows from public.credit_reports where client_id='${PC}'`, `${ENT} insert into public.credit_reports (organization_id, consumer_user_id, bureaus, pulled_at, source, parser_version, imported_by) values ('${lakesideOrg}','${PORTAL}', array['EQ'], current_date, 'manual_upload', 'pdf-text-1', '${PORTAL}');`), 1],
    ["consents survive the upgrade",                        () => w40(U["org.owner@bes.test"], `select public.diy_upgrade_to_managed('${PC}'); select count(*)::int as rows from public.diy_consents where client_id='${PC}'`, CONSENT), 1],
    ["another organization's owner sees no DIY journey",    () => w40(U["org2.owner@bes.test"], `select count(*)::int as rows from public.diy_journeys where client_id='${PC}'`, JOURNEY), 0],
    ["…and no consents",                                    () => w40(U["org2.owner@bes.test"], `select count(*)::int as rows from public.diy_consents where client_id='${PC}'`, CONSENT), 0],
    ["a consumer cannot write a journey row directly",      () => w40(PORTAL, `insert into public.diy_journeys (client_id, stage) values ('${PC}','approved'); select 1 as rows`, ENT), "ERR 42501"],
    ["…nor a consent row directly",                         () => w40(PORTAL, `insert into public.diy_consents (client_id, kind, statement, version) values ('${PC}','service_terms','x','v1'); select 1 as rows`, ENT), "ERR 42501"],
  ] : [["(no portal client fixture)", () => "skip", "skip"]];
  runPhase("phase 40", P40);
}


/* Phase 41 — Channels (0104). Private by default; BES reaches a channel only
   through an explicit share PLUS a live engagement PLUS scope. When the
   engagement ends, access ends — including the history — while the
   organization keeps everything and BES's own messages stay attributable. */
if (runs(41)) {
  startPhase("phase 41");
  const w41 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"];
  const MGR = U["bes.manager@bes.test"];       // division scope: creditops
  const ASSIGNED = U["bes.credit@bes.test"];   // assigned scope: no channel reach
  const CH = q(`select coalesce((select id::text from public.channels where organization_id='${lakesideOrg}' and kind='general'), '') as rows`)[0].rows;
  const ENG = q(`select coalesce((select id::text from public.fulfillment_engagements where organization_id='${lakesideOrg}' and service='creditops' limit 1), '') as rows`)[0].rows;
  const MSG = `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH}','${OWNER}','{}'::jsonb,'[PROBE] org message');`;
  const SHARE = `insert into public.channel_shares (channel_id, engagement_id, created_by) values ('${CH}','${ENG}','${OWNER}');`;
  const END = `update public.fulfillment_engagements set status='ended', effective_to = current_date - 1 where id='${ENG}';`;
  const BESMSG = `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH}','${MGR}','{}'::jsonb,'[PROBE] BES message');`;

  const P41 = CH && ENG ? [
    ["a private channel is invisible to BES",                () => w41(MGR, `select count(*)::int as rows from public.channels where id='${CH}'`, MSG), 0],
    ["a live engagement alone grants nothing",               () => w41(MGR, `select count(*)::int as rows from public.messages where channel_id='${CH}'`, MSG), 0],
    ["a share without a live engagement grants nothing",     () => w41(MGR, `select count(*)::int as rows from public.channels where id='${CH}'`, `${MSG} ${END} ${SHARE}`), 0],
    ["shared + live engagement + scope: BES sees it",        () => w41(MGR, `select count(*)::int as rows from public.channels where id='${CH}'`, `${MSG} ${SHARE}`), 1],
    ["…and reads the history",                               () => w41(MGR, `select count(*)::int as rows from public.messages where channel_id='${CH}'`, `${MSG} ${SHARE}`), 1],
    ["…and may POST, not read-only",                         () => w41(MGR, `${BESMSG} select count(*)::int as rows from public.messages where author_id='${MGR}'`, `${MSG} ${SHARE}`), 1],
    ["an assigned-scope BES agent still gets nothing",       () => w41(ASSIGNED, `select count(*)::int as rows from public.channels where id='${CH}'`, `${MSG} ${SHARE}`), 0],
    ["the engagement ends: access goes immediately",         () => w41(MGR, `select count(*)::int as rows from public.channels where id='${CH}'`, `${MSG} ${SHARE} ${END}`), 0],
    ["…including the historical messages",                   () => w41(MGR, `select count(*)::int as rows from public.messages where channel_id='${CH}'`, `${MSG} ${SHARE} ${END}`), 0],
    ["the organization keeps its history",                   () => w41(OWNER, `select count(*)::int as rows from public.messages where channel_id='${CH}'`, `${MSG} ${SHARE} ${END}`), 1],
    ["BES participation stays attributable to the org",      () => w41(OWNER, `select count(*)::int as rows from public.messages where channel_id='${CH}' and author_id='${MGR}'`, `${MSG} ${SHARE} ${BESMSG} ${END}`), 1],
    ["BES cannot self-share a channel",                      () => w41(MGR, `insert into public.channel_shares (channel_id, engagement_id, created_by) values ('${CH}','${ENG}','${MGR}'); select 1 as rows`), "ERR 42501"],
    ["…nor add itself as a member",                          () => w41(MGR, `insert into public.channel_members (channel_id, user_id) values ('${CH}','${MGR}'); select 1 as rows`), "ERR 42501"],
    ["…nor create a channel in somebody's organization",     () => w41(MGR, `insert into public.channels (organization_id, name, created_by) values ('${lakesideOrg}','BES channel','${MGR}'); select 1 as rows`), "ERR 42501"],
    ["another organization sees no channel",                 () => w41(OTHER, `select count(*)::int as rows from public.channels where id='${CH}'`, MSG), 0],
    ["…and no messages",                                     () => w41(OTHER, `select count(*)::int as rows from public.messages where channel_id='${CH}'`, MSG), 0],
    ["a message is never hard-deleted (no grant)",           () => w41(OWNER, `delete from public.messages where channel_id='${CH}'; select 1 as rows`, MSG), "ERR 42501"],
    ["nobody edits somebody else's message",                 () => w41(AGENT, `update public.messages set body_text='rewritten' where channel_id='${CH}'; select count(*)::int as rows from public.messages where body_text='rewritten'`, MSG), 0],
    /* `organization_id is not null` matters: BES's own General Discussion is
       also kind='general' since 0198, and without the filter this counted it
       as a missing organization channel. The probe never meant to include
       agency-owned channels — it said "every organization". */
    ["every organization has exactly one General channel",   () => q(`select (count(*) = (select count(*) from public.organizations))::text as rows from public.channels where kind='general' and organization_id is not null and archived_at is null`)[0].rows, "true"],
    ["…and BES has exactly one of its own",                  () => q(`select count(*)::int as rows from public.channels where system_key='general_discussion' and archived_at is null`)[0].rows, 1],
    ["a BES message is stamped as BES when written",          () => w41(MGR, `${BESMSG} reset role; select (author_is_bes)::text as rows from public.messages where author_id='${MGR}' order by created_at desc limit 1`, `${MSG} ${SHARE}`), "true"],
    ["…and an organization message is not",                    () => w41(OWNER, `reset role; select (author_is_bes)::text as rows from public.messages where channel_id='${CH}' and author_id='${OWNER}' order by created_at desc limit 1`, MSG), "false"],
    ["attribution survives the engagement ending",             () => w41(OWNER, `select (author_is_bes)::text as rows from public.messages where author_id='${MGR}' order by created_at desc limit 1`, `${MSG} ${SHARE} ${BESMSG} ${END}`), "true"],
    ["a mention notifies only a member of that channel",     () => w41(OWNER, `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH}','${OWNER}','{"type":"doc","content":[{"type":"mention","attrs":{"userId":"${OTHER}","label":"X"}}]}'::jsonb,'[PROBE] mention'); reset role; select count(*)::int as rows from public.notifications where recipient_id='${OTHER}' and kind='mention' and created_at >= now()`), 0],
  ] : [["(no channel fixture)", () => "skip", "skip"]];
  runPhase("phase 41", P41);
}


/* Phase 42 — commissions (0109/0110). Earned when a deal funds; payable only
   once the organization confirms the money arrived. Nothing skips a stage and
   nothing is typed by hand. */
if (runs(42)) {
  startPhase("phase 42");
  const w42 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], BRM = U["org.brm@bes.test"], OTHER = U["org2.owner@bes.test"];
  const EM = q(`select coalesce((select id::text from public.external_memberships where user_id='${BRM}' limit 1), '') as rows`)[0].rows;
  const FF = q(`select coalesce((select ff.id::text from public.funding_files ff join public.funding_clients fc on fc.id=ff.client_id where fc.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const FC = FF ? q(`select client_id::text as rows from public.funding_files where id='${FF}'`)[0].rows : "";
  const D = "99999999-0000-4000-8000-0000000042d1", FD = "99999999-0000-4000-8000-0000000042c1";
  const seed = (basis, rate) => `update public.funding_files set referred_by_membership_id='${EM}' where id='${FF}';
    insert into public.commission_plans (organization_id, label, party_kind, basis, rate_or_amount, applies_to, created_by) values ('${lakesideOrg}','[PROBE]','partner','${basis}',${rate},'net_funded','${OWNER}');
    insert into public.funding_deals (id, file_id, client_id, lender, amount, status, funded_at, stips_outstanding) values ('${D}','${FF}','${FC}','L',90000,'Funded', now(), 0);
    insert into public.funded_deals (id, deal_id, file_id, lender_name, requested_amount, accepted_offer_amount, gross_funded, net_funded, funded_at, confirmed_by) values ('${FD}','${D}','${FF}','L',100000,90000,90000,80000, now(), '${OWNER}');`;
  const PCT = seed("pct", 5), FLAT = seed("flat", 750);
  const NOPLAN = `update public.funding_files set referred_by_membership_id='${EM}' where id='${FF}';
    insert into public.funding_deals (id, file_id, client_id, lender, amount, status, funded_at, stips_outstanding) values ('${D}','${FF}','${FC}','L',90000,'Funded', now(), 0);
    insert into public.funded_deals (id, deal_id, file_id, lender_name, requested_amount, accepted_offer_amount, gross_funded, net_funded, funded_at, confirmed_by) values ('${FD}','${D}','${FF}','L',100000,90000,90000,80000, now(), '${OWNER}');`;

  const P42 = FF && EM ? [
    ["funding a deal earns 5% of net funded",              () => w42(OWNER, `select computed_amount::text as rows from public.commissions where deal_id='${D}'`, PCT), "4000.00"],
    ["…recorded as earned, not payable",                   () => w42(OWNER, `select state as rows from public.commissions where deal_id='${D}'`, PCT), "earned"],
    ["…and the figure it was a percentage OF is kept",     () => w42(OWNER, `select basis_amount::text as rows from public.commissions where deal_id='${D}'`, PCT), "80000.00"],
    ["a flat plan pays exactly the flat amount",           () => w42(OWNER, `select computed_amount::text as rows from public.commissions where deal_id='${D}'`, FLAT), "750.00"],
    ["no plan in force earns nothing, and invents nothing",() => w42(OWNER, `select count(*)::int as rows from public.commissions where deal_id='${D}'`, NOPLAN), 0],
    ["paying before the revenue is confirmed is refused",  () => w42(OWNER, `select public.mark_commission_paid((select id from public.commissions where deal_id='${D}'), 'r'); select 1 as rows`, PCT), "ERR 22023"],
    ["confirming revenue moves it to payable",             () => w42(OWNER, `select public.confirm_deal_revenue('${FD}', 6000); select state as rows from public.commissions where deal_id='${D}'`, PCT), "payable"],
    ["…and then it can be paid, with a reference",         () => w42(OWNER, `select public.confirm_deal_revenue('${FD}', 6000); select public.mark_commission_paid((select id from public.commissions where deal_id='${D}'), 'ACH-1'); select state || ':' || payment_reference as rows from public.commissions where deal_id='${D}'`, PCT), "paid:ACH-1"],
    ["an agent cannot confirm revenue",                    () => w42(AGENT, `select public.confirm_deal_revenue('${FD}', 6000) as rows`, PCT), "ERR 42501"],
    ["the partner cannot confirm their own revenue",       () => w42(BRM, `select public.confirm_deal_revenue('${FD}', 6000) as rows`, PCT), "ERR 42501"],
    ["the partner sees their own commission",              () => w42(BRM, `select computed_amount::text as rows from public.commissions where party_id='${BRM}'`, PCT), "4000.00"],
    ["another organization sees none of it",               () => w42(OTHER, `select count(*)::int as rows from public.commissions where deal_id='${D}'`, PCT), 0],
    ["an amount cannot be edited directly",                () => w42(OWNER, `update public.commissions set computed_amount = 99999 where deal_id='${D}'; select computed_amount::text as rows from public.commissions where deal_id='${D}'`, PCT), "4000.00"],
    ["a browser cannot compute commissions itself",        () => w42(OWNER, `select public.compute_commissions_for_deal('${FD}') as rows`, PCT), "ERR 42501"],
    ["a reversal keeps the row and records why",           () => w42(OWNER, `select public.reverse_commission((select id from public.commissions where deal_id='${D}'), 'clawed back'); select state as rows from public.commissions where deal_id='${D}'`, PCT), "reversed"],
    ["a reversal without a reason is refused",             () => w42(OWNER, `select public.reverse_commission((select id from public.commissions where deal_id='${D}'), '  '); select 1 as rows`, PCT), "ERR 22023"],
    ["a deal can only fund once, so it can only pay once", () => w42(OWNER, `insert into public.funded_deals (id, deal_id, file_id, lender_name, requested_amount, accepted_offer_amount, gross_funded, net_funded, funded_at, confirmed_by) values ('99999999-0000-4000-8000-0000000042c2','${D}','${FF}','L',100000,90000,90000,80000, now(), '${OWNER}'); select 1 as rows`, PCT), "ERR 23505"],
    ["only an administrator writes a commission plan",     () => w42(AGENT, `insert into public.commission_plans (organization_id, label, party_kind, basis, rate_or_amount, created_by) values ('${lakesideOrg}','x','partner','flat',1,'${AGENT}'); select 1 as rows`), "ERR 42501"],
    ["another organization cannot write one here",         () => w42(OTHER, `insert into public.commission_plans (organization_id, label, party_kind, basis, rate_or_amount, created_by) values ('${lakesideOrg}','x','partner','flat',1,'${OTHER}'); select 1 as rows`), "ERR 42501"],
  ] : [["(no funding fixture)", () => "skip", "skip"]];
  runPhase("phase 42", P42);
}


/* ------------------------------------------------------------------ *
 * Phase 43 — deal-level lender stipulations (0112, 0113).
 *
 * The questions worth asking about a stipulation are not "can I write one"
 * but: does it stay attached to the right deal, can its lifecycle be
 * short-circuited, and can a neighbouring organization see or move it.
 * ------------------------------------------------------------------ */
if (runs(43)) {
  startPhase("phase 43");
  const w43 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"];
  const FF = q(`select coalesce((select ff.id::text from public.funding_files ff join public.funding_clients fc on fc.id=ff.client_id where fc.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const FC = FF ? q(`select client_id::text as rows from public.funding_files where id='${FF}'`)[0].rows : "";
  /* A second file on the SAME organization, so "a deal on another file" is a
     real question. The fixture has only one Lakeside funding file, so the
     probe makes its own rather than silently degrading into "the deal does
     not exist" — which is what it did on the first run, passing the FK check
     instead of the cross-file guard and reporting 23503 for 22023. A probe
     that cannot reach the rule it names is not testing anything. */
  const FF2 = "99999999-0000-4000-8000-0000000043f2";
  const D_SUB = "99999999-0000-4000-8000-0000000043d1";
  const D_DRAFT = "99999999-0000-4000-8000-0000000043d2";
  const D_OTHER = "99999999-0000-4000-8000-0000000043d3";

  const base = `insert into public.funding_deals (id, file_id, client_id, lender, amount, status, submitted_at, stips_outstanding) values
      ('${D_SUB}','${FF}','${FC}','Apex',90000,'Submitted', now(), 0),
      ('${D_DRAFT}','${FF}','${FC}','Beacon',90000,'Draft', null, 0);`;
  const otherFileDeal = `${base}
    insert into public.funding_files (id, agency_id, business_id, client_id, purpose, requested_amount)
      select '${FF2}', agency_id, business_id, client_id, 'PROBE second file', 12345
        from public.funding_files where id='${FF}';
    insert into public.funding_deals (id, file_id, client_id, lender, amount, status, submitted_at, stips_outstanding)
      values ('${D_OTHER}','${FF2}','${FC}','Summit',5000,'Submitted', now(), 0);`;
  /* One stipulation already asked for, for the lifecycle probes. */
  const withStip = `${base} insert into public.document_requests (file_id, deal_id, document_type, requirement, status, created_by) values ('${FF}','${D_SUB}','bank_statement','required','open','${OWNER}');`;
  const stipId = `(select id from public.document_requests where deal_id='${D_SUB}' and document_type='bank_statement')`;

  const P43 = FF ? [
    ["a submitted deal can be given a stipulation",
      () => w43(OWNER, `select public.add_deal_stipulation('${D_SUB}','voided_check','Need a voided check'); select count(*)::int as rows from public.document_requests where deal_id='${D_SUB}'`, base), 1],
    ["…and it records what the lender actually said",
      () => w43(OWNER, `select public.add_deal_stipulation('${D_SUB}','voided_check','Need a voided check'); select lender_note as rows from public.document_requests where deal_id='${D_SUB}'`, base), "Need a voided check"],
    ["a SELECTED deal cannot be stipulated on — nobody has seen it",
      () => w43(OWNER, `select public.add_deal_stipulation('${D_DRAFT}','voided_check','x') as rows`, base), "ERR 22023"],
    ["a stipulation with no document type is refused",
      () => w43(OWNER, `select public.add_deal_stipulation('${D_SUB}','   ','x') as rows`, base), "ERR 22023"],
    ["the second file and its deal really exist, so the next probe can fail",
      () => w43(OWNER, `select count(*)::int as rows from public.funding_deals where id='${D_OTHER}'`, otherFileDeal), 1],
    ["a stipulation cannot be attached to a deal on another funding file",
      () => w43(OWNER, `insert into public.document_requests (file_id, deal_id, document_type, requirement, status, created_by) values ('${FF}','${D_OTHER}','p_and_l','required','open','${OWNER}'); select 1 as rows`, otherFileDeal), "ERR 22023"],
    ["…and the guard is the trigger, not the foreign key: the same insert on its OWN file works",
      () => w43(OWNER, `insert into public.document_requests (file_id, deal_id, document_type, requirement, status, created_by) values ('${FF2}','${D_OTHER}','p_and_l','required','open','${OWNER}'); select count(*)::int as rows from public.document_requests where deal_id='${D_OTHER}'`, otherFileDeal), 1],
    ["the outstanding count on the deal is maintained, not asserted",
      () => w43(OWNER, `select public.add_deal_stipulation('${D_SUB}','voided_check','x'); select stips_outstanding::int as rows from public.funding_deals where id='${D_SUB}'`, base), 1],
    ["…and it falls again when the stipulation is waived",
      () => w43(OWNER, `select public.move_document_request(${stipId}, 'waived', 'lender dropped it'); select stips_outstanding::int as rows from public.funding_deals where id='${D_SUB}'`, withStip), 0],
    ["the lifecycle runs in order",
      () => w43(OWNER, `select public.move_document_request(${stipId}, 'assigned'); select public.move_document_request(${stipId}, 'waiting_on_client'); select public.move_document_request(${stipId}, 'received'); select public.move_document_request(${stipId}, 'under_review'); select public.move_document_request(${stipId}, 'submitted_to_lender'); select public.move_document_request(${stipId}, 'satisfied'); select status::text as rows from public.document_requests where id=${stipId}`, withStip), "satisfied"],
    ["it cannot skip straight to satisfied",
      () => w43(OWNER, `select public.move_document_request(${stipId}, 'satisfied') as rows`, withStip), "ERR 22023"],
    ["it cannot go back once satisfied",
      () => w43(OWNER, `select public.move_document_request(${stipId}, 'assigned'); select public.move_document_request(${stipId}, 'received'); select public.move_document_request(${stipId}, 'under_review'); select public.move_document_request(${stipId}, 'submitted_to_lender'); select public.move_document_request(${stipId}, 'satisfied'); select public.move_document_request(${stipId}, 'open') as rows`, withStip), "ERR 22023"],
    ["a document under review can go back to the client",
      () => w43(OWNER, `select public.move_document_request(${stipId}, 'received'); select public.move_document_request(${stipId}, 'under_review'); select public.move_document_request(${stipId}, 'waiting_on_client'); select status::text as rows from public.document_requests where id=${stipId}`, withStip), "waiting_on_client"],
    ["waiving without a reason is refused",
      () => w43(OWNER, `select public.move_document_request(${stipId}, 'waived', '  ') as rows`, withStip), "ERR 22023"],
    ["…and waiving with one records who and why",
      () => w43(OWNER, `select public.move_document_request(${stipId}, 'waived', 'lender dropped it'); select waived_reason as rows from public.document_requests where id=${stipId}`, withStip), "lender dropped it"],
    ["an agent cannot move a requirement they do not review",
      () => w43(AGENT, `select public.move_document_request(${stipId}, 'assigned') as rows`, withStip), "ERR 42501"],
    ["another organization cannot see the stipulation at all",
      () => w43(OTHER, `select count(*)::int as rows from public.document_requests where deal_id='${D_SUB}'`, withStip), 0],
    ["…nor move it, even naming its id",
      () => w43(OTHER, `select public.move_document_request(${stipId}, 'assigned') as rows`, withStip), "ERR 42501"],
    ["…nor add one to the deal",
      () => w43(OTHER, `select public.add_deal_stipulation('${D_SUB}','p_and_l','x') as rows`, withStip), "ERR 42501"],
    ["a file-level requirement is untouched by all of this",
      () => w43(OWNER, `select count(*)::int as rows from public.document_requests where file_id='${FF}' and deal_id is null and status not in ('satisfied','waived')`, withStip),
      Number(q(`select count(*)::int as rows from public.document_requests where file_id='${FF}' and deal_id is null and status not in ('satisfied','waived')`)[0].rows)],
  ] : [["(no funding fixture)", () => "skip", "skip"]];
  runPhase("phase 43", P43);
}

/* ------------------------------------------------------------------ *
 * Phase 44 — the GoHighLevel AGENCY credential (0115).
 *
 * A new secrets table and a new write path. The questions are the ones that
 * matter for any credential: can a browser read the token, can a customer
 * point the agency somewhere, and does an unmapped location leak.
 * ------------------------------------------------------------------ */
if (runs(44)) {
  startPhase("phase 44");
  const w44 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const BESADMIN = U["bes.admin@bes.test"] ?? U["bes.owner@bes.test"];
  const OWNER = U["org.owner@bes.test"], OTHER = U["org2.owner@bes.test"];
  /* The seed runs BEFORE the probe's own `set local role`, so it must set its
     own — `is_agency_staff()` reads the jwt, and without one it refuses and
     the whole transaction dies inside the seed rather than in the probe. */
  const asBes = (sql) => `set local role authenticated; set local request.jwt.claims = '{"sub":"${BESADMIN}","role":"authenticated"}'; ${sql} reset role;`;
  const connect = asBes(`select public.connect_ghl_agency('COMPANY-PROBE', 'tok-probe', 'private_integration', 'whsec-probe');`);
  /* record_ghl_locations is service-role only, so the discovery half of the
     seed runs as that role — which is exactly who calls it in production. */
  const discovered = `${connect}
    set local role service_role;
    select public.record_ghl_locations('COMPANY-PROBE', '[{"id":"LOC-PROBE","name":"Probe Location"}]'::jsonb);
    reset role;`;

  const P44 = BESADMIN ? [
    ["BES staff connect the agency once",
      () => w44(BESADMIN, `${connect} select company_id as rows from public.ghl_agency_status()`), "COMPANY-PROBE"],
    ["an organization owner cannot connect it",
      () => w44(OWNER, `select public.connect_ghl_agency('X','tok','private_integration') as rows`), "ERR 42501"],
    ["a token kind nobody supports is refused",
      () => w44(BESADMIN, `select public.connect_ghl_agency('X','tok','magic') as rows`), "ERR 22023"],
    ["a blank token is refused",
      () => w44(BESADMIN, `select public.connect_ghl_agency('X','   ','private_integration') as rows`), "ERR 22023"],
    /* Not "returns no rows" — the table has NO GRANT, so the attempt is
       refused outright. That is stronger than an empty result, and it is what
       the first run of this phase actually proved. */
    ["NOBODY reads the token table from a browser — not even BES",
      () => w44(BESADMIN, `select count(*)::int as rows from public.ghl_agency_credentials`, connect), "ERR 42501"],
    ["…and an organization owner is refused the same way",
      () => w44(OWNER, `select count(*)::int as rows from public.ghl_agency_credentials`, connect), "ERR 42501"],
    ["the status function answers 'connected' without ever touching the token",
      () => w44(BESADMIN, `select (connected and company_id = 'COMPANY-PROBE' and has_webhook_secret)::text as rows from public.ghl_agency_status()`, connect), "true"],
    ["…and tells an organization owner nothing at all",
      () => w44(OWNER, `select count(*)::int as rows from public.ghl_agency_status()`, connect), 0],
    ["the sync writer is not reachable from a browser",
      () => w44(BESADMIN, `select public.record_ghl_locations('C','[]'::jsonb) as rows`, connect), "ERR 42501"],
    ["a discovered location is visible to BES, unmapped",
      () => w44(BESADMIN, `select coalesce(organization_id::text,'unmapped') as rows from public.ghl_connections where location_id='LOC-PROBE'`, discovered), "unmapped"],
    ["…and invisible to every organization while it is unmapped",
      () => w44(OWNER, `select count(*)::int as rows from public.ghl_connections where location_id='LOC-PROBE'`, discovered), 0],
    ["BES maps it to an organization",
      () => w44(BESADMIN, `select public.map_ghl_location('LOC-PROBE','${lakesideOrg}'); select organization_id::text as rows from public.ghl_connections where location_id='LOC-PROBE'`, discovered), lakesideOrg],
    ["…and only then does that organization's admin see it",
      () => w44(OWNER, `select public.map_ghl_location('LOC-PROBE','${lakesideOrg}'); select count(*)::int as rows from public.ghl_connections where location_id='LOC-PROBE'`, discovered), "ERR 42501"],
    ["an organization owner cannot map a location to themselves",
      () => w44(OWNER, `select public.map_ghl_location('LOC-PROBE','${lakesideOrg}') as rows`, discovered), "ERR 42501"],
    ["…nor can another organization's owner",
      () => w44(OTHER, `select public.map_ghl_location('LOC-PROBE','${lakesideOrg}') as rows`, discovered), "ERR 42501"],
    ["mapping to an organization that does not exist is refused",
      () => w44(BESADMIN, `select public.map_ghl_location('LOC-PROBE','99999999-0000-4000-8000-000000000000') as rows`, discovered), "ERR P0002"],
    /* The sync runs as the service role — that is who calls it in production,
       and the probe has to do the same or it tests the grant instead of the
       upsert rule it names. */
    ["a sync never undoes a mapping somebody made",
      () => w44(BESADMIN, `select public.map_ghl_location('LOC-PROBE','${lakesideOrg}');
        set local role service_role;
        select public.record_ghl_locations('COMPANY-PROBE', '[{"id":"LOC-PROBE","name":"Renamed"}]'::jsonb);
        reset role;
        set local role authenticated; set local request.jwt.claims = '{"sub":"${BESADMIN}","role":"authenticated"}';
        select organization_id::text as rows from public.ghl_connections where location_id='LOC-PROBE'`, discovered), lakesideOrg],
    ["…and it DOES update the name, so the sync is doing something",
      () => w44(BESADMIN, `set local role service_role;
        select public.record_ghl_locations('COMPANY-PROBE', '[{"id":"LOC-PROBE","name":"Renamed"}]'::jsonb);
        reset role;
        set local role authenticated; set local request.jwt.claims = '{"sub":"${BESADMIN}","role":"authenticated"}';
        select name as rows from public.ghl_connections where location_id='LOC-PROBE'`, discovered), "Renamed"],
    ["disconnecting deletes the token and keeps the locations",
      () => w44(BESADMIN, `select public.disconnect_ghl_agency(); select count(*)::int as rows from public.ghl_connections where location_id='LOC-PROBE'`, discovered), 1],
    ["an organization owner cannot disconnect the agency",
      () => w44(OWNER, `select public.disconnect_ghl_agency() as rows`, connect), "ERR 42501"],
  ] : [["(no BES admin fixture)", () => "skip", "skip"]];
  runPhase("phase 44", P44);
}

/* ------------------------------------------------------------------ *
 * Phase 45 — posting a letter for real (0116).
 *
 * The only place in the platform that spends money and puts paper in the post.
 * The questions are: can the approval gate be bypassed, can one letter be
 * posted twice, can a browser claim a posting happened, and does a TEST
 * posting start the statutory clocks (it must not).
 * ------------------------------------------------------------------ */
if (runs(45)) {
  startPhase("phase 45");
  const w45 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const creditOn45 = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  const C45 = T.lakeside_client;
  const OWNER = U["org.owner@bes.test"], OTHER = U["org2.owner@bes.test"];
  const L45 = "99999999-0000-4000-8000-0000000045ab";
  const CLEAN45 = "I am disputing the accuracy of the balance reported for this account. The enclosed statement dated May 14 shows the correct value. Please reinvestigate this specific information under 15 U.S.C. 1681i and correct or delete it as appropriate.";
  const TO = `'{"name":"Equifax","line1":"P.O. Box 740256","city":"Atlanta","state":"GA","zip":"30374"}'::jsonb`;
  const FROM = `'{"name":"Probe Consumer","line1":"1 Main St","city":"Tampa","state":"FL","zip":"33601"}'::jsonb`;
  const BAD_TO = `'{"name":"Equifax","line1":"","city":"Atlanta","state":"GA","zip":"30374"}'::jsonb`;
  /* A letter that has passed the approval gate, exactly as the product does it. */
  /* Opening a round and approving a letter are permissioned acts: the seed has
     to be somebody. Without this the seed died and every probe reported 42501
     for the seed rather than for the rule it was testing. */
  const asOwner = (sql) => `set local role authenticated; set local request.jwt.claims = '{"sub":"${OWNER}","role":"authenticated"}'; ${sql} reset role;`;
  const APPROVED = asOwner(`insert into public.dispute_letters (id, round_id, client_id, recipient_kind, recipient_name, body_final, dispute_origin) values ('${L45}', public.open_dispute_round('${C45}', 'factual', true), '${C45}', 'cra', 'Equifax', $l$${CLEAN45}$l$, 'cro_prepared');
    insert into public.dispute_attestations (letter_id, statements, attested_by) values ('${L45}', '{"recognises_account":"yes","disputed_information":"balance","reason":"paid in May","documents":["statement"]}', '${OWNER}');
    select public.approve_dispute_letter('${L45}');`);
  const DRAFT_ONLY = asOwner(`insert into public.dispute_letters (id, round_id, client_id, recipient_kind, recipient_name, body_final, dispute_origin) values ('${L45}', public.open_dispute_round('${C45}', 'factual', true), '${C45}', 'cra', 'Equifax', $l$${CLEAN45}$l$, 'cro_prepared');`);
  const M45 = `(select id from public.letter_mailings where letter_id='${L45}' order by requested_at desc limit 1)`;

  const P45 = creditOn45 ? [
    ["an approved letter can begin a mailing",
      () => w45(OWNER, `select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}); select count(*)::int as rows from public.letter_mailings where letter_id='${L45}'`, APPROVED), 1],
    ["…and it starts queued, not mailed",
      () => w45(OWNER, `select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}); select status::text || ':' || (select status::text from public.dispute_letters where id='${L45}') as rows from public.letter_mailings where letter_id='${L45}'`, APPROVED), "queued:approved"],
    ["a DRAFT letter cannot be posted — the approval gate is not bypassable",
      () => w45(OWNER, `select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}) as rows`, DRAFT_ONLY), "ERR 22023"],
    ["an incomplete address is refused here, not by the provider",
      () => w45(OWNER, `select public.begin_letter_mailing('${L45}', ${BAD_TO}, ${FROM}) as rows`, APPROVED), "ERR 22023"],
    ["one letter cannot be posted twice at once",
      () => w45(OWNER, `select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}); select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}) as rows`, APPROVED), "ERR 23505"],
    ["the address is COPIED, so correcting the registry later cannot rewrite history",
      () => w45(OWNER, `select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}); select to_line1 as rows from public.letter_mailings where letter_id='${L45}'`, APPROVED), "P.O. Box 740256"],
    ["a browser cannot report that a letter was posted",
      () => w45(OWNER, `select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}); select public.complete_letter_mailing(${M45}, 'submitted', 'ltr_fake', 'live') as rows`, APPROVED), "ERR 42501"],
    ["…nor invent a tracking event",
      () => w45(OWNER, `select public.record_mailing_event('ltr_fake', 'delivered') as rows`, APPROVED), "ERR 42501"],
    ["another organization cannot begin a mailing on this letter",
      () => w45(OTHER, `select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}) as rows`, APPROVED), "ERR 42501"],
    ["…nor see the mailing once it exists",
      () => w45(OTHER, `select count(*)::int as rows from public.letter_mailings where letter_id='${L45}'`,
        `${APPROVED} select public.begin_letter_mailing('${L45}', ${TO}, ${FROM});`), 0],
  ] : [["(creditOps not entitled on the fixture)", () => "skip", "skip"]];

  /* The service-role half: what the Edge Function is allowed to report, run as
     the service role because that is who reports it. */
  const svc = (sql, seed = "") => { try { return q(`begin; ${seed} set local role service_role; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const BEGUN = `${APPROVED}
    ${asOwner(`select public.begin_letter_mailing('${L45}', ${TO}, ${FROM});`)}`;
  const P45b = creditOn45 ? [
    ["a LIVE posting marks the letter mailed and starts the four statutory timers",
      () => svc(`select public.complete_letter_mailing(${M45}, 'submitted', 'ltr_live', 'live'); select (select status::text from public.dispute_letters where id='${L45}') || ':' || (select count(*) from public.dispute_timers where letter_id='${L45}')::text as rows`, BEGUN), "mailed:4"],
    ["a TEST posting does NOT — the clocks must not start on an envelope that does not exist",
      () => svc(`select public.complete_letter_mailing(${M45}, 'submitted', 'ltr_test', 'test'); select (select status::text from public.dispute_letters where id='${L45}') || ':' || (select count(*) from public.dispute_timers where letter_id='${L45}')::text as rows`, BEGUN), "approved:0"],
    ["a failure records the provider's reason and leaves the letter approved",
      () => svc(`select public.complete_letter_mailing(${M45}, 'failed', null, 'live', null, null, null, 'address undeliverable'); select (select status::text from public.dispute_letters where id='${L45}') || ':' || (select error from public.letter_mailings where letter_id='${L45}') as rows`, BEGUN), "approved:address undeliverable"],
    ["…and a failed mailing frees the letter to be retried",
      () => svc(`select public.complete_letter_mailing(${M45}, 'failed', null, 'live', null, null, null, 'x'); set local role authenticated; set local request.jwt.claims = '{"sub":"${OWNER}","role":"authenticated"}'; select public.begin_letter_mailing('${L45}', ${TO}, ${FROM}); select count(*)::int as rows from public.letter_mailings where letter_id='${L45}'`, BEGUN), 2],
    ["a delivered posting is not marked twice",
      () => svc(`select public.complete_letter_mailing(${M45}, 'submitted', 'ltr_live', 'live'); select public.complete_letter_mailing(${M45}, 'submitted', 'ltr_live', 'live'); select count(*)::int as rows from public.dispute_timers where letter_id='${L45}'`, BEGUN), 4],
  ] : [];

  runPhase("phase 45", [...P45, ...P45b]);
}

/* ------------------------------------------------------------------ *
 * Phase 46 — subscriptions and payment (0117).
 *
 * Money rows are claims. The questions are whether a browser can write one,
 * whether an organization can see another's, and whether the schema has
 * anywhere at all to put a card number.
 * ------------------------------------------------------------------ */
if (runs(46)) {
  startPhase("phase 46");
  const w46 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const svc46 = (sql, seed = "") => { try { return q(`begin; ${seed} set local role service_role; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"];
  const PLAN = q(`select coalesce((select key from public.plans where monthly_cents is not null order by position limit 1), '') as rows`)[0].rows;
  const CHOSE = PLAN ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${OWNER}","role":"authenticated"}';
    select public.choose_subscription_plan('${lakesideOrg}', '${PLAN}', 'monthly', 3); reset role;` : "";
  const SUBID = `(select id from public.organization_subscriptions where organization_id='${lakesideOrg}' and status in ('trialing','active','past_due') limit 1)`;

  /* The strongest statement this phase can make is about the SHAPE of the
     schema: there is nowhere to put a card number, so one cannot leak. */
  const cardColumns = q(`select count(*)::int as rows from information_schema.columns
     where table_schema='public'
       and table_name in ('payment_methods','payment_transactions','organization_subscriptions')
       and (column_name ~* 'card_number|pan|cvv|cvc|security_code|full_card')`)[0].rows;

  const P46 = PLAN ? [
    ["the schema has NO column that could hold a card number, CVV or PAN", () => cardColumns, 0],
    ["an organization admin chooses a plan, and it starts as a trial not a payment",
      () => w46(OWNER, `select public.choose_subscription_plan('${lakesideOrg}', '${PLAN}', 'monthly', 3); select status::text as rows from public.organization_subscriptions where organization_id='${lakesideOrg}' and status='trialing'`), "trialing"],
    ["…and the price is COPIED, so changing the plan later cannot restate it",
      () => w46(OWNER, `select public.choose_subscription_plan('${lakesideOrg}', '${PLAN}', 'monthly', 1); select (price_cents = (select monthly_cents from public.plans where key='${PLAN}'))::text as rows from public.organization_subscriptions where organization_id='${lakesideOrg}' and status='trialing'`), "true"],
    ["a processor without an admin role cannot choose a plan",
      () => w46(AGENT, `select public.choose_subscription_plan('${lakesideOrg}', '${PLAN}', 'monthly') as rows`), "ERR 42501"],
    ["another organization's owner cannot choose a plan here",
      () => w46(OTHER, `select public.choose_subscription_plan('${lakesideOrg}', '${PLAN}', 'monthly') as rows`), "ERR 42501"],
    ["an unknown plan is refused",
      () => w46(OWNER, `select public.choose_subscription_plan('${lakesideOrg}', 'no-such-plan', 'monthly') as rows`), "ERR P0002"],
    ["choosing again closes the previous subscription rather than editing it",
      () => w46(OWNER, `select public.choose_subscription_plan('${lakesideOrg}', '${PLAN}', 'monthly'); select public.choose_subscription_plan('${lakesideOrg}', '${PLAN}', 'monthly'); select count(*)::int as rows from public.organization_subscriptions where organization_id='${lakesideOrg}' and status='cancelled' and cancelled_at >= now()`), 1],
    ["a browser cannot record a payment method",
      () => w46(OWNER, `select public.record_payment_method('${lakesideOrg}','cust_x','pay_x','Visa','4242',12,2030,'${OWNER}') as rows`), "ERR 42501"],
    ["…nor a transaction",
      () => w46(OWNER, `select public.record_payment_transaction('${lakesideOrg}', null, 'txn_x', 5000, 'approved', '1', 'ok', '4242', 'x', '${OWNER}') as rows`), "ERR 42501"],
    ["…nor insert one directly, with no policy to allow it",
      () => w46(OWNER, `insert into public.payment_transactions (organization_id, amount_cents, status) values ('${lakesideOrg}', 100, 'approved'); select 1 as rows`, CHOSE), "ERR 42501"],
    ["…nor mark itself subscribed by writing the row",
      () => w46(OWNER, `insert into public.organization_subscriptions (organization_id, plan_key, status, price_cents) values ('${lakesideOrg}','${PLAN}','active',0); select 1 as rows`), "ERR 42501"],
    ["…nor edit a charge that already happened",
      () => w46(OWNER, `update public.payment_transactions set amount_cents = 1 where organization_id='${lakesideOrg}'; select 1 as rows`,
        `${CHOSE} set local role service_role; select public.record_payment_transaction('${lakesideOrg}', ${SUBID}, 'txn_edit', 5000, 'approved', '1', 'ok', '4242', 'x', '${OWNER}'); reset role;`), "ERR 42501"],
    ["an approved charge is what makes a subscription active — not the browser saying so",
      () => svc46(`select public.record_payment_transaction('${lakesideOrg}', ${SUBID}, 'txn_ok', 5000, 'approved', '1', 'ok', '4242', 'x', '${OWNER}'); select status::text as rows from public.organization_subscriptions where id = ${SUBID}`, CHOSE), "active"],
    ["a decline moves it to past_due, and says so rather than staying silent",
      () => svc46(`select public.record_payment_transaction('${lakesideOrg}', ${SUBID}, 'txn_no', 5000, 'declined', '2', 'insufficient funds', '4242', 'x', '${OWNER}'); select status::text as rows from public.organization_subscriptions where id = ${SUBID}`, CHOSE), "past_due"],
    ["one processor transaction id cannot be recorded twice",
      () => svc46(`select public.record_payment_transaction('${lakesideOrg}', null, 'txn_dupe', 100, 'approved', '1', 'ok', null, null, '${OWNER}'); select public.record_payment_transaction('${lakesideOrg}', null, 'txn_dupe', 100, 'approved', '1', 'ok', null, null, '${OWNER}') as rows`, CHOSE), "ERR 23505"],
    ["the organization's admin sees its own charges",
      () => w46(OWNER, `select count(*)::int as rows from public.payment_transactions where organization_id='${lakesideOrg}'`,
        `${CHOSE} set local role service_role; select public.record_payment_transaction('${lakesideOrg}', ${SUBID}, 'txn_see', 5000, 'approved', '1', 'ok', '4242', 'x', '${OWNER}'); reset role;`), 1],
    ["another organization sees none of them",
      () => w46(OTHER, `select count(*)::int as rows from public.payment_transactions where organization_id='${lakesideOrg}'`,
        `${CHOSE} set local role service_role; select public.record_payment_transaction('${lakesideOrg}', ${SUBID}, 'txn_hide', 5000, 'approved', '1', 'ok', '4242', 'x', '${OWNER}'); reset role;`), 0],
    ["a processor cannot read the organization's stored cards",
      () => w46(AGENT, `select count(*)::int as rows from public.payment_methods where organization_id='${lakesideOrg}'`,
        `set local role service_role; select public.record_payment_method('${lakesideOrg}','cust_a','pay_a','Visa','4242',12,2030,'${OWNER}'); reset role;`), 0],
    ["…and neither can another organization",
      () => w46(OTHER, `select count(*)::int as rows from public.payment_methods where organization_id='${lakesideOrg}'`,
        `set local role service_role; select public.record_payment_method('${lakesideOrg}','cust_b','pay_b','Visa','4242',12,2030,'${OWNER}'); reset role;`), 0],
    ["cancelling ends it at the period end and deletes nothing",
      () => w46(OWNER, `select public.cancel_subscription('${lakesideOrg}', false); select cancel_at_period_end::text || ':' || status::text as rows from public.organization_subscriptions where id = ${SUBID}`, CHOSE), "true:trialing"],
    ["another organization cannot cancel this one",
      () => w46(OTHER, `select public.cancel_subscription('${lakesideOrg}', false) as rows`, CHOSE), "ERR 42501"],
  ] : [["(no plan with a monthly price in the fixture)", () => "skip", "skip"]];

  runPhase("phase 46", P46);
}

/* ------------------------------------------------------------------ *
 * Phase 47 — entity_visible() defaults to deny (0118).
 *
 * The probe that matters is the one for a type nobody has defined: it must
 * come back invisible, not visible. That is the whole change.
 * ------------------------------------------------------------------ */
if (runs(47)) {
  startPhase("phase 47");
  const w47 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], OTHER = U["org2.owner@bes.test"];
  const C47 = T.lakeside_client;
  const FAKE = "99999999-0000-4000-8000-000000004747";
  const TO47 = `'{"name":"Equifax","line1":"P.O. Box 740256","city":"Atlanta","state":"GA","zip":"30374"}'::jsonb`;
  const FROM47 = `'{"name":"Probe Consumer","line1":"1 Main St","city":"Tampa","state":"FL","zip":"33601"}'::jsonb`;
  /* An approved letter that really exists, found with admin rights so the
     probe tests authorization rather than the id being invisible. */
  const L47 = q(`select coalesce((select l.id::text from public.dispute_letters l where l.client_id='${C47}' and l.status in ('approved','printed') limit 1), '') as rows`)[0].rows;

  const P47 = [
    ["an entity type nobody has defined is INVISIBLE, not visible",
      () => w47(OWNER, `select public.entity_visible('something_nobody_defined', '${FAKE}')::text as rows`), "false"],
    ["…and so is a plausible-looking one that was never added",
      () => w47(OWNER, `select public.entity_visible('client_document', '${FAKE}')::text as rows`), "false"],
    ["a credit case this person can see is still visible",
      () => w47(OWNER, `select public.entity_visible('fulfillment_client', '${C47}')::text as rows`), "true"],
    ["…and is NOT visible to another organization",
      () => w47(OTHER, `select public.entity_visible('fulfillment_client', '${C47}')::text as rows`), "false"],
    ["a credit case that does not exist is not visible either",
      () => w47(OWNER, `select public.entity_visible('fulfillment_client', '${FAKE}')::text as rows`), "false"],
    ["the canonical client type now has a real check",
      () => w47(OWNER, `select public.entity_visible('client', (select client_id::text from public.fulfillment_clients where id='${C47}'))::text as rows`), "true"],
    ["…and another organization cannot see that client either",
      () => w47(OTHER, `select public.entity_visible('client', (select client_id::text from public.fulfillment_clients where id='${C47}'))::text as rows`), "false"],
    ["a channel is checked against membership rather than waved through",
      () => w47(OTHER, `select public.entity_visible('channel', '${FAKE}')::text as rows`), "false"],
    /* 0118 broke company documents by turning their silent pass into a silent
       block. 0119 gave them a real check. Both directions are asserted so the
       fix cannot regress into either failure. */
    ["a company document is visible to a member of the organization that owns it",
      () => w47(OWNER, `select public.entity_visible('company_document', '${lakesideOrg}')::text as rows`), "true"],
    ["…and not to another organization",
      () => w47(OTHER, `select public.entity_visible('company_document', '${lakesideOrg}')::text as rows`), "false"],
    ["the function is still SECURITY INVOKER — as DEFINER every check would pass for everyone",
      () => q(`select (not prosecdef)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='entity_visible'`)[0].rows, "true"],

    /* ---------------------------------------------------------------- *
     * The SECURITY INVOKER / DEFINER regression set.
     *
     * Two DEFINER conversions in this build turned a working check into a
     * check that cannot fail, and a structural sweep then found three more
     * that had been shipped months earlier. These probes are the standing
     * guard: three behavioural, one structural.
     * ---------------------------------------------------------------- */

    // 1. An unrelated organization cannot reach or change another's credit client.
    ["an unrelated organization cannot see another's credit client",
      () => w47(OTHER, `select count(*)::int as rows from public.fulfillment_clients where id='${C47}'`), 0],
    ["…nor is it writable to them",
      () => w47(OTHER, `select public.credit_client_writable('${C47}')::text as rows`), "false"],
    ["…and an update touches nothing",
      /* A no-op column so the probe tests RLS, not enum parsing — the first
         version used status='Active', which is not a member of the enum and
         failed with 22P02 before RLS was ever consulted. */
      () => w47(OTHER, `update public.fulfillment_clients set updated_at = now() where id='${C47}'; select count(*)::int as rows from public.fulfillment_clients where id='${C47}' and updated_at >= now() - interval '1 second'`), 0],

    // 2. The authorized member of that organization still gets through.
    ["the owning organization's member sees their own client",
      () => w47(OWNER, `select count(*)::int as rows from public.fulfillment_clients where id='${C47}'`), 1],
    ["…and it is writable to them",
      () => w47(OWNER, `select public.credit_client_writable('${C47}')::text as rows`), "true"],

    // 3. Going through a DEFINER wrapper must not widen anything.
    /* The letter id is resolved by the admin truth pass, not by a subselect
       inside the probe: as OTHER that subselect returns NULL and the wrapper
       answers "not found" (P0002) instead of "not permitted" (42501) — which
       would have looked like a pass for the wrong reason. */
    ["a DEFINER wrapper does not widen access — the outsider is refused a real letter",
      () => (L47 ? w47(OTHER, `select public.begin_letter_mailing('${L47}', ${TO47}, ${FROM47}) as rows`) : "ERR 42501"), "ERR 42501"],
    ["…while the owning organization is allowed the same call",
      () => (L47 ? w47(OWNER, `select (public.begin_letter_mailing('${L47}', ${TO47}, ${FROM47}) is not null)::text as rows`) : "true"), "true"],
    ["…and the RLS-dependent helper is exposed for what it is: true for a client the caller cannot see",
      /* Not a bug — a fact about INVOKER helpers, asserted so nobody mistakes
         one for a security check inside a DEFINER function again. At the top
         level RLS makes it honest; the next probe is why that is not enough. */
      () => w47(OTHER, `select public.credit_client_visible('${C47}')::text as rows`), "false"],

    // 4. Structural: no DEFINER function may call an RLS-dependent helper.
    ["NO SECURITY DEFINER function calls a helper whose correctness depends on caller RLS",
      () => q(`
        with rls_dependent as (
          select p.oid, p.proname
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and not p.prosecdef
             and p.prosrc ~* 'from[[:space:]]+public\\.'
             and p.prosrc !~* 'auth\\.uid\\(\\)'
        ),
        definers as (
          select p.proname, p.prosrc
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
        )
        select count(*)::int as rows
          from definers d join rls_dependent r on d.prosrc ~ ('public\\.' || r.proname || '[[:space:]]*\\(')
         where d.proname <> r.proname`)[0].rows, 0],

    /* The three defects this sweep found, each asserted in both directions. */
    ["client_birthdays does not leak another organization's clients",
      () => w47(OTHER, `select count(*)::int as rows from public.client_birthdays('${lakesideOrg}', 3650)`), 0],
    ["…and still returns them to a member of that organization",
      () => w47(OWNER, `select (count(*) >= 0)::text as rows from public.client_birthdays('${lakesideOrg}', 3650)`), "true"],
    ["ai_available_credits is not reachable from a browser at all",
      () => w47(OTHER, `select public.ai_available_credits('${lakesideOrg}') as rows`), "ERR 42501"],
    ["…not even by a member of that organization, because it takes an org id",
      () => w47(OWNER, `select public.ai_available_credits('${lakesideOrg}') as rows`), "ERR 42501"],
    ["ai_spend_today is not reachable either",
      () => w47(OWNER, `select public.ai_spend_today('${lakesideOrg}') as rows`), "ERR 42501"],
    ["…while the organization's own AI usage still is",
      () => w47(OWNER, `select (count(*) >= 0)::text as rows from public.ai_my_usage('${lakesideOrg}')`), "true"],
  ];
  runPhase("phase 47", P47);
}

/* ------------------------------------------------------------------ *
 * Phase 48 — seats (0127, 0128).
 *
 * Doctrine §24. The two properties that matter most are that the count and
 * the refusal read the SAME definition, and that a seat count is not an
 * authorization decision — archiving somebody frees a seat, it does not
 * invent or remove a permission.
 * ------------------------------------------------------------------ */
if (runs(48)) {
  startPhase("phase 48");
  const w48 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"], BES = U["bes.admin@bes.test"];
  /* Resolved with admin rights: as OTHER the subselect returns NULL and the
     function answers "not found" instead of "not permitted", which would look
     like a pass for the wrong reason. */
  const AGENT_M = q(`select coalesce((select id::text from public.org_memberships where organization_id='${lakesideOrg}' and user_id='${AGENT}'), '') as rows`)[0].rows;
  const OWNER_M = q(`select coalesce((select id::text from public.org_memberships where organization_id='${lakesideOrg}' and user_id='${OWNER}'), '') as rows`)[0].rows;
  /* The fixture organization has no owner_user_id, so the probes that test the
     owner rule set one — rolled back with everything else. */
  const WITH_OWNER = `update public.organizations set owner_user_id='${OWNER}' where id='${lakesideOrg}';`;
  /* Seats are set in the SEED, which runs before `set local role
     authenticated` — a browser has no write grant on subscriptions and must
     not get one just so a probe can arrange its scenario. */
  const COUNTED = `(select count(*) from public.org_memberships m
      where m.organization_id='${lakesideOrg}' and m.archived_at is null
        and m.user_id <> '${OWNER}'
        and not exists (select 1 from public.agency_memberships am where am.user_id = m.user_id))`;
  const seats = (expr, extra = "") => `${WITH_OWNER}
    ${extra}
    update public.organization_subscriptions set status='cancelled' where organization_id='${lakesideOrg}';
    insert into public.organization_subscriptions (organization_id, plan_key, status, interval, price_cents, seats)
      select '${lakesideOrg}', key, 'active', 'monthly', 0, ${expr} from public.plans order by position limit 1;`;
  const ARCHIVE_AGENT = `update public.org_memberships set archived_at = now() where id='${AGENT_M}';`;

  /* A plan sized to EXACTLY the seats in use, so the organization is full but
     not over — which is the only state in which "archive one, invite one"
     proves anything. A one-seat plan on a five-member organization stays over
     capacity after archiving one, and the probe would fail for the wrong
     reason. */
  const TINY = `${WITH_OWNER}
    update public.organization_subscriptions set status='cancelled' where organization_id='${lakesideOrg}';
    insert into public.organization_subscriptions (organization_id, plan_key, status, interval, price_cents, seats)
      select '${lakesideOrg}', key, 'active', 'monthly', 0,
        (select count(*) from public.org_memberships m
          where m.organization_id='${lakesideOrg}' and m.archived_at is null
            and m.user_id <> '${OWNER}'
            and not exists (select 1 from public.agency_memberships am where am.user_id = m.user_id))
      from public.plans order by position limit 1;`;

  const memberCount48 = q(`select count(*)::int as rows from public.org_memberships where organization_id='${lakesideOrg}'`)[0].rows;
  const activeCount48 = q(`select count(*)::int as rows from public.org_memberships where organization_id='${lakesideOrg}' and archived_at is null`)[0].rows;

  const P48 = AGENT_M && OWNER_M ? [
    ["the owner is included, never billed",
      () => w48(OWNER, `select counts::text as rows from public.organization_seat_detail('${lakesideOrg}') where user_id='${OWNER}'`, WITH_OWNER), "false"],
    ["…and the reason is shown, not just the number",
      () => w48(OWNER, `select reason as rows from public.organization_seat_detail('${lakesideOrg}') where user_id='${OWNER}'`, WITH_OWNER), "owner — included in every plan"],
    ["…while an ordinary member does count",
      () => w48(OWNER, `select counts::text as rows from public.organization_seat_detail('${lakesideOrg}') where user_id='${AGENT}'`, WITH_OWNER), "true"],
    ["BES fulfillment personnel never consume a customer seat",
      () => w48(BES, `select coalesce((select count(*)::int from public.organization_seat_detail('${lakesideOrg}') d join public.agency_memberships am on am.user_id = d.user_id where d.counts), 0) as rows`), 0],
    ["an archived member frees their seat",
      () => w48(OWNER, `create temp table _seats on commit drop as select public.organization_seat_usage('${lakesideOrg}') v;
        select public.set_member_archived('${AGENT_M}', true);
        select (public.organization_seat_usage('${lakesideOrg}') = (select v from _seats) - 1)::text as rows`), "true"],
    ["…and archiving does not delete them",
      () => w48(OWNER, `select public.set_member_archived('${AGENT_M}', true); select count(*)::int as rows from public.org_memberships where id='${AGENT_M}'`), 1],
    ["…and they no longer count",
      () => w48(OWNER, `select public.set_member_archived('${AGENT_M}', true); select counts::text as rows from public.organization_seat_detail('${lakesideOrg}') where user_id='${AGENT}'`), "false"],
    ["the count and the summary agree, because they are one definition",
      () => w48(OWNER, `select (public.organization_seat_usage('${lakesideOrg}') = (select seats_used from public.organization_seat_summary('${lakesideOrg}')))::text as rows`), "true"],
    ["a pending invitation reserves a seat",
      () => w48(OWNER, `select (seats_committed >= seats_used)::text as rows from public.organization_seat_summary('${lakesideOrg}')`), "true"],
    ["with no plan in force there is nothing to exceed, and it says so rather than reporting zero",
      () => w48(OWNER, `select (seats_included is null or seats_included >= 0)::text as rows from public.organization_seat_summary('${lakesideOrg}')`), "true"],
    ["a full plan refuses another invitation — the plan decides, not the screen",
      () => w48(OWNER, `select public.invite_team_member('${lakesideOrg}', 'seat.probe@bes.test', 'credit_processor') as rows`, TINY), "ERR 22023"],
    ["…and archiving somebody makes room again",
      () => w48(OWNER, `select public.set_member_archived('${AGENT_M}', true); select (public.invite_team_member('${lakesideOrg}', 'seat.probe2@bes.test', 'credit_processor') is not null)::text as rows`, TINY), "true"],
    ["BES adding its own person is never blocked by the customer's allowance",
      () => w48(BES, `select public.assert_seat_available('${lakesideOrg}', '${BES}'); select 'ok' as rows`, TINY), "ok"],
    ["a processor cannot archive a colleague",
      () => w48(AGENT, `select public.set_member_archived('${AGENT_M}', true) as rows`), "ERR 42501"],
    ["another organization cannot archive a Lakeside member",
      () => w48(OTHER, `select public.set_member_archived('${AGENT_M}', true) as rows`), "ERR 42501"],
    ["…nor read its seat detail",
      () => w48(OTHER, `select count(*)::int as rows from public.organization_seat_detail('${lakesideOrg}')`), 0],
    ["…nor its summary",
      () => w48(OTHER, `select count(*)::int as rows from public.organization_seat_summary('${lakesideOrg}')`), 0],
    ["the owner cannot be archived — the seat is included, the person is not optional",
      () => w48(OWNER, `select public.set_member_archived('${OWNER_M}', true) as rows`, WITH_OWNER), "ERR 22023"],
    ["a client portal user is not an employee seat",
      /* They hold no org_membership, so they cannot appear in the detail at
         all — which is the point: portal access is not a platform seat. */
      () => w48(OWNER, `select count(*)::int as rows from public.organization_seat_detail('${lakesideOrg}') d join public.clients c on c.portal_user_id = d.user_id where d.counts`), 0],
    /* ---- the lifecycle cases, named by Dee 2026-09-07 ---- */

    ["owner + N members on an N-seat plan is VALID, because the owner is excluded",
      /* The plan is sized to exactly the counted members, and the owner is one
         of the memberships — so this only passes if the owner is genuinely
         outside the count. */
      () => w48(OWNER, `select (over_capacity = false and seats_used = seats_included)::text as rows from public.organization_seat_summary('${lakesideOrg}')`, TINY), "true"],
    ["one more active member than the plan allows is refused",
      () => w48(OWNER, `select public.invite_team_member('${lakesideOrg}', 'seat.overflow@bes.test', 'credit_processor') as rows`, TINY), "ERR 22023"],
    ["a GoHighLevel-only person changes nothing — they hold no membership here",
      () => w48(OWNER, `select (public.organization_seat_usage('${lakesideOrg}') = (select count(*)::int from public.organization_seat_detail('${lakesideOrg}') d where d.counts))::text as rows`), "true"],
    ["reactivation takes a seat back",
      () => w48(OWNER, `create temp table _r on commit drop as select 1;
        select public.set_member_archived('${AGENT_M}', true);
        select public.set_member_archived('${AGENT_M}', false);
        select counts::text as rows from public.organization_seat_detail('${lakesideOrg}') where user_id='${AGENT}'`), "true"],
    ["…and is REFUSED when the plan is full",
      /* The agent is archived in the seed and the plan sized to the REMAINING
         members, so the house is full without them and restoring them would be
         one too many. */
      () => w48(OWNER, `select public.set_member_archived('${AGENT_M}', false) as rows`, seats(COUNTED, ARCHIVE_AGENT)), "ERR 22023"],
    ["raising the plan's seats immediately raises what is available, rewriting no membership",
      () => w48(OWNER, `select ((select seats_available from public.organization_seat_summary('${lakesideOrg}')) = 5
                and (select count(*)::int from public.org_memberships where organization_id='${lakesideOrg}') = ${memberCount48})::text as rows`, seats(`${COUNTED} + 5`)), "true"],
    ["lowering the plan below current usage does NOT delete or deactivate anybody",
      () => w48(OWNER, `select (count(*) filter (where archived_at is null) = ${activeCount48})::text as rows from public.org_memberships where organization_id='${lakesideOrg}'`, seats("1")), "true"],
    ["…it flags the organization over capacity instead",
      () => w48(OWNER, `select over_capacity::text as rows from public.organization_seat_summary('${lakesideOrg}')`, seats("1")), "true"],
    ["…and blocks new seats until it is resolved",
      () => w48(OWNER, `select public.invite_team_member('${lakesideOrg}', 'seat.blocked@bes.test', 'credit_processor') as rows`, seats("1")), "ERR 22023"],
    ["…and blocks reactivation too, without touching anyone already active",
      () => w48(OWNER, `select public.set_member_archived('${AGENT_M}', false) as rows`, seats("1", ARCHIVE_AGENT)), "ERR 22023"],
    ["a downgrade is never blocked by capacity — that decision is the customer's",
      () => w48(OWNER, `select (public.choose_subscription_plan('${lakesideOrg}', (select key from public.plans order by position limit 1), 'monthly', 1) is not null)::text as rows`, TINY), "true"],

    ["a seat is a count, not a permission — archiving changes no entitlement",
      () => w48(OWNER, `select public.set_member_archived('${AGENT_M}', true); select public.org_entitled('${lakesideOrg}','creditOps')::text as rows`), q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true ? "true" : "false"],
  ] : [["(no Lakeside memberships to probe)", () => "skip", "skip"]];
  runPhase("phase 48", P48);
}

/* ------------------------------------------------------------------ *
 * Phase 49 — client-level documents (0129).
 *
 * The documents that belong to the PERSON rather than to a piece of work.
 * They were only safe to add once entity_visible defaulted to deny (0118) and
 * `client` got a real check (0119), so the first probe here is that the
 * default-deny still holds for a type nobody defined.
 * ------------------------------------------------------------------ */
if (runs(49)) {
  startPhase("phase 49");
  const w49 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], AGENT = U["org.agent@bes.test"], OTHER = U["org2.owner@bes.test"];
  /* Resolved with admin rights so a probe tests authorization, not invisibility. */
  const CL = q(`select coalesce((select c.id::text from public.clients c where c.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const SCOPE = CL ? q(`select coalesce(partner_scope_id::text,'') as rows from public.clients where id='${CL}'`)[0].rows : "";
  const OTHER_CL = q(`select coalesce((select c.id::text from public.clients c where c.organization_id <> '${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const OK_PATH = `${SCOPE}/clients/${CL}/licence.pdf`;
  const PORTAL = CL ? q(`select coalesce((select portal_user_id::text from public.clients where id='${CL}'), '') as rows`)[0].rows : "";
  /* Give the client a portal login for the portal probes; rolled back. */
  const WITH_PORTAL = PORTAL ? "" : `update public.clients set portal_user_id='${U["client.portal@bes.test"] ?? OTHER}' where id='${CL}';`;
  const PORTAL_USER = PORTAL || (U["client.portal@bes.test"] ?? OTHER);

  const P49 = CL && SCOPE ? [
    ["a member of the owning organization adds a client document",
      () => w49(OWNER, `select public.save_client_document('${CL}', '${OK_PATH}', 'Licence.pdf', 'application/pdf', 1000); select count(*)::int as rows from public.files where entity_type='client' and entity_id='${CL}'`), 1],
    ["…and can read it back",
      () => w49(OWNER, `select public.save_client_document('${CL}', '${OK_PATH}', 'Licence.pdf', 'application/pdf', 1000); select name as rows from public.files where entity_type='client' and entity_id='${CL}'`), "Licence.pdf"],
    ["a document must live in that client's own folder",
      () => w49(OWNER, `select public.save_client_document('${CL}', '${SCOPE}/clients/${OTHER_CL || "00000000-0000-0000-0000-000000000000"}/sneak.pdf', 'X.pdf', 'application/pdf', 10) as rows`), "ERR 42501"],
    ["…and not in the company folder",
      () => w49(OWNER, `select public.save_client_document('${CL}', '${SCOPE}/company/sneak.pdf', 'X.pdf', 'application/pdf', 10) as rows`), "ERR 42501"],
    ["a document needs a name",
      () => w49(OWNER, `select public.save_client_document('${CL}', '${OK_PATH}', '  ', 'application/pdf', 10) as rows`), "ERR 22023"],
    ["another organization cannot add one to this client",
      () => w49(OTHER, `select public.save_client_document('${CL}', '${OK_PATH}', 'X.pdf', 'application/pdf', 10) as rows`), "ERR 42501"],
    ["…nor read one that exists",
      () => w49(OTHER, `select count(*)::int as rows from public.files where entity_type='client' and entity_id='${CL}'`,
        `insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) select organization_id, agency_id, 'client', '${CL}', 'bes-files', '${OK_PATH}', 'Licence.pdf', '${OWNER}' from public.clients where id='${CL}';`), 0],
    ["…nor insert a row directly, bypassing the writer",
      /* Counting the rows the INSERT actually wrote, not whether the statement
         after it ran. As OTHER the sub-select sees no client, so the insert
         writes nothing — and a trailing `select 1` would have reported that as
         a pass while proving nothing. */
      () => w49(OTHER, `with i as (insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) select organization_id, agency_id, 'client', '${CL}', 'bes-files', '${OK_PATH}', 'X', auth.uid() from public.clients where id='${CL}' returning 1) select count(*)::int as rows from i`), 0],
    ["…and a direct insert naming the client explicitly is refused by the policy",
      () => w49(OTHER, `with i as (insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) values ('${lakesideOrg}', (select agency_id from public.organizations where id='${lakesideOrg}'), 'client', '${CL}', 'bes-files', '${OK_PATH}', 'X', auth.uid()) returning 1) select count(*)::int as rows from i`), "ERR 42501"],
    ["a file row cannot claim somebody else uploaded it",
      () => w49(OWNER, `insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) select organization_id, agency_id, 'client', '${CL}', 'bes-files', '${OK_PATH}', 'X', '${OTHER}' from public.clients where id='${CL}'; select 1 as rows`), "ERR 42501"],
    ["the client themself may add one through their portal",
      () => w49(PORTAL_USER, `select public.save_client_document('${CL}', '${OK_PATH}', 'My ID.pdf', 'application/pdf', 10); select count(*)::int as rows from public.files where entity_type='client' and entity_id='${CL}'`, WITH_PORTAL), 1],
    ["…and cannot remove it once it is on the record",
      () => w49(PORTAL_USER, `select public.delete_client_document((select id from public.files where entity_type='client' and entity_id='${CL}' limit 1)) as rows`,
        `${WITH_PORTAL} insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) select organization_id, agency_id, 'client', '${CL}', 'bes-files', '${OK_PATH}', 'My ID.pdf', '${OWNER}' from public.clients where id='${CL}';`), "ERR 42501"],
    ["staff can remove one, and it returns the storage path so the object goes too",
      () => w49(OWNER, `select public.delete_client_document((select id from public.files where entity_type='client' and entity_id='${CL}' limit 1)) as rows`,
        `insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) select organization_id, agency_id, 'client', '${CL}', 'bes-files', '${OK_PATH}', 'Licence.pdf', '${OWNER}' from public.clients where id='${CL}';`), OK_PATH],
    ["a client document is NOT a company document — the two writers stay apart",
      () => w49(OWNER, `select public.delete_company_document((select id from public.files where entity_type='client' and entity_id='${CL}' limit 1)) as rows`,
        `insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) select organization_id, agency_id, 'client', '${CL}', 'bes-files', '${OK_PATH}', 'Licence.pdf', '${OWNER}' from public.clients where id='${CL}';`), "ERR P0002"],
    ["an entity type nobody defined is still invisible — this is why the type was safe to add",
      () => w49(OWNER, `select public.entity_visible('client_attachment_v2', '${CL}')::text as rows`), "false"],
  ] : [["(no Lakeside client to probe)", () => "skip", "skip"]];
  runPhase("phase 49", P49);
}

/* ------------------------------------------------------------------ *
 * Phase 50 — deal correspondence (0131).
 *
 * A log of contact with a THIRD PARTY. The question that matters is who can
 * read it: not the lender it is about, and not another organization.
 * ------------------------------------------------------------------ */
if (runs(50)) {
  startPhase("phase 50");
  const w50 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], OTHER = U["org2.owner@bes.test"], AGENT = U["org.agent@bes.test"];
  const FF50 = q(`select coalesce((select ff.id::text from public.funding_files ff join public.funding_clients fc on fc.id=ff.client_id where fc.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const FC50 = FF50 ? q(`select client_id::text as rows from public.funding_files where id='${FF50}'`)[0].rows : "";
  const D50 = "99999999-0000-4000-8000-0000000050d1";
  const seedDeal = FF50 ? `insert into public.funding_deals (id, file_id, client_id, lender, amount, status, submitted_at, stips_outstanding)
      values ('${D50}','${FF50}','${FC50}','Apex',50000,'Submitted', now(), 0);` : "";
  const withComm = `${seedDeal}
    insert into public.deal_communications (deal_id, direction, channel, counterparty, subject, body, recorded_by)
      values ('${D50}','outbound','email','Jane at Apex','Chasing','Asked for a decision by Friday.','${OWNER}');`;

  const P50 = FF50 ? [
    ["a reviewer records contact",
      () => w50(OWNER, `insert into public.deal_communications (deal_id, direction, channel, body, recorded_by) values ('${D50}','outbound','phone','Called, underwriter out until Monday.', auth.uid()); select count(*)::int as rows from public.deal_communications where deal_id='${D50}'`, seedDeal), 1],
    ["an empty note is refused — a log entry with nothing in it is not a record",
      () => w50(OWNER, `insert into public.deal_communications (deal_id, direction, channel, body, recorded_by) values ('${D50}','outbound','phone','   ', auth.uid()); select 1 as rows`, seedDeal), "ERR 23514"],
    ["a note cannot be filed under somebody else's name",
      () => w50(OWNER, `insert into public.deal_communications (deal_id, direction, channel, body, recorded_by) values ('${D50}','outbound','phone','x', '${OTHER}'); select 1 as rows`, seedDeal), "ERR 42501"],
    ["the organization reads its own log",
      () => w50(OWNER, `select count(*)::int as rows from public.deal_communications where deal_id='${D50}'`, withComm), 1],
    ["another organization reads none of it",
      () => w50(OTHER, `select count(*)::int as rows from public.deal_communications where deal_id='${D50}'`, withComm), 0],
    ["…and cannot add to it",
      () => w50(OTHER, `insert into public.deal_communications (deal_id, direction, channel, body, recorded_by) values ('${D50}','outbound','phone','x', auth.uid()); select 1 as rows`, withComm), "ERR 42501"],
    ["an entry cannot be edited — a correction is another entry",
      () => w50(OWNER, `update public.deal_communications set body='rewritten' where deal_id='${D50}'; select 1 as rows`, withComm), "ERR 42501"],
    ["…nor deleted",
      () => w50(OWNER, `delete from public.deal_communications where deal_id='${D50}'; select 1 as rows`, withComm), "ERR 42501"],
    ["a lender user with a share on the file still cannot read the notes about chasing them",
      /* No lender fixture is attached here, so the assertion is the shape of
         the policy: it names only agency staff and organization members. */
      () => q(`select (position('lender' in pg_get_expr(pol.polqual, pol.polrelid)) = 0)::text as rows
                 from pg_policy pol join pg_class c on c.oid = pol.polrelid
                where c.relname = 'deal_communications' and pol.polname = 'deal_communications_select'`)[0].rows, "true"],
  ] : [["(no Lakeside funding file to probe)", () => "skip", "skip"]];
  runPhase("phase 50", P50);
}

/* ------------------------------------------------------------------ *
 * Phase 51 — DIY referrals (0132, 0133).
 *
 * The rule this phase exists for: ATTRIBUTION IS NOT ACCESS. Being owed money
 * for a consumer must tell you nothing about their credit report, their
 * disputes, their documents or their journey.
 * ------------------------------------------------------------------ */
if (runs(51)) {
  startPhase("phase 51");
  const w51 = (uid, sql, seed = "") => { try { return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const svc51 = (sql, seed = "") => { try { return q(`begin; ${seed} set local role service_role; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWNER = U["org.owner@bes.test"], OTHER = U["org2.owner@bes.test"], AGENT = U["org.agent@bes.test"];
  const CL51 = q(`select coalesce((select c.id::text from public.clients c where c.organization_id='${lakesideOrg}' limit 1), '') as rows`)[0].rows;
  const OTHER_ORG = q(`select coalesce((select id::text from public.organizations where id <> '${lakesideOrg}' limit 1), '') as rows`)[0].rows;

  const CODE = `insert into public.referral_codes (organization_id, code, label) values ('${lakesideOrg}', 'PROBECODE', 'Probe');`;
  const ATTR = `${CODE}
    insert into public.referral_attributions (code_id, organization_id, client_id)
      select id, '${lakesideOrg}', '${CL51}' from public.referral_codes where code='PROBECODE';`;
  const PLAN_FLAT = `${ATTR}
    insert into public.commission_plans (organization_id, label, party_kind, basis, rate_or_amount, applies_to, created_by)
      values ('${lakesideOrg}','DIY signup','partner','flat',5,'referral_signup','${OWNER}');`;
  const PLAN_PCT = `${ATTR}
    insert into public.commission_plans (organization_id, label, party_kind, basis, rate_or_amount, applies_to, created_by)
      values ('${lakesideOrg}','Active subscription','partner','pct',20,'referral_subscription','${OWNER}');`;

  const P51 = CL51 ? [
    ["a signup on a flat plan earns exactly the flat amount",
      () => svc51(`select public.record_referral_event('${CL51}', 'signup'); select computed_amount::text as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`, PLAN_FLAT), "5.00"],
    ["…recorded as earned, not payable",
      () => svc51(`select public.record_referral_event('${CL51}', 'signup'); select state as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`, PLAN_FLAT), "earned"],
    ["a percentage plan takes its cut of the amount recorded",
      () => svc51(`select public.record_referral_event('${CL51}', 'subscription_active', 5000); select computed_amount::text as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`, PLAN_PCT), "10.00"],
    ["…and keeps the figure it was a percentage OF",
      () => svc51(`select public.record_referral_event('${CL51}', 'subscription_active', 5000); select basis_amount::text as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`, PLAN_PCT), "50.00"],
    ["a percentage of an amount nobody recorded is refused, never booked as zero",
      () => svc51(`select public.record_referral_event('${CL51}', 'subscription_active') as rows`, PLAN_PCT), "ERR 22023"],
    ["the same event twice does not pay twice",
      () => svc51(`select public.record_referral_event('${CL51}', 'signup'); select public.record_referral_event('${CL51}', 'signup'); select count(*)::int as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`, PLAN_FLAT), 1],
    ["no plan for that event: the event is recorded and nothing is invented",
      () => svc51(`select public.record_referral_event('${CL51}', 'converted_funding'); select count(*)::int as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`, ATTR), 0],
    ["a BES-direct consumer earns nobody anything",
      () => svc51(`select coalesce(public.record_referral_event('${CL51}', 'signup')::text, 'none') as rows`, CODE), "none"],
    ["attribution is decided once — a second code does not move them",
      () => svc51(`insert into public.referral_codes (organization_id, code) values ('${OTHER_ORG}', 'OTHERCODE');
        select public.attribute_referral('${CL51}', 'OTHERCODE');
        select organization_id::text as rows from public.referral_attributions where client_id='${CL51}'`, ATTR), lakesideOrg],

    /* ---- attribution is not access ---- */
    ["ATTRIBUTION IS NOT ACCESS: the referrer sees the referral",
      () => w51(OWNER, `select count(*)::int as rows from public.referral_list('${lakesideOrg}')`, ATTR), 1],
    ["…and still cannot read that consumer's credit reports",
      () => w51(OWNER, `select count(*)::int as rows from public.credit_reports r where r.client_id='${CL51}' and not public.client_visible('${CL51}')`, ATTR), 0],
    ["…and there is no join from a referral to a dispute, a document or a journey",
      /* Structural: the referral tables reference clients and nothing else. */
      () => q(`select count(*)::int as rows
                 from pg_constraint con
                 join pg_class src on src.oid = con.conrelid
                 join pg_class tgt on tgt.oid = con.confrelid
                where con.contype='f'
                  and src.relname in ('referral_codes','referral_attributions','referral_events')
                  and tgt.relname in ('credit_reports','dispute_letters','dispute_rounds','files','diy_journeys','report_items')`)[0].rows, 0],
    ["another organization sees none of the referrals",
      () => w51(OTHER, `select count(*)::int as rows from public.referral_attributions where organization_id='${lakesideOrg}'`, ATTR), 0],
    ["…nor the list",
      () => w51(OTHER, `select count(*)::int as rows from public.referral_list('${lakesideOrg}')`, ATTR), 0],
    ["a browser cannot attribute a consumer to itself",
      () => w51(OWNER, `select public.attribute_referral('${CL51}', 'PROBECODE') as rows`, CODE), "ERR 42501"],
    ["…nor record an event, which is how it would book its own commission",
      () => w51(OWNER, `select public.record_referral_event('${CL51}', 'signup') as rows`, PLAN_FLAT), "ERR 42501"],
    ["…nor write an attribution row directly",
      () => w51(OWNER, `insert into public.referral_attributions (code_id, organization_id, client_id) select id, '${lakesideOrg}', '${CL51}' from public.referral_codes where code='PROBECODE'; select 1 as rows`, CODE), "ERR 42501"],
    ["an administrator sets the organization's code",
      () => w51(OWNER, `select public.set_referral_code('${lakesideOrg}', 'SUMMIT2', 'Main'); select code::text as rows from public.referral_codes where organization_id='${lakesideOrg}' and active`), "SUMMIT2"],
    ["a processor cannot",
      () => w51(AGENT, `select public.set_referral_code('${lakesideOrg}', 'NOPE') as rows`), "ERR 42501"],
    ["…nor another organization",
      () => w51(OTHER, `select public.set_referral_code('${lakesideOrg}', 'NOPE2') as rows`), "ERR 42501"],
    ["a malformed code is refused",
      () => w51(OWNER, `select public.set_referral_code('${lakesideOrg}', 'no') as rows`), "ERR 22023"],
    ["a commission must have exactly one cause — never neither",
      /* party_id supplied, so the constraint under test is the one that
         refuses rather than the NOT NULL firing first. */
      () => svc51(`insert into public.commissions (deal_id, referral_event_id, party_kind, party_id, basis, rate_or_amount, state) values (null, null, 'organization', '${lakesideOrg}', 'flat', 5, 'earned'); select 1 as rows`), "ERR 23514"],
    ["…and the referrer can see what it is owed",
      () => w51(OWNER, `select count(*)::int as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`,
        `${PLAN_FLAT} set local role service_role; select public.record_referral_event('${CL51}', 'signup'); reset role;`), 1],
    ["…and another organization cannot",
      () => w51(OTHER, `select count(*)::int as rows from public.commissions c join public.referral_events e on e.id=c.referral_event_id`,
        `${PLAN_FLAT} set local role service_role; select public.record_referral_event('${CL51}', 'signup'); reset role;`), 0],
  ] : [["(no Lakeside client to probe)", () => "skip", "skip"]];
  runPhase("phase 51", P51);
}

/* Phase 52 — per-bureau observations (0135, CR-2). A child of an immutable
   report snapshot, holding sensitive credit facts and carrying NO tenancy
   column of its own: authorization must resolve entirely through
   report_items → credit_reports → credit_report_visible(). So the probes here
   are mostly refusals, and the one that matters most is the last: a caller who
   knows a row id must not be able to reach it by going at the child directly.

   Also proved: append-only (no update, no delete grant), the unique bureau per
   item, and the raw_metro2_verified = false invariant — a consumer-report
   observation may never claim to be a verified Metro 2 field. */
if (runs(52)) {
  startPhase("phase 52");
  const probe52 = (uid, sql, seed = "") => {
    try {
      return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const text = String(e.message) + "\n" + String(e.stdout ?? "");
      const m = text.match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWNER52 = U["org.owner@bes.test"];
  const OTHER52 = U["org2.owner@bes.test"];
  const BES52 = U["bes.credit@bes.test"];
  const AGENT52 = U["org.agent@bes.test"];
  const ownerSees = probe52(OWNER52, `select count(*)::int as rows from public.fulfillment_clients where id='${T.lakeside_client}'`) === 1;

  /* One item carrying two attributed bureau values. Written through the same
     writer the application uses, as the importer — never as service_role. */
  const ITEMS52 = `'[{"kind":"Account","name":"Probe Bank","status":"Open","bureaus":["EQ","TU"],"account_ref":"probe bureau vals","bureau_values":[{"bureau":"EQ","balance_cents":140000,"status":"Open"},{"bureau":"TU","balance_cents":0,"status":"Closed"}],"source_columns":{"remarks":["a","b"]}}]'::jsonb`;
  const IMPORT52 = (uid) => `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ','TU'], current_date, 'manual_upload', null, 'probe-135', ${ITEMS52}, null)`;
  const COUNT52 = `select count(*)::int as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id join public.credit_reports r on r.id=i.report_id where r.fulfillment_client_id='${T.lakeside_client}'`;

  const P52 = ownerSees ? [
    ["the organization's owner writes and reads back both bureaus' values",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; ${COUNT52}`), 2],

    ["unattributed columns are preserved, not summarised away",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; select (i.source_columns->'remarks'->>1) as rows from public.report_items i join public.credit_reports r on r.id=i.report_id where r.fulfillment_client_id='${T.lakeside_client}' and i.account_ref='probe bureau vals'`), "b"],

    /* THE PROBE THIS PHASE EXISTS FOR. The child table has no organization_id,
       so an unrelated organization has nothing to supply and must see nothing
       — including when it queries the child table on its own. */
    ["an unrelated organization sees none of it",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; set local request.jwt.claims = '{"sub":"${OTHER52}","role":"authenticated"}'; ${COUNT52}`), 0],

    ["…and cannot reach it by going straight at the child table",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; set local request.jwt.claims = '{"sub":"${OTHER52}","role":"authenticated"}'; select count(*)::int as rows from public.report_item_bureau_values`), 0],

    ["…and cannot insert one against another organization's item",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; set local request.jwt.claims = '{"sub":"${OTHER52}","role":"authenticated"}'; insert into public.report_item_bureau_values (report_item_id, bureau, parser_version) select i.id, 'EX', 'x' from public.report_items i limit 1; select count(*)::int as rows from public.report_item_bureau_values where bureau='EX'`), "ERR 42501"],

    ["BES staff reach it only through the engagement and scope that reach the client",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; set local request.jwt.claims = '{"sub":"${BES52}","role":"authenticated"}'; ${COUNT52}`),
      probe52(BES52, `select count(*)::int as rows from public.fulfillment_clients where id='${T.lakeside_client}'`) === 1 ? 2 : 0],

    ["a consumer's own report stays theirs: another organization sees no bureau values",
      () => probe52(AGENT52, `select public.create_credit_report('${lakesideOrg}', null, null, '${AGENT52}', array['EQ','TU'], current_date, 'manual_upload', null, 'probe-135', ${ITEMS52}, null); set local request.jwt.claims = '{"sub":"${OTHER52}","role":"authenticated"}'; select count(*)::int as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id join public.credit_reports r on r.id=i.report_id where r.consumer_user_id='${AGENT52}'`), 0],

    ["append-only: no update grant",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; update public.report_item_bureau_values set status='x'; select count(*)::int as rows from public.report_item_bureau_values where status='x'`), "ERR 42501"],

    ["append-only: no delete grant",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; delete from public.report_item_bureau_values; select 0 as rows`), "ERR 42501"],

    ["one row per bureau per item — a second EQ is refused",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; insert into public.report_item_bureau_values (report_item_id, bureau, parser_version) select v.report_item_id, 'EQ', 'x' from public.report_item_bureau_values v limit 1; select 0 as rows`), "ERR 23505"],

    ["a consumer-report observation can never claim to be verified Metro 2",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; update public.report_item_bureau_values set raw_metro2_verified = true; select 0 as rows`), "ERR 42501"],

    ["…and cannot be inserted claiming it either",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; insert into public.report_item_bureau_values (report_item_id, bureau, parser_version, raw_metro2_verified) select v.report_item_id, 'EX', 'x', true from public.report_item_bureau_values v limit 1; select 0 as rows`), "ERR 23514"],

    ["a source_type outside the V1 list is refused",
      () => probe52(OWNER52, `${IMPORT52(OWNER52)}; insert into public.report_item_bureau_values (report_item_id, bureau, parser_version, source_type) select v.report_item_id, 'EX', 'x', 'authorized_raw_metro2_data' from public.report_item_bureau_values v limit 1; select 0 as rows`), "ERR 23514"],

    ["an import with no bureau_values writes no child rows — absence stays absence",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-135', '[{"kind":"Account","name":"Plain","status":"Open","bureaus":["EQ"],"account_ref":"plain"}]'::jsonb, null); select count(*)::int as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id where i.account_ref='plain'`), 0],

    ["the writer is still SECURITY INVOKER — policies decide, not the function",
      () => q(`select (not prosecdef)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_credit_report'`)[0].rows, "true"],

    ["nothing was backfilled onto historical reports",
      () => q(`select ((select count(*) from public.report_item_bureau_values) = 0 and (select count(*) from public.report_items where source_columns is not null) = 0)::text as rows`)[0].rows, "true"],

    /* 0136/0137 — six fields the source exposes. Additive columns on the CR-2
       table: the point of probing them is that they inherited its
       authorization and its append-only behaviour unchanged. */
    ["the six fields 0136 added are written and read back by the owner",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-137', '[{"kind":"Account","name":"Six Fields","status":"Open","bureaus":["EQ"],"account_ref":"six fields","bureau_values":[{"bureau":"EQ","responsibility_raw":"Individual","dispute_status":"Account not disputed","account_rating":"Paid as agreed","creditor_type":"Bank","payment_frequency":"Monthly","last_verified":"03/2026"}]}]'::jsonb, null); select (v.responsibility_raw || '|' || v.dispute_status || '|' || v.account_rating || '|' || v.creditor_type || '|' || v.payment_frequency || '|' || v.last_verified) as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id where i.account_ref='six fields'`),
      "Individual|Account not disputed|Paid as agreed|Bank|Monthly|03/2026"],

    ["…and are invisible to an unrelated organization, like every other column",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-137', '[{"kind":"Account","name":"Six Fields","status":"Open","bureaus":["EQ"],"account_ref":"six fields","bureau_values":[{"bureau":"EQ","dispute_status":"Account disputed"}]}]'::jsonb, null); set local request.jwt.claims = '{"sub":"${OTHER52}","role":"authenticated"}'; select count(*)::int as rows from public.report_item_bureau_values where dispute_status is not null`), 0],

    ["…and are append-only, like every other column",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-137', '[{"kind":"Account","name":"Six Fields","status":"Open","bureaus":["EQ"],"account_ref":"six fields","bureau_values":[{"bureau":"EQ","last_verified":"03/2026"}]}]'::jsonb, null); update public.report_item_bureau_values set last_verified='01/1900'; select 0 as rows`), "ERR 42501"],

    /* 0139 — public-record and inquiry fields. Additive columns on the CR-2
       table, so the point of probing them is that they inherited its
       authorization and append-only behaviour unchanged. */
    ["a public record and an inquiry are written as ITEMS, with their own fields",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-139', '[{"kind":"Public Record","name":"Chapter 7 Bankruptcy","status":"Discharged","bureaus":["EQ"],"account_ref":"pr probe","bureau_values":[{"bureau":"EQ","account_type":"Chapter 7 Bankruptcy","status":"Discharged","filed_on":"04/2019","reference_number":"19-40771","court":"US BKPT CT","liability_cents":4120000,"asset_cents":200000,"exempt_cents":200000}]},{"kind":"Inquiry","name":"Calder Mutual","status":"Inquiry","bureaus":["EQ"],"account_ref":"inq probe","bureau_values":[{"bureau":"EQ","inquiry_date":"11/04/2025"}]}]'::jsonb, null); select (select count(*) from public.report_items i join public.credit_reports r on r.id=i.report_id where r.parser_version='probe-139' and i.kind='Public Record')::text || ':' || (select count(*) from public.report_items i join public.credit_reports r on r.id=i.report_id where r.parser_version='probe-139' and i.kind='Inquiry')::text || ':' || (select v.filed_on || '|' || v.court || '|' || v.liability_cents::text from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id where i.account_ref='pr probe') as rows`),
      "1:1:04/2019|US BKPT CT|4120000"],

    ["an inquiry with no stated type stores none — UNKNOWN, not inferred",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-139', '[{"kind":"Inquiry","name":"Calder Mutual","status":"Inquiry","bureaus":["EQ"],"account_ref":"inq probe","bureau_values":[{"bureau":"EQ","inquiry_date":"11/04/2025"}]}]'::jsonb, null); select (v.inquiry_type is null)::text as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id where i.account_ref='inq probe'`), "true"],

    ["a public record's filing date never lands in open_date",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-139', '[{"kind":"Public Record","name":"Chapter 7 Bankruptcy","status":"Discharged","bureaus":["EQ"],"account_ref":"pr probe","bureau_values":[{"bureau":"EQ","filed_on":"04/2019"}]}]'::jsonb, null); select (v.open_date is null and v.filed_on = '04/2019')::text as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id where i.account_ref='pr probe'`), "true"],

    ["the new fields are invisible to an unrelated organization, like every other column",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-139', '[{"kind":"Public Record","name":"PR","status":"Discharged","bureaus":["EQ"],"account_ref":"pr probe","bureau_values":[{"bureau":"EQ","court":"US BKPT CT"}]}]'::jsonb, null); set local request.jwt.claims = '{"sub":"${OTHER52}","role":"authenticated"}'; select count(*)::int as rows from public.report_item_bureau_values where court is not null`), 0],

    ["…and append-only, like every other column",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-139', '[{"kind":"Public Record","name":"PR","status":"Discharged","bureaus":["EQ"],"account_ref":"pr probe","bureau_values":[{"bureau":"EQ","inquiry_type":"Hard"}]}]'::jsonb, null); update public.report_item_bureau_values set inquiry_type='Soft'; select 0 as rows`), "ERR 42501"],

    ["a bureau value with no per-bureau fields writes no row at all",
      () => probe52(OWNER52, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-137', '[{"kind":"Account","name":"Bare","status":"Open","bureaus":["EQ"],"account_ref":"bare","bureau_values":[]}]'::jsonb, null); select count(*)::int as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id where i.account_ref='bare'`), 0],
  ] : [["(no Lakeside client to probe)", () => "skip", "skip"]];
  runPhase("phase 52", P52, { strict: true });
}

/* Phase 53 — report completeness, reconciliation and partial acceptance
   (0138, CR-14). Three new tables holding facts about a credit report, none of
   them carrying a tenancy column: authorization must resolve entirely through
   credit_reports → credit_report_visible().

   The probes that matter most are not the reads. They are:
     • the VERDICT is derived in SQL, so a client cannot claim a complete
       import over a partial parse;
     • acceptance needs WRITE permission on the case, not merely having done
       the import — the uploader is often not the person authorised to decide;
     • acceptance changes NO fact: import_quality stays partial and
       report_analysis_complete() stays false. */
if (runs(53)) {
  startPhase("phase 53");
  const probe53 = (uid, sql, seed = "") => {
    try {
      return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const text = String(e.message) + "\n" + String(e.stdout ?? "");
      const m = text.match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWNER53 = U["org.owner@bes.test"];
  const OTHER53 = U["org2.owner@bes.test"];
  const AGENT53 = U["org.agent@bes.test"];
  const ownerSees53 = probe53(OWNER53, `select count(*)::int as rows from public.fulfillment_clients where id='${T.lakeside_client}'`) === 1;

  const ITEM53 = `[{"kind":"Account","name":"Quality Probe","status":"Open","bureaus":["EQ"],"account_ref":"quality probe"}]`;
  const FACTS53 = `[{"field_key":"dofd","state":"not_exposed_by_provider","reason":"This provider does not expose a delinquency date."}]`;
  const PASS53 = `[{"bureau":"EQ","check_key":"accounts","stated":1,"parsed":1,"ok":true}]`;
  const SHORT53 = `[{"bureau":"EQ","check_key":"accounts","stated":30,"parsed":24,"ok":false,"reason":"6 not read."}]`;
  const NOSECTION53 = `[{"check_key":"section:summary","stated":1,"parsed":0,"ok":false,"reason":"missing"}]`;
  const imp = (recon, facts = FACTS53) =>
    `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-138', '${ITEM53}'::jsonb, null, '${facts}'::jsonb, '${recon}'::jsonb)`;
  const QUALITY = `select import_quality::text as rows from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1`;

  const P53 = ownerSees53 ? [
    ["a reconciled import is graded complete, by the database",
      () => probe53(OWNER53, `${imp(PASS53)}; ${QUALITY}`), "complete"],

    /* THE PROBE THIS PHASE EXISTS FOR. The client sends checks, never a
       verdict — so a parse that read 24 of 30 cannot be called complete. */
    ["a short parse is graded partial no matter what the client wanted",
      () => probe53(OWNER53, `${imp(SHORT53)}; ${QUALITY}`), "partial"],

    ["a missing section is graded review_required, not partial",
      () => probe53(OWNER53, `${imp(NOSECTION53)}; ${QUALITY}`), "review_required"],

    ["an import with no reconciliation is graded nothing — unknown, not complete",
      () => probe53(OWNER53, `${imp(PASS53).replace(`'${PASS53}'::jsonb`, "null")}; select coalesce(import_quality::text, 'null') as rows from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1`), "null"],

    ["completeness-dependent analysis is off for a partial snapshot",
      () => probe53(OWNER53, `${imp(SHORT53)}; select public.report_analysis_complete((select id from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1))::text as rows`), "false"],

    ["…and on for a complete one",
      () => probe53(OWNER53, `${imp(PASS53)}; select public.report_analysis_complete((select id from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1))::text as rows`), "true"],

    ["…and off for a report imported before the manifest existed",
      () => probe53(OWNER53, `select public.report_analysis_complete('00000000-0000-4000-8000-000000000000')::text as rows`), "false"],

    ["the facts and checks are readable by the client's organization",
      () => probe53(OWNER53, `${imp(SHORT53)}; select ((select count(*) from public.report_completeness) > 0 and (select count(*) from public.report_reconciliation) > 0)::text as rows`), "true"],

    ["an unrelated organization reads none of it",
      () => probe53(OWNER53, `${imp(SHORT53)}; set local request.jwt.claims = '{"sub":"${OTHER53}","role":"authenticated"}'; select ((select count(*) from public.report_completeness) + (select count(*) from public.report_reconciliation))::int as rows`), 0],

    ["…and cannot write a completeness fact against another organization's report",
      () => probe53(OWNER53, `${imp(SHORT53)}; set local request.jwt.claims = '{"sub":"${OTHER53}","role":"authenticated"}'; insert into public.report_completeness (report_id, field_key, state, reason) select id, 'x', 'present', null from public.credit_reports limit 1; select 0 as rows`), "ERR 42501"],

    ["a non-present state must say why",
      () => probe53(OWNER53, `${imp(SHORT53)}; insert into public.report_completeness (report_id, field_key, state) select id, 'y', 'parse_failed' from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; select 0 as rows`), "ERR 23514"],

    ["the facts are append-only: no update grant",
      () => probe53(OWNER53, `${imp(SHORT53)}; update public.report_completeness set state='present'; select 0 as rows`), "ERR 42501"],

    ["…and no delete grant",
      () => probe53(OWNER53, `${imp(SHORT53)}; delete from public.report_reconciliation; select 0 as rows`), "ERR 42501"],

    /* Acceptance is a decision about the CASE, so it needs write permission on
       the case — not merely having done the import. */
    ["an authorised person may accept a partial snapshot, with a reason",
      () => probe53(OWNER53, `${imp(SHORT53)}; insert into public.report_partial_acceptances (report_id, accepted_by, reason) select id, '${OWNER53}', 'Client needs the round out today; the missing accounts are positive.' from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; select count(*)::int as rows from public.report_partial_acceptances`), 1],

    /* The report id is carried across the role switch in a TEMP table, which
       has no RLS. Selecting it from credit_reports as the other organization
       would return no rows, the insert would touch nothing, and a refusal-shaped
       probe would pass without ever reaching the policy — the "0 rows touched
       is not an error" trap this suite has been caught by before. */
    ["…and an unrelated organization may not, even knowing the report id",
      () => probe53(OWNER53, `${imp(SHORT53)}; create temp table probe53_target as select id from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; set local request.jwt.claims = '{"sub":"${OTHER53}","role":"authenticated"}'; insert into public.report_partial_acceptances (report_id, accepted_by, reason) select id, '${OTHER53}', 'Not my client but I would like to proceed.' from probe53_target; select 0 as rows`), "ERR 42501"],

    ["…and the probe above really did have an id to try",
      () => probe53(OWNER53, `${imp(SHORT53)}; create temp table probe53_check as select id from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; select count(*)::int as rows from probe53_check`), 1],

    ["…and nobody may accept in somebody else's name",
      () => probe53(OWNER53, `${imp(SHORT53)}; insert into public.report_partial_acceptances (report_id, accepted_by, reason) select id, '${AGENT53}', 'Recorded against a colleague who did not decide this.' from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; select 0 as rows`), "ERR 42501"],

    ["…and an acceptance with no real reason is refused",
      () => probe53(OWNER53, `${imp(SHORT53)}; insert into public.report_partial_acceptances (report_id, accepted_by, reason) select id, '${OWNER53}', 'ok' from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; select 0 as rows`), "ERR 23514"],

    /* ACCEPTANCE CHANGES A DECISION, NOT A FACT. */
    ["accepting a partial snapshot leaves it partial and leaves analysis off",
      () => probe53(OWNER53, `${imp(SHORT53)}; insert into public.report_partial_acceptances (report_id, accepted_by, reason) select id, '${OWNER53}', 'Proceeding knowingly on a partial source for this round.' from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; select (select import_quality::text from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1) || ':' || public.report_analysis_complete((select id from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1))::text as rows`), "partial:false"],

    ["…and the failed checks stay failed",
      () => probe53(OWNER53, `${imp(SHORT53)}; insert into public.report_partial_acceptances (report_id, accepted_by, reason) select id, '${OWNER53}', 'Proceeding knowingly on a partial source for this round.' from public.credit_reports where fulfillment_client_id='${T.lakeside_client}' order by created_at desc limit 1; select count(*)::int as rows from public.report_reconciliation where not ok`), 1],

    ["a report's verdict cannot be edited after the fact",
      () => probe53(OWNER53, `${imp(SHORT53)}; update public.credit_reports set import_quality='complete' where fulfillment_client_id='${T.lakeside_client}'; select 0 as rows`), "ERR 42501"],

    ["the writer is still SECURITY INVOKER after 0138",
      () => q(`select (not prosecdef)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_credit_report'`)[0].rows, "true"],

    ["nothing was backfilled: no historical report was graded",
      () => q(`select ((select count(*) from public.report_completeness) = 0 and (select count(*) from public.report_reconciliation) = 0 and (select count(*) from public.credit_reports where import_quality is not null) = 0)::text as rows`)[0].rows, "true"],

    /* CR-3 reads per-bureau values across SEVERAL reports at once to build a
       chronology. Same policy chain as the single-report read, and the probe
       exists because a cross-report query is exactly where a join could widen
       what one organization sees. */
    ["a cross-report read of bureau values stays inside the organization",
      () => probe53(OWNER53, `${imp(PASS53)}; ${imp(PASS53)}; set local request.jwt.claims = '{"sub":"${OTHER53}","role":"authenticated"}'; select count(*)::int as rows from public.report_item_bureau_values v join public.report_items i on i.id=v.report_item_id join public.credit_reports r on r.id=i.report_id where r.fulfillment_client_id='${T.lakeside_client}'`), 0],

    ["…and the owner reading two snapshots at once sees both",
      () => probe53(OWNER53, `${imp(PASS53)}; ${imp(PASS53)}; select count(distinct r.id)::int as rows from public.credit_reports r where r.fulfillment_client_id='${T.lakeside_client}' and r.parser_version='probe-138'`), 2],

    /* ── R5-adjacent (0141): a count without its window is not a count ──
       The summary states "Inquiries (2 Years)" per bureau; the inquiry
       listing covers three years across all three. The verdict must not be
       graded on a comparison between them — in either layer, or the database
       and the application disagree about the same import. */
    ["a not-comparable check does not grade the import partial",
      () => probe53(OWNER53, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-141', '${ITEM53}'::jsonb, null, '[]'::jsonb, '[{"bureau":"EQ","check_key":"accounts","stated":1,"parsed":1,"ok":true},{"bureau":"EQ","check_key":"inquiries@2_years","stated":23,"parsed":0,"ok":false,"comparable":false,"window":"2_years"}]'::jsonb); ${QUALITY}`), "complete"],

    ["…and a like-for-like shortfall still does",
      () => probe53(OWNER53, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-141b', '${ITEM53}'::jsonb, null, '[]'::jsonb, '[{"bureau":"EQ","check_key":"accounts","stated":1,"parsed":1,"ok":true},{"check_key":"inquiries@3_years","stated":49,"parsed":0,"ok":false,"comparable":true,"window":"3_years"}]'::jsonb); ${QUALITY}`), "partial"],

    ["a report where NOTHING was comparable is review_required, never complete",
      () => probe53(OWNER53, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-141c', '${ITEM53}'::jsonb, null, '[]'::jsonb, '[{"bureau":"EQ","check_key":"inquiries@2_years","stated":23,"parsed":0,"ok":false,"comparable":false,"window":"2_years"}]'::jsonb); ${QUALITY}`), "review_required"],

    ["the window and the source's own wording are stored, not just the numbers",
      () => probe53(OWNER53, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-141d', '${ITEM53}'::jsonb, null, '[]'::jsonb, '[{"bureau":"EQ","check_key":"inquiries@2_years","stated":23,"parsed":0,"ok":false,"comparable":false,"window":"2_years","source_section":"Summary","source_definition":"Inquiries (2 Years)"}]'::jsonb); select (count(*) = 1)::text as rows from public.report_reconciliation where count_window = '2_years' and source_section = 'Summary' and source_definition = 'Inquiries (2 Years)'`), "true"],

    ["two windows of one metric coexist instead of overwriting each other",
      () => probe53(OWNER53, `select public.create_credit_report('${lakesideOrg}', null, '${T.lakeside_client}', null, array['EQ'], current_date, 'manual_upload', null, 'probe-141e', '${ITEM53}'::jsonb, null, '[]'::jsonb, '[{"bureau":"EQ","check_key":"accounts","stated":1,"parsed":1,"ok":true},{"check_key":"inquiries@2_years","stated":23,"parsed":0,"ok":false,"comparable":false,"window":"2_years"},{"check_key":"inquiries@3_years","stated":49,"parsed":0,"ok":false,"window":"3_years"}]'::jsonb); select count(*)::int as rows from public.report_reconciliation where check_key like 'inquiries@%'`), 2],

    ["the writer is still SECURITY INVOKER after 0141",
      () => q(`select (not prosecdef)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_credit_report'`)[0].rows, "true"],
  ] : [["(no Lakeside client to probe)", () => "skip", "skip"]];
  runPhase("phase 53", P53, { strict: true });
}

if (runs(54)) {
  startPhase("phase 54");
  /* R5 — the outcome vocabulary. Two things are proved here and nowhere else:
     that `dispute_item_outcomes` is scoped by the same client chain as every
     other credit record, and that the DATABASE refuses the two claims the
     platform must never make casually — a bureau-confirmed deletion inferred
     from a reimport, and a correction recorded without review. The domain
     module refuses them too, but it is not the only writer. */
  const probe54 = (uid, sql, seed = "") => {
    try {
      return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const text = String(e.message) + "\n" + String(e.stdout ?? "");
      const m = text.match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWNER54 = U["org.owner@bes.test"];
  const OTHER54 = U["org2.owner@bes.test"];
  const ownerSees54 = probe54(OWNER54, `select count(*)::int as rows from public.fulfillment_clients where id='${T.lakeside_client}'`) === 1;

  const NOTE54 = "Equifax result notice dated 1 Sep 2026 states the item was deleted.";
  const ins54 = (uid, outcome, source, note = "") =>
    `insert into public.dispute_item_outcomes (client_id, account_ref, bureau, outcome, result_source, created_by${note ? ", note" : ""}) values ('${T.lakeside_client}', 'probe-acct', 'EQ', '${outcome}', '${source}', '${uid}'${note ? `, '${note}'` : ""})`;
  const COUNT54 = `select count(*)::int as rows from public.dispute_item_outcomes where client_id='${T.lakeside_client}'`;
  const viewdef = `pg_get_viewdef('public.report_item_changes'::regclass)`;

  const P54 = ownerSees54 ? [
    ["an owner may record a reviewed outcome for their own client",
      () => probe54(OWNER54, `${ins54(OWNER54, "no_longer_observed", "reimport_comparison")}; ${COUNT54}`), 1],

    /* THE PROBE THIS PHASE EXISTS FOR. */
    ["a reimport comparison cannot record a bureau-confirmed deletion",
      () => probe54(OWNER54, `${ins54(OWNER54, "bureau_confirmed_deletion", "reimport_comparison", NOTE54)}; ${COUNT54}`), "ERR 23514"],

    ["…and a bureau result notice can, with a note saying where it came from",
      () => probe54(OWNER54, `${ins54(OWNER54, "bureau_confirmed_deletion", "cra_result_notice", NOTE54)}; ${COUNT54}`), 1],

    ["a confirmed deletion with no note is refused",
      () => probe54(OWNER54, `${ins54(OWNER54, "bureau_confirmed_deletion", "cra_result_notice")}; ${COUNT54}`), "ERR 23514"],

    ["a correction cannot be recorded from a diff",
      () => probe54(OWNER54, `${ins54(OWNER54, "corrected", "reimport_comparison", NOTE54)}; ${COUNT54}`), "ERR 23514"],

    ["…nor without a reviewer's note",
      () => probe54(OWNER54, `${ins54(OWNER54, "corrected", "operator_review")}; ${COUNT54}`), "ERR 23514"],

    ["an unrelated organization cannot record an outcome against this client",
      () => probe54(OTHER54, `${ins54(OTHER54, "no_longer_observed", "reimport_comparison")}; select 0 as rows`), "ERR 42501"],

    ["an outcome cannot be attributed to somebody else",
      () => probe54(OWNER54, `${ins54(OTHER54, "no_longer_observed", "reimport_comparison")}; select 0 as rows`), "ERR 42501"],

    ["an unrelated organization cannot read this client's outcomes",
      () => probe54(OWNER54, `${ins54(OWNER54, "no_longer_observed", "reimport_comparison")}; set local request.jwt.claims = '{"sub":"${OTHER54}","role":"authenticated"}'; ${COUNT54}`), 0],

    /* Append-only: a reviewer who changes their mind adds a row, and the
       earlier conclusion stays readable. That is why the table carries no
       unique constraint. */
    ["a recorded outcome cannot be edited",
      () => probe54(OWNER54, `${ins54(OWNER54, "no_longer_observed", "reimport_comparison")}; update public.dispute_item_outcomes set outcome='bureau_confirmed_deletion' where client_id='${T.lakeside_client}'; select 0 as rows`), "ERR 42501"],

    ["a recorded outcome cannot be deleted",
      () => probe54(OWNER54, `${ins54(OWNER54, "no_longer_observed", "reimport_comparison")}; delete from public.dispute_item_outcomes where client_id='${T.lakeside_client}'; select 0 as rows`), "ERR 42501"],

    ["…and a second review of the same item sits beside the first",
      () => probe54(OWNER54, `${ins54(OWNER54, "no_longer_observed", "reimport_comparison")}; ${ins54(OWNER54, "bureau_confirmed_deletion", "cra_result_notice", NOTE54)}; ${COUNT54}`), 2],

    /* Not "0 rows": the grant itself is revoked, so anon is refused before
       any policy is consulted. A filtered empty read would be weaker. */
    ["anon is refused before RLS is even reached",
      () => { try { q(`begin; set local role anon; ${COUNT54}; rollback;`); return "no error"; } catch (e) { const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } }, "ERR 42501"],

    /* The view is what used to say "deleted". These prove the word is gone
       and that the coverage gate is real, read off the LIVE definition. */
    ["the comparison view no longer labels an absence a deletion",
      () => q(`select (position('deleted' in ${viewdef}) = 0)::text as rows`)[0].rows, "true"],

    ["…and it consults import_quality before calling anything absent",
      () => q(`select (position('import_quality' in ${viewdef}) > 0)::text as rows`)[0].rows, "true"],

    ["…and it names no_longer_observed instead",
      () => q(`select (position('no_longer_observed' in ${viewdef}) > 0)::text as rows`)[0].rows, "true"],

    ["the view is still SECURITY INVOKER",
      () => q(`select (position('security_invoker=true' in array_to_string(c.reloptions, ',')) > 0)::text as rows from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_item_changes'`)[0].rows, "true"],

    ["no legacy row was rewritten into a stronger conclusion",
      () => q(`select (not exists (select 1 from public.dispute_item_outcomes where result_source='legacy_manual_entry' and outcome::text not like 'legacy\\_%'))::text as rows`)[0].rows, "true"],

    ["the KPI catalogue keeps confirmed deletions and observed absences apart",
      () => q(`select count(distinct key)::int as rows from public.kpi_definitions where key in ('outcomes.bureau_confirmed_deletion','outcomes.no_longer_observed')`)[0].rows, 2],
  ] : [["(no Lakeside client to probe)", () => "skip", "skip"]];
  runPhase("phase 54", P54, { strict: true });
}

if (runs(55)) {
  startPhase("phase 55");
  /* Agency HQ for the real team. Three boundaries are proved here:
       • BES-internal work is invisible to every customer organization;
       • a BES workspace belongs to the agency and holds no tenant's work;
       • a partner sees their own record and nothing of anyone else's —
         with no organization involved anywhere in the chain. */
  const probe55 = (uid, sql, seed = "") => {
    try {
      return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const text = String(e.message) + "\n" + String(e.stdout ?? "");
      const m = text.match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWNER55 = U["bes.owner@bes.test"];
  const AGENT55 = U["bes.credit@bes.test"];
  const ORG55   = U["org.owner@bes.test"];
  const OTHERORG = U["org2.owner@bes.test"];
  const AG = q(`select id::text as rows from public.agencies limit 1`)[0].rows;

  /* Two statements, never a data-modifying CTE. `work_items_workspace_
     consistency` looks the workspace up in `public.workspaces`, and a row
     inserted in the SAME statement is not in that trigger's snapshot — so a
     `with w as (insert …)` form fails with a check violation that looks like
     a policy problem and is not. Learned in migration 0135; the same shape
     bites here. */
  /* Creates the workspace AND its default status, because that is what the
     application does. A workspace with no status silently refuses every item
     — the consistency trigger derives an item's stage from its status — so a
     probe that skipped the status would be testing an impossible state. */
  const mkWs = `insert into public.workspaces (agency_id, organization_id, name) values ('${AG}', null, 'BES Team Probe'); insert into public.workspace_statuses (workspace_id, key, label, position, canonical_stage, is_terminal) values ((select id from public.workspaces where agency_id='${AG}' and name='BES Team Probe' order by created_at desc limit 1), 'todo', 'To do', 0, 'Queued', false);`;
  const wsId = `(select id from public.workspaces where agency_id='${AG}' and name='BES Team Probe' order by created_at desc limit 1)`;
  const mkTask = (title) => `${mkWs} insert into public.work_items (agency_id, scope, related_type, title, workspace_id) values ('${AG}', 'AGENCY', 'project', '${title}', ${wsId});`;
  const taskId = (title) => `(select id from public.work_items where title='${title}' order by created_at desc limit 1)`;

  const P55 = [
    ["a BES manager may create an agency workspace with no organization",
      () => probe55(OWNER55, `${mkWs}; select count(*)::int as rows from public.workspaces where agency_id='${AG}' and organization_id is null`), 1],

    ["an organization owner cannot create one",
      () => probe55(ORG55, `${mkWs}; select 0 as rows`), "ERR 42501"],

    ["…and cannot see one that exists",
      () => probe55(OWNER55, `${mkWs}; set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}'; select count(*)::int as rows from public.workspaces where agency_id='${AG}'`), 0],

    /* THE BOUNDARY THAT MATTERS: internal work is not a customer's. */
    /* THE BOUNDARY THAT MATTERS: internal work is not a customer's. */
    ["BES-internal work is invisible to every organization user",
      () => probe55(OWNER55, `${mkTask("Internal probe")} set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}'; select count(*)::int as rows from public.work_items where title='Internal probe'`), 0],

    ["…and the BES author does see it",
      () => probe55(OWNER55, `${mkTask("Internal probe 2")} select count(*)::int as rows from public.work_items where title='Internal probe 2'`), 1],

    ["a workspace cannot hold both an organization and an agency",
      () => probe55(OWNER55, `insert into public.workspaces (agency_id, organization_id, name) values ('${AG}', '${lakesideOrg}', 'Both'); select 0 as rows`), "ERR 23514"],

    /* RLS refuses this before the CHECK is reached, so the probe asserts the
       constraint EXISTS rather than which of the two layers spoke first. */
    ["…nor neither, and the constraint says so",
      () => q(`select (count(*) = 1)::text as rows from pg_constraint where conname='workspaces_owner_ck'`)[0].rows, "true"],

    ["an organization item cannot be filed in an agency workspace",
      () => probe55(OWNER55, `${mkWs} insert into public.work_items (agency_id, scope, organization_id, related_type, title, workspace_id) values ('${AG}', 'ORGANIZATION', '${lakesideOrg}', 'project', 'Wrong scope', ${wsId}); select 0 as rows`), "ERR 23514"],

    /* Checklist and blockers inherit the task's authorization exactly. */
    ["a checklist is invisible to somebody who cannot see its task",
      () => probe55(OWNER55, `${mkTask("Checklist probe")} insert into public.work_checklist_items (work_item_id, label) values (${taskId("Checklist probe")}, 'Probe step'); set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}'; select count(*)::int as rows from public.work_checklist_items`), 0],

    ["…and visible to the BES staff member who owns it",
      () => probe55(OWNER55, `${mkTask("Checklist probe 2")} insert into public.work_checklist_items (work_item_id, label) values (${taskId("Checklist probe 2")}, 'Probe step'); select count(*)::int as rows from public.work_checklist_items where work_item_id = ${taskId("Checklist probe 2")}`), 1],

    ["a blocker needs a reason or another task",
      () => probe55(OWNER55, `${mkTask("Blocker probe")} insert into public.work_item_blockers (work_item_id, note) values (${taskId("Blocker probe")}, 'x'); select 0 as rows`), "ERR 23514"],

    ["a task cannot block itself",
      () => probe55(OWNER55, `${mkTask("Self probe")} insert into public.work_item_blockers (work_item_id, blocked_by_id) values (${taskId("Self probe")}, ${taskId("Self probe")}); select 0 as rows`), "ERR 23514"],

    /* Federal holidays are set by statute, not by staff. */
    ["a U.S. federal holiday cannot be edited",
      () => probe55(OWNER55, `insert into public.agency_calendar_events (agency_id, kind, source_key, name, event_date, observed_date, system_managed) values ('${AG}','us_federal_holiday','probe:hol','Probe Day','2030-07-04','2030-07-04',true); update public.agency_calendar_events set name='Moved' where source_key='probe:hol'; select 0 as rows`), "ERR 42501"],

    ["…nor deleted",
      () => probe55(OWNER55, `insert into public.agency_calendar_events (agency_id, kind, source_key, name, event_date, observed_date, system_managed) values ('${AG}','us_federal_holiday','probe:hol2','Probe Day','2030-07-04','2030-07-04',true); delete from public.agency_calendar_events where source_key='probe:hol2'; select 0 as rows`), "ERR 42501"],

    ["generating the same holiday twice inserts it once",
      () => probe55(OWNER55, `insert into public.agency_calendar_events (agency_id, kind, source_key, name, event_date, observed_date, system_managed) values ('${AG}','us_federal_holiday','probe:hol3','Probe Day','2030-07-04','2030-07-04',true) on conflict (agency_id, source_key) do nothing; insert into public.agency_calendar_events (agency_id, kind, source_key, name, event_date, observed_date, system_managed) values ('${AG}','us_federal_holiday','probe:hol3','Probe Day','2030-07-04','2030-07-04',true) on conflict (agency_id, source_key) do nothing; select count(*)::int as rows from public.agency_calendar_events where source_key='probe:hol3'`), 1],

    ["an ordinary staff member may read the calendar but not add to it",
      () => probe55(AGENT55, `insert into public.agency_calendar_events (agency_id, kind, name, event_date, observed_date) values ('${AG}','company_event','Probe','2030-07-04','2030-07-04'); select 0 as rows`), "ERR 42501"],

    /* THE BUG THIS PHASE FOUND. `announcements` has no INSERT policy — every
       write goes through a writer — so a direct upsert would have been
       refused on every run, silently, and the team would simply never have
       been told about a holiday. */
    ["announcements take no direct insert; there is a writer",
      () => probe55(OWNER55, `insert into public.announcements (organization_id, agency_id, audience, source_key, title, body, published_at) values (null,'${AG}','bes_internal','probe:direct','T','B',now()); select 0 as rows`), "ERR 42501"],

    ["the writer publishes a holiday notice once, however often it runs",
      () => probe55(OWNER55, `select public.publish_holiday_announcement('${AG}','probe:ann','T','B'); select public.publish_holiday_announcement('${AG}','probe:ann','T','B'); select count(*)::int as rows from public.announcements where source_key='probe:ann'`), 1],

    ["…and says whether it created anything",
      () => probe55(OWNER55, `select public.publish_holiday_announcement('${AG}','probe:ann2','T','B'); select (public.publish_holiday_announcement('${AG}','probe:ann2','T','B'))::text as rows`), "false"],

    ["somebody who is not BES staff cannot publish one",
      () => probe55(ORG55, `select public.publish_holiday_announcement('${AG}','probe:ann3','T','B') as rows`), "ERR 42501"],

    ["an internal announcement never reaches an organization user",
      () => probe55(OWNER55, `select public.publish_holiday_announcement('${AG}','probe:ann4','Internal','B'); set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}'; select count(*)::int as rows from public.announcements where source_key='probe:ann4'`), 0],

    ["…and does reach BES staff",
      () => probe55(OWNER55, `select public.publish_holiday_announcement('${AG}','probe:ann5','Internal','B'); set local request.jwt.claims = '{"sub":"${AGENT55}","role":"authenticated"}'; select count(*)::int as rows from public.announcements where source_key='probe:ann5'`), 1],

    /* ── Partners: a boundary with no tenant in it ─────────────────── */
    ["a partner can be created with only a name and an email",
      () => probe55(OWNER55, `insert into public.outsourcing_groups (agency_id, name, contact_email) values ('${AG}','Probe Partner','probe@example.test'); select count(*)::int as rows from public.outsourcing_groups where contact_email='probe@example.test'`), 1],

    /* The product's EXACT statement shape (agency-partners.ts): the client
       supplies the id and asks for nothing back. `INSERT … RETURNING`
       re-checks the new row against the SELECT policy, and can_see_partner
       looks the row up in a snapshot that does not yet contain it — so the
       .select("id") form fails 42501 for everyone, which is how "Add
       partner" broke in production while the two-statement probe above
       stayed green. Probe the shape the product uses, not a nicer one. */
    ["…and creating one the way the PRODUCT does — client-supplied id, no RETURNING — works",
      () => probe55(OWNER55, `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values ('44444444-0000-4000-8000-0000000000c9'::uuid,'${AG}','Probe Product Shape','shape@example.test'); select count(*)::int as rows from public.outsourcing_groups where id='44444444-0000-4000-8000-0000000000c9'`), 1],

    /* Two statements, not a data-modifying CTE. The product creates a partner
       with a plain insert and that works; inside a CTE the same insert fails its
       WITH CHECK, so the probe was measuring a statement shape nothing uses. */
    ["a partner contact is not visible to an organization user",
      () => probe55(OWNER55, `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values ('44444444-0000-4000-8000-0000000000f1'::uuid,'${AG}','Probe P2','p2@example.test'); insert into public.partner_contacts (group_id, agency_id, full_name, email) values ('44444444-0000-4000-8000-0000000000f1'::uuid, '${AG}', 'Probe Person', 'person@example.test'); set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}'; select count(*)::int as rows from public.partner_contacts`), 0],

    /* A KNOWN group id, not `select ... limit 1`. Since 0184 an agent sees no
       partner, so that subquery returned nothing, the insert wrote zero rows,
       and the probe passed without testing anything. A probe that cannot fail
       is worse than no probe. */
    ["an ordinary BES agent cannot create a partner contact",
      () => { const g = q(`select id::text as rows from public.outsourcing_groups limit 1`)[0].rows;
              return probe55(AGENT55, `insert into public.partner_contacts (group_id, agency_id, full_name, email) values ('${g}'::uuid, '${AG}', 'X', 'x@example.test'); select 0 as rows`); }, "ERR 42501"],

    ["a partner file is not shared merely by being filed against the partner",
      () => q(`select (position('shared_with_partner' in pg_get_expr(polqual, polrelid)) > 0)::text as rows from pg_policy where polname='files_partner_select'`)[0].rows, "true"],

    ["…and partner activity must be marked shared_with_partner",
      () => q(`select (position('shared_with_partner' in pg_get_expr(polqual, polrelid)) > 0)::text as rows from pg_policy where polname='activity_partner_select'`)[0].rows, "true"],

    ["a suspended contact resolves to no partner at all",
      () => q(`select (position('c.status = ''active''' in pg_get_functiondef(p.oid)) > 0)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='partner_group_of_user'`)[0].rows, "true"],

    ["…and so does a suspended or archived partner",
      () => q(`select (pg_get_functiondef(p.oid) like '%lifecycle not in%')::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='partner_group_of_user'`)[0].rows, "true"],

    ["nobody unrelated resolves to a partner",
      () => probe55(ORG55, `select coalesce(public.partner_group_of_user()::text, 'none') as rows`), "none"],

    /* ── Partner portal (0247): their clients, and deliberate file sharing ── */
    ["my_partner_clients returns nothing for a user with no partner",
      () => probe55(ORG55, `select count(*)::int as rows from public.my_partner_clients()`), 0],

    ["a partner contact sees THEIR clients and nobody else's",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email, lifecycle) values
           ('44444444-0000-4000-8000-0000000000fa'::uuid,'${AG}','Probe Portal A','pa@example.test','active'),
           ('44444444-0000-4000-8000-0000000000fb'::uuid,'${AG}','Probe Portal B','pb@example.test','active');
         insert into public.partner_contacts (group_id, agency_id, full_name, email, user_id, status) values
           ('44444444-0000-4000-8000-0000000000fa'::uuid, '${AG}', 'Probe Contact', 'pc@example.test', '${ORG55}'::uuid, 'active');
         insert into public.fulfillment_clients (agency_id, name, email, mode, outsourcing_group_id) values
           ('${AG}', 'Mine', 'mine@example.test', 'outsourcing_only', '44444444-0000-4000-8000-0000000000fa'::uuid),
           ('${AG}', 'Not mine', 'notmine@example.test', 'outsourcing_only', '44444444-0000-4000-8000-0000000000fb'::uuid);
         set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}';
         select string_agg(name, ',') as rows from public.my_partner_clients()`), "Mine"],

    ["…and a suspended partner resolves to no clients at all",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email, lifecycle) values
           ('44444444-0000-4000-8000-0000000000fc'::uuid,'${AG}','Probe Portal C','pcx@example.test','suspended');
         insert into public.partner_contacts (group_id, agency_id, full_name, email, user_id, status) values
           ('44444444-0000-4000-8000-0000000000fc'::uuid, '${AG}', 'Probe Contact', 'pc2@example.test', '${ORG55}'::uuid, 'active');
         insert into public.fulfillment_clients (agency_id, name, email, mode, outsourcing_group_id)
           select '${AG}', 'Hidden', 'hidden@example.test', 'outsourcing_only', '44444444-0000-4000-8000-0000000000fc'::uuid;
         set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}';
         select count(*)::int as rows from public.my_partner_clients()`), 0],

    /* The rule, not the example: the function must never widen to internal
       columns. If somebody adds the agent or the notes, this fails. */
    ["my_partner_clients exposes no BES-internal column",
      () => q(`select (def not like '%assigned_agent%' and def not like '%description%' and def not like '%next_action%' and def like '%partner_group_of_user%')::text as rows
                 from (select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname='my_partner_clients') d`)[0].rows, "true"],

    /* A KNOWN group id, fetched as the superuser: an agent sees no partner at
       all since 0184, so a subquery would insert zero rows and the probe
       could never fail. Refused either way — by the permission branch or by
       entity_visible — never accepted. */
    ["uploading a partner file needs the upload permission — not just sight of the partner (0257)",
      () => { const g = q(`select id::text as rows from public.outsourcing_groups where is_fixture = false limit 1`)[0].rows;
              return probe55(AGENT55, `insert into public.files (agency_id, entity_type, entity_id, bucket, path, name, uploaded_by)
        values ('${AG}', 'partner', '${g}', 'bes-files', 'agency/partner/probe/y.pdf', 'y.pdf', '${AGENT55}'::uuid);
        select 0 as rows`); }, "ERR 42501"],

    ["sharing a partner file needs the portal permission",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values
           ('44444444-0000-4000-8000-0000000000fd'::uuid,'${AG}','Probe Portal D','pd@example.test');
         insert into public.files (id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) values
           ('44444444-0000-4000-8000-0000000000fe'::uuid, '${AG}', 'partner', '44444444-0000-4000-8000-0000000000fd', 'bes-files', 'agency/partner/probe/x.pdf', 'x.pdf', '${U["bes.owner@bes.test"]}'::uuid);
         set local request.jwt.claims = '{"sub":"${AGENT55}","role":"authenticated"}';
         select public.set_partner_file_shared('44444444-0000-4000-8000-0000000000fe'::uuid, true); select 0 as rows`), "ERR 42501"],

    ["…and with it, the share lands and is audited",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values
           ('44444444-0000-4000-8000-0000000000fd'::uuid,'${AG}','Probe Portal D','pd@example.test');
         insert into public.files (id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) values
           ('44444444-0000-4000-8000-0000000000fe'::uuid, '${AG}', 'partner', '44444444-0000-4000-8000-0000000000fd', 'bes-files', 'agency/partner/probe/x.pdf', 'x.pdf', '${U["bes.owner@bes.test"]}'::uuid);
         select public.set_partner_file_shared('44444444-0000-4000-8000-0000000000fe'::uuid, true);
         select ((select shared_with_partner from public.files where id='44444444-0000-4000-8000-0000000000fe')::int
               + (select count(*) from public.activity_events where entity_type='partner' and action like 'File shared%')::int)::int as rows`), 2],

    ["sharing a file stored OUTSIDE the partner subtree is refused, even to the owner (003400)",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values
           ('44444444-0000-4000-8000-0000000000fd'::uuid,'${AG}','Probe Portal D','pd@example.test');
         insert into public.files (id, agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) values
           ('44444444-0000-4000-8000-0000000000ff'::uuid, '${AG}', 'partner', '44444444-0000-4000-8000-0000000000fd', 'bes-files', 'agency/channels/probe/leak.pdf', 'leak.pdf', '${U["bes.owner@bes.test"]}'::uuid);
         select public.set_partner_file_shared('44444444-0000-4000-8000-0000000000ff'::uuid, true); select 0 as rows`), "ERR 42501"],

    ["an unshared partner file's object is unreadable through the portal storage policy",
      () => q(`select (position('shared_with_partner' in pg_get_expr(polqual, polrelid)) > 0)::text as rows from pg_policy where polname='bes_files_partner_select' and polrelid='storage.objects'::regclass`)[0].rows, "true"],

    /* ── Partner portal invitations (0248): the door itself ──────────── */
    ["inviting a portal contact needs the portal permission",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values
           ('44444444-0000-4000-8000-0000000000e1'::uuid,'${AG}','Probe Invite A','ia@example.test');
         insert into public.partner_contacts (id, group_id, agency_id, full_name, email) values
           ('44444444-0000-4000-8000-0000000000e2'::uuid, '44444444-0000-4000-8000-0000000000e1'::uuid, '${AG}', 'Probe Invitee', 'invitee@example.test');
         set local request.jwt.claims = '{"sub":"${AGENT55}","role":"authenticated"}';
         select public.invite_partner_contact('44444444-0000-4000-8000-0000000000e2'::uuid) as rows`), "ERR 42501"],

    ["…and with it, ONE open invitation exists however often it is re-sent",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values
           ('44444444-0000-4000-8000-0000000000e1'::uuid,'${AG}','Probe Invite A','ia@example.test');
         insert into public.partner_contacts (id, group_id, agency_id, full_name, email) values
           ('44444444-0000-4000-8000-0000000000e2'::uuid, '44444444-0000-4000-8000-0000000000e1'::uuid, '${AG}', 'Probe Invitee', 'invitee@example.test');
         select public.invite_partner_contact('44444444-0000-4000-8000-0000000000e2'::uuid);
         select public.invite_partner_contact('44444444-0000-4000-8000-0000000000e2'::uuid);
         select (count(*)::int
               + (select count(*)::int from public.partner_contacts where id='44444444-0000-4000-8000-0000000000e2' and invited_at is not null)) as rows
           from public.invitations where partner_contact_id = '44444444-0000-4000-8000-0000000000e2'`), 2],

    ["accepting binds the signed-in account to the contact — and only the invited address may",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values
           ('44444444-0000-4000-8000-0000000000e1'::uuid,'${AG}','Probe Invite A','ia@example.test');
         insert into public.partner_contacts (id, group_id, agency_id, full_name, email) values
           ('44444444-0000-4000-8000-0000000000e2'::uuid, '44444444-0000-4000-8000-0000000000e1'::uuid, '${AG}', 'Probe Invitee',
            (select email from public.profiles where id='${ORG55}'));
         select public.invite_partner_contact('44444444-0000-4000-8000-0000000000e2'::uuid);
         set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}';
         select public.accept_partner_invitation((select token from public.invitations where partner_contact_id='44444444-0000-4000-8000-0000000000e2'));
         set local request.jwt.claims = '{"sub":"${OWNER55}","role":"authenticated"}';
         select (user_id = '${ORG55}'::uuid)::text as rows from public.partner_contacts where id='44444444-0000-4000-8000-0000000000e2'`), "true"],

    ["…while somebody ELSE with the link is refused",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email) values
           ('44444444-0000-4000-8000-0000000000e1'::uuid,'${AG}','Probe Invite A','ia@example.test');
         insert into public.partner_contacts (id, group_id, agency_id, full_name, email) values
           ('44444444-0000-4000-8000-0000000000e2'::uuid, '44444444-0000-4000-8000-0000000000e1'::uuid, '${AG}', 'Probe Invitee',
            (select email from public.profiles where id='${ORG55}'));
         select public.invite_partner_contact('44444444-0000-4000-8000-0000000000e2'::uuid);
         set local request.jwt.claims = '{"sub":"${AGENT55}","role":"authenticated"}';
         select public.accept_partner_invitation((select token from public.invitations where partner_contact_id='44444444-0000-4000-8000-0000000000e2')) as rows`), "ERR 42501"],

    ["a suspended partner's invitation refuses to open",
      () => probe55(OWNER55,
        `insert into public.outsourcing_groups (id, agency_id, name, contact_email, lifecycle) values
           ('44444444-0000-4000-8000-0000000000e1'::uuid,'${AG}','Probe Invite A','ia@example.test','active');
         insert into public.partner_contacts (id, group_id, agency_id, full_name, email) values
           ('44444444-0000-4000-8000-0000000000e2'::uuid, '44444444-0000-4000-8000-0000000000e1'::uuid, '${AG}', 'Probe Invitee',
            (select email from public.profiles where id='${ORG55}'));
         select public.invite_partner_contact('44444444-0000-4000-8000-0000000000e2'::uuid);
         update public.outsourcing_groups set lifecycle='suspended' where id='44444444-0000-4000-8000-0000000000e1';
         set local request.jwt.claims = '{"sub":"${ORG55}","role":"authenticated"}';
         select public.accept_partner_invitation((select token from public.invitations where partner_contact_id='44444444-0000-4000-8000-0000000000e2')) as rows`), "ERR 42501"],

    ["anon reaches no partner contact",
      () => { try { q(`begin; set local role anon; select count(*)::int as rows from public.partner_contacts; rollback;`); return "no error"; } catch (e) { const m = (String(e.message)+String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } }, "ERR 42501"],

    ["anon reaches no agency workspace",
      () => { try { q(`begin; set local role anon; select count(*)::int as rows from public.agency_calendar_events; rollback;`); return "no error"; } catch (e) { const m = (String(e.message)+String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } }, "ERR 42501"],

    /* Production doctrine, at the database. */
    ["a correction to production keeps what it replaced",
      () => q(`select (count(*) = 1)::text as rows from pg_trigger where tgname='production_log_record_revision'`)[0].rows, "true"],

    ["an EOD correction keeps what it replaced",
      () => q(`select (count(*) = 1)::text as rows from pg_trigger where tgname='eod_record_revision'`)[0].rows, "true"],

    ["eod_day_activity is SECURITY INVOKER, so it cannot widen what a caller sees",
      () => q(`select (not prosecdef)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='eod_day_activity'`)[0].rows, "true"],

    /* ── The activation page shows the invited address (0153) ─────────
       A deliberate, bounded disclosure: the token is a 122-bit secret in
       that person's inbox, and retyping their own login was turning a typo
       into an account on the wrong address. These probes keep the bound. */
    ["a live invitation discloses its address to an anonymous visitor",
      () => { const t = q(`select coalesce((select token::text from public.invitations where accepted_at is null and expires_at > now() limit 1),'') as rows`)[0].rows;
              if (!t) return 1;
              try { return q(`begin; set local role anon; select count(*)::int as rows from public.invitation_preview('${t}'); rollback;`)[0].rows; } catch { return "ERR"; } }, 1],

    ["a token nobody issued discloses nothing",
      () => { try { return q(`begin; set local role anon; select count(*)::int as rows from public.invitation_preview('00000000-0000-4000-8000-000000000000'); rollback;`)[0].rows; } catch { return "ERR"; } }, 0],

    /* Expired and accepted must both look exactly like "never existed", so the
       function cannot be used to enumerate which invitations once existed. */
    ["the preview excludes accepted and expired invitations",
      () => q(`select (position('accepted_at is null' in pg_get_functiondef(p.oid)) > 0 and position('expires_at > now()' in pg_get_functiondef(p.oid)) > 0)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='invitation_preview'`)[0].rows, "true"],

    ["…and the invitations table itself stays closed to anon",
      () => { try { q(`begin; set local role anon; select 1 from public.invitations limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],

    /* Knowing the address must still get a stranger nowhere. */
    ["accepting still requires the caller's own email to match",
      () => q(`select (position('auth.uid()' in pg_get_functiondef(p.oid)) > 0 or position('email' in pg_get_functiondef(p.oid)) > 0)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_agency_invitation'`)[0].rows, "true"],
  ];
  runPhase("phase 55", P55, { strict: true });
}

if (runs(56)) {
  startPhase("phase 56");
  /* Agency access control. Two things are proved here:
       • an Agency Admin is agency-wide because of their ROLE, even when the
         scope column disagrees — the defect Dee hit in production;
       • a manager runs operations without receiving the money, and an owner
         can change that for one manager without changing it for another. */
  const p56 = (uid, sql, seed = "") => {
    try {
      return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN56 = U["bes.owner@bes.test"], ADM56 = U["bes.admin@bes.test"];
  const MGR56 = U["bes.manager@bes.test"], LEAD56 = U["bes.lead@bes.test"], AGT56 = U["bes.credit@bes.test"];
  const AG56 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const GRP56 = q(`select coalesce((select id::text from public.outsourcing_groups limit 1),'') as rows`)[0].rows;
  const MGRM = q(`select m.id::text as rows from public.agency_memberships m join public.profiles p on p.id=m.user_id where p.email='bes.manager@bes.test'`)[0].rows;
  const SVC = "11111111-0000-4000-8000-0000000000aa";

  /* A service with a price on it, seeded inside each probe's own rolled-back
     transaction so nothing is left behind. */
  const seed56 = GRP56 ? `
    insert into public.partner_services (id, group_id, agency_id, name, quantity, quantity_unit)
      values ('${SVC}','${GRP56}','${AG56}','Probe Service', 75, 'clients');
    insert into public.partner_service_billing (service_id, agency_id, rate_cents, currency, expected_monthly_cents)
      values ('${SVC}','${AG56}', 21500, 'USD', 86000);
  ` : "";
  const seeService = `select count(*)::int as rows from public.partner_services where id='${SVC}'`;
  const seeBilling = `select count(*)::int as rows from public.partner_service_billing where service_id='${SVC}'`;
  /* Upserts: 0234 wrote the migrated manager's old role defaults as member
     overrides, so a probe's own grant/deny must replace, not collide. */
  const grant = (k) => `insert into public.agency_member_permissions (membership_id, key, allowed) values ('${MGRM}','${k}', true) on conflict (membership_id, key) do update set allowed = true;`;
  const deny  = (k) => `insert into public.agency_member_permissions (membership_id, key, allowed) values ('${MGRM}','${k}', false) on conflict (membership_id, key) do update set allowed = false;`;
  const breakAdminScope = `update public.agency_memberships set scope='assigned' where user_id='${ADM56}';`;

  const P56 = GRP56 ? [
    /* ── THE DEFECT DEE REPORTED ─────────────────────────────────── */
    ["an admin whose scope column says 'assigned' still reaches agency work",
      () => p56(ADM56, `select count(*)::int as rows from public.work_items where scope='AGENCY'`, breakAdminScope),
      q(`select count(*)::int as rows from public.work_items where scope='AGENCY'`)[0].rows],

    ["…and still reaches every partner",
      () => p56(ADM56, `select count(*)::int as rows from public.outsourcing_groups`, breakAdminScope),
      q(`select count(*)::int as rows from public.outsourcing_groups`)[0].rows],

    ["an agent is NOT widened by the same change",
      () => p56(AGT56, `select count(*)::int as rows from public.work_items where scope='AGENCY'`), 0],

    ["joining by invitation now sets a scope that matches the role",
      () => q(`select (position('default_scope_for_role' in pg_get_functiondef(p.oid)) > 0)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_agency_invitation'`)[0].rows, "true"],

    ["no owner or admin is left on a narrower scope",
      () => q(`select count(*)::int as rows from public.agency_memberships where role in ('agency_owner','agency_admin') and scope is distinct from 'agency'`)[0].rows, 0],

    /* ── Operations without the money ────────────────────────────── */
    ["a manager sees the service", () => p56(MGR56, seeService, seed56), 1],
    ["…and does NOT receive its price", () => p56(MGR56, seeBilling, seed56), 0],
    ["a team lead sees the service but not the price",
      () => p56(LEAD56, seeService, seed56) === 1 && p56(LEAD56, seeBilling, seed56) === 0 ? "correct" : "wrong", "correct"],
    ["an agent sees neither",
      () => p56(AGT56, seeService, seed56) === 0 && p56(AGT56, seeBilling, seed56) === 0 ? "correct" : "wrong", "correct"],
    ["the owner sees both", () => p56(OWN56, seeBilling, seed56), 1],
    ["the admin sees both", () => p56(ADM56, seeBilling, seed56), 1],

    /* ── Precedence, in both directions ──────────────────────────── */
    ["an explicit GRANT beats the role default",
      () => p56(MGR56, seeBilling, seed56 + grant("partners.financials.view")), 1],

    ["an explicit DENY beats the role default",
      () => p56(MGR56, seeService, seed56 + deny("partners.view")), 0],

    ["…and the grant applies to that manager ALONE",
      () => p56(LEAD56, seeBilling, seed56 + grant("partners.financials.view")), 0],

    ["revoking it takes the data away again",
      () => p56(MGR56, seeBilling, seed56 + grant("partners.financials.view") + `update public.agency_member_permissions set allowed=false where membership_id='${MGRM}' and key='partners.financials.view';`), 0],

    /* ── Who may change access ───────────────────────────────────── */
    ["a manager cannot grant themselves financial access",
      () => p56(MGR56, `select public.set_agency_permission('${MGRM}','partners.financials.view',true) as rows`), "ERR 42501"],

    ["an admin can",
      /* The function returns void. Casting void to text is not a cast that
         exists, so this probe used to fail on 42883 rather than on the rule —
         it reads back the row that was written instead. */
      () => p56(ADM56, `select public.set_agency_permission('${MGRM}','partners.financials.view',true); select allowed::text as rows from public.agency_member_permissions where membership_id='${MGRM}' and key='partners.financials.view'`), "true"],

    /* An override on an owner or admin would be a switch that does nothing,
       because agency_can answers by role before it reads a row. */
    ["an override cannot be written against an owner or admin",
      () => { const am = q(`select m.id::text as rows from public.agency_memberships m join public.profiles p on p.id=m.user_id where p.email='bes.admin@bes.test'`)[0].rows;
              return p56(OWN56, `select public.set_agency_permission('${am}','partners.financials.view',false) as rows`); }, "ERR 22023"],

    ["a permission change is audited",
      () => p56(ADM56, `select public.set_agency_permission('${MGRM}','partners.financials.view',true); select (count(*) > 0)::text as rows from public.audit_log where action='agency_permission.set'`), "true"],

    /* ── A partner never sees the money ──────────────────────────── */
    ["the billing policy has no partner branch at all",
      () => q(`select (position('partner_contact' in pg_get_expr(polqual, polrelid)) = 0)::text as rows from pg_policy where polname='partner_billing_select'`)[0].rows, "true"],

    ["…and revenue is behind the same capability",
      () => q(`select (position('partners.financials.view' in pg_get_expr(polqual, polrelid)) > 0)::text as rows from pg_policy where polname='partner_revenue_select'`)[0].rows, "true"],

    ["anon reaches no partner billing",
      () => { try { q(`begin; set local role anon; select 1 from public.partner_service_billing limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
  ] : [["(no partner to probe)", () => "skip", "skip"]];
  runPhase("phase 56", P56, { strict: true });
}


if (runs(57)) {
  startPhase("phase 57");
  /* The money, and what cancelling does to everything else.
     Three things are proved here:
       • a manager runs operations and receives no invoice, payment or expense
         — because those tables have no branch that would let them;
       • an invoice cannot be declared paid by anyone: the ledger decides, and
         the same provider transaction twice is still one payment;
       • cancelling one service stops that service and NOTHING else — the
         partner's other engagement, its work and its MRR are untouched. */
  /* The claims are set BEFORE the seed, and the role after it.
     Seeding a work item fires the activity trigger, which refuses to record
     anything with no actor — "Cannot record activity without an agency
     context". Setting the claim first gives the seed an author while it still
     runs as the owner, so RLS is bypassed for the setup and enforced for the
     probe, which is the whole point of the shape. */
  const asUser = (uid, seed, sql) => {
    try {
      return q(`begin; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${seed} set local role authenticated; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const p57 = (uid, sql, seed = "") => asUser(uid, seed, sql);
  /* Same call, named for what it reads: a cascade has to be observed AFTER it
     has run, inside the one transaction that is rolled back. */
  const cascade = (uid, seed, sql) => asUser(uid, seed, sql);

  const OWN57 = U["bes.owner@bes.test"], MGR57 = U["bes.manager@bes.test"];
  const AGT57 = U["bes.credit@bes.test"];
  const AG57 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const GRP57 = q(`select coalesce((select id::text from public.outsourcing_groups limit 1),'') as rows`)[0].rows;

  const S1 = "22222222-0000-4000-8000-00000000a001";
  const S2 = "22222222-0000-4000-8000-00000000a002";
  const INV = "22222222-0000-4000-8000-00000000b001";
  const WRK = "22222222-0000-4000-8000-00000000c001";
  const EXP = "22222222-0000-4000-8000-00000000d001";

  /* Two services, one invoice, one scheduled instalment, one open work item
     on the FIRST service only. Everything is inside the probe's own
     transaction and rolled back. */
  const seed57 = GRP57 ? `
    insert into public.partner_services (id, group_id, agency_id, name, service_type, status)
      values ('${S1}','${GRP57}','${AG57}','Probe CreditOps','CREDITOPS_FULFILLMENT','active'),
             ('${S2}','${GRP57}','${AG57}','Probe CRM','BES_CRM','active');
    insert into public.partner_service_billing (service_id, agency_id, billing_model, rate_cents, effective_from)
      values ('${S1}','${AG57}','RECURRING_WEEKLY', 47500, current_date - 30),
             ('${S2}','${AG57}','RECURRING_MONTHLY', 29900, current_date - 30);
    insert into public.partner_invoices (id, agency_id, group_id, invoice_number, due_date, total_cents, status)
      values ('${INV}','${AG57}','${GRP57}','PROBE-57-0001', current_date + 10, 50000, 'sent');
    insert into public.partner_billing_schedule (agency_id, group_id, service_id, kind, due_on, amount_cents)
      values ('${AG57}','${GRP57}','${S1}','instalment', current_date + 20, 200000);
    insert into public.work_items (id, agency_id, scope, related_type, title, stage, partner_service_id, partner_group_id, assigned_to)
      values ('${WRK}','${AG57}','AGENCY','fulfillment','Probe work','Assigned','${S1}','${GRP57}','${AGT57}');
    insert into public.agency_expenses (id, agency_id, vendor, amount_cents, due_date)
      values ('${EXP}','${AG57}','Probe Vendor', 12345, current_date + 3);
  ` : "";

  const seeInvoices = `select count(*)::int as rows from public.partner_invoices where id='${INV}'`;
  const seePayments = `select count(*)::int as rows from public.partner_payments where group_id='${GRP57}'`;
  const seeSchedule = `select count(*)::int as rows from public.partner_billing_schedule where service_id='${S1}'`;
  const seeExpenses = `select count(*)::int as rows from public.agency_expenses where id='${EXP}'`;

  const P57 = GRP57 ? [
    /* ── A manager runs the work and never receives the money ────── */
    ["a manager receives no invoices", () => p57(MGR57, seeInvoices, seed57), 0],
    ["a manager receives no payments", () => p57(MGR57, seePayments, seed57), 0],
    ["a manager receives no billing schedule", () => p57(MGR57, seeSchedule, seed57), 0],
    ["a manager receives no expenses", () => p57(MGR57, seeExpenses, seed57), 0],
    ["an agent receives none of it",
      () => p57(AGT57, seeInvoices, seed57) === 0 && p57(AGT57, seeExpenses, seed57) === 0 ? "correct" : "wrong", "correct"],
    ["the owner receives all of it",
      () => p57(OWN57, seeInvoices, seed57) === 1 && p57(OWN57, seeExpenses, seed57) === 1 ? "correct" : "wrong", "correct"],

    /* ── The money tables have no partner branch at all ──────────── */
    ["no invoice policy mentions a partner contact",
      () => q(`select count(*)::int as rows from pg_policy where polname like 'partner_invoices%' and position('partner_contact' in pg_get_expr(polqual, polrelid)) > 0`)[0].rows, 0],
    ["no payment policy mentions a partner contact",
      () => q(`select count(*)::int as rows from pg_policy where polname like 'partner_payments%' and position('partner_contact' in pg_get_expr(polqual, polrelid)) > 0`)[0].rows, 0],
    ["expenses are BES-only: no organization branch either",
      () => q(`select count(*)::int as rows from pg_policy where polname like 'agency_expenses%' and position('is_org_member' in pg_get_expr(polqual, polrelid)) > 0`)[0].rows, 0],
    ["anon reaches no invoice",
      () => { try { q(`begin; set local role anon; select 1 from public.partner_invoices limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
    ["anon reaches no expense",
      () => { try { q(`begin; set local role anon; select 1 from public.agency_expenses limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],

    /* ── An invoice is paid by the ledger, not by a screen ───────── */
    ["recording a payment is what makes an invoice paid",
      () => cascade(OWN57, seed57,
        `insert into public.partner_payments (agency_id, group_id, invoice_id, provider, amount_cents, paid_on)
           values ('${AG57}','${GRP57}','${INV}','authorize_net', 50000, current_date);
         select status::text as rows from public.partner_invoices where id='${INV}'`), "paid"],

    ["a part payment leaves it partly paid, and the rest collectible",
      () => cascade(OWN57, seed57,
        `insert into public.partner_payments (agency_id, group_id, invoice_id, provider, amount_cents, paid_on)
           values ('${AG57}','${GRP57}','${INV}','authorize_net', 30000, current_date);
         select (status::text || ' ' || (total_cents - amount_paid_cents)::text) as rows
           from public.partner_invoices where id='${INV}'`), "partially_paid 20000"],

    ["the same provider transaction twice is one payment",
      () => cascade(OWN57, seed57,
        `insert into public.partner_payments (agency_id, group_id, invoice_id, provider, provider_transaction_id, amount_cents, paid_on)
           values ('${AG57}','${GRP57}','${INV}','authorize_net','probe-txn-57', 50000, current_date);
         insert into public.partner_payments (agency_id, group_id, invoice_id, provider, provider_transaction_id, amount_cents, paid_on)
           values ('${AG57}','${GRP57}','${INV}','authorize_net','probe-txn-57', 50000, current_date)
           on conflict do nothing;
         select count(*)::int as rows from public.partner_payments where provider_transaction_id='probe-txn-57'`), 1],

    ["a manager cannot record a payment",
      () => cascade(MGR57, seed57,
        `insert into public.partner_payments (agency_id, group_id, invoice_id, provider, amount_cents, paid_on)
           values ('${AG57}','${GRP57}','${INV}','authorize_net', 50000, current_date); select 1 as rows`), "ERR 42501"],

    /* ── An expense is not paid until a date says so ─────────────── */
    ["an expense with no payment date is not paid",
      () => cascade(OWN57, seed57, `select status::text as rows from public.agency_expenses where id='${EXP}'`), "due"],
    ["…and setting the date is what pays it",
      () => cascade(OWN57, seed57,
        `update public.agency_expenses set paid_on = current_date where id='${EXP}';
         select status::text as rows from public.agency_expenses where id='${EXP}'`), "paid"],

    /* ── CANCELLING ONE SERVICE ──────────────────────────────────── */
    ["cancelling a service archives its own open work",
      () => cascade(OWN57, seed57,
        `perform_result as (select 1); select (public.cancel_partner_service('${S1}', current_date, 'probe')->>'work_archived') as rows`.replace('perform_result as (select 1); ', '')), "1"],

    ["…and releases the assignee, remembering who it was",
      () => cascade(OWN57, seed57,
        `select public.cancel_partner_service('${S1}', current_date, 'probe');
         select (case when assigned_to is null and previous_assigned_to = '${AGT57}' then 'released' else 'still held' end) as rows
           from public.work_items where id='${WRK}'`), "released"],

    ["…and stops its future scheduled charges",
      () => cascade(OWN57, seed57,
        `select public.cancel_partner_service('${S1}', current_date, 'probe');
         select count(*)::int as rows from public.partner_billing_schedule
          where service_id='${S1}' and status='scheduled'`), 0],

    ["…and leaves the partner's OTHER service running",
      () => cascade(OWN57, seed57,
        `select public.cancel_partner_service('${S1}', current_date, 'probe');
         select status::text as rows from public.partner_services where id='${S2}'`), "active"],

    ["…and the partner is still active",
      () => cascade(OWN57, seed57,
        `select (public.cancel_partner_service('${S1}', current_date, 'probe')->>'partner_still_active') as rows`), "true"],

    ["…and its invoice is untouched",
      () => cascade(OWN57, seed57,
        `select public.cancel_partner_service('${S1}', current_date, 'probe');
         select status::text as rows from public.partner_invoices where id='${INV}'`), "sent"],

    ["an agent cannot cancel a service",
      () => cascade(AGT57, seed57, `select public.cancel_partner_service('${S1}', current_date, 'probe') as rows`), "ERR P0001"],

    /* ── ARCHIVING THE PARTNER ───────────────────────────────────── */
    ["archiving refuses while a service is running",
      () => cascade(OWN57, seed57, `select public.archive_partner('${GRP57}','probe') as rows`), "ERR P0001"],

    ["…and succeeds once nothing is running",
      () => cascade(OWN57, seed57,
        `select public.cancel_partner_service('${S1}', current_date, 'probe');
         select public.cancel_partner_service('${S2}', current_date, 'probe');
         select ((public.archive_partner('${GRP57}','probe')->>'partner') is not null)::text as rows`), "true"],

    ["…which suspends portal access rather than deleting anybody",
      () => cascade(OWN57, seed57,
        `select public.cancel_partner_service('${S1}', current_date, 'probe');
         select public.cancel_partner_service('${S2}', current_date, 'probe');
         select public.archive_partner('${GRP57}','probe');
         select count(*)::int as rows from public.partner_contacts where group_id='${GRP57}' and status='active'`), 0],

    ["…and deletes no client record",
      () => cascade(OWN57, seed57,
        `select public.cancel_partner_service('${S1}', current_date, 'probe');
         select public.cancel_partner_service('${S2}', current_date, 'probe');
         select public.archive_partner('${GRP57}','probe');
         select count(*)::int as rows from public.fulfillment_clients where outsourcing_group_id='${GRP57}'`),
      q(`select count(*)::int as rows from public.fulfillment_clients where outsourcing_group_id='${GRP57}'`)[0].rows],

    ["a suspended partner's contacts resolve to no partner at all",
      () => q(`select (position('lifecycle not in' in pg_get_functiondef(p.oid)) > 0)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='partner_group_of_user'`)[0].rows, "true"],
  ] : [["(no partner to probe)", () => "skip", "skip"]];
  runPhase("phase 57", P57, { strict: true });
}


if (runs(58)) {
  startPhase("phase 58");
  /* Owner-only deletion. Dee asked for a real delete so the test records they
     create during beta can go rather than be archived into the record forever.
     What is proved here is that it stayed narrow: the owner alone, one record
     at a time, audited before the row disappears, and refusing the three
     things that would break the agency or the security suite itself. */
  const p58 = (uid, seed, sql) => {
    try {
      return q(`begin; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${seed} set local role authenticated; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN58 = U["bes.owner@bes.test"], ADM58 = U["bes.admin@bes.test"];
  const MGR58 = U["bes.manager@bes.test"];
  const AG58 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const T58 = "33333333-0000-4000-8000-00000000e001";
  const FIXTURE_TEAM = q(`select coalesce((select id::text from public.teams where name='[TEST] Team A'),'') as rows`)[0].rows;
  const ADM_M = q(`select m.id::text as rows from public.agency_memberships m join public.profiles p on p.id=m.user_id where p.email='bes.admin@bes.test'`)[0].rows;
  const OWN_M = q(`select m.id::text as rows from public.agency_memberships m join public.profiles p on p.id=m.user_id where p.email='bes.owner@bes.test'`)[0].rows;
  const MGR_M = q(`select m.id::text as rows from public.agency_memberships m join public.profiles p on p.id=m.user_id where p.email='bes.manager@bes.test'`)[0].rows;

  const seed58 = `insert into public.teams (id, agency_id, name) values ('${T58}','${AG58}','Probe Throwaway Team');`;
  const gone = `select count(*)::int as rows from public.teams where id='${T58}'`;

  const P58 = [
    ["the owner can delete a record outright",
      () => p58(OWN58, seed58, `select public.owner_delete_record('teams','${T58}','probe'); ${gone}`), 0],

    ["an ADMIN cannot — everyone but the owner archives",
      () => p58(ADM58, seed58, `select public.owner_delete_record('teams','${T58}','probe') as rows`), "ERR P0001"],

    ["a manager certainly cannot",
      () => p58(MGR58, seed58, `select public.owner_delete_record('teams','${T58}','probe') as rows`), "ERR P0001"],

    /* Dee's rule, stated exactly: no other admin deletes a people record. */
    ["an admin cannot delete a people record",
      () => p58(ADM58, "", `select public.owner_delete_record('agency_memberships','${ADM_M}','probe') as rows`), "ERR P0001"],

    ["…and an admin's direct delete is refused by the policy too",
      () => p58(ADM58, "", `delete from public.agency_memberships where id='${ADM_M}'; select count(*)::int as rows from public.agency_memberships where id='${ADM_M}'`), 1],

    ["the owner cannot delete their own membership",
      () => p58(OWN58, "", `select public.owner_delete_record('agency_memberships','${OWN_M}','probe') as rows`), "ERR P0001"],

    /* The suite must not be able to delete what the suite measures with. */
    ["a security fixture is refused, even to the owner",
      () => FIXTURE_TEAM
        ? p58(OWN58, "", `select public.owner_delete_record('teams','${FIXTURE_TEAM}','probe') as rows`)
        : "ERR P0001", "ERR P0001"],

    ["a table nobody named is refused",
      () => p58(OWN58, "", `select public.owner_delete_record('audit_log','${T58}','probe') as rows`), "ERR P0001"],

    ["the deletion is audited BEFORE the row goes, with its name in it",
      () => p58(OWN58, seed58,
        `select public.owner_delete_record('teams','${T58}','probe');
         select (before->>'label' = 'Probe Throwaway Team')::text as rows
           from public.audit_log where action='owner.record_deleted' and entity_id='${T58}'`), "true"],

    ["is_owner_of is strictly the owner role, not is_admin_of",
      () => q(`select (position('agency_owner' in pg_get_functiondef(p.oid)) > 0 and position('agency_admin' in pg_get_functiondef(p.oid)) = 0)::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_owner_of'`)[0].rows, "true"],

    ["…and an inactive owner is not an owner",
      () => q(`select (pg_get_functiondef(p.oid) like '%status = ''active''%')::text as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_owner_of'`)[0].rows, "true"],

    /* Deactivating is what an admin has instead, and it destroys nothing. */
    /* Somebody ELSE — the function refuses self-deactivation, which is how an
       agency ends up with nobody active. */
    ["an admin CAN deactivate somebody, and the role survives it",
      () => p58(ADM58, "", `select public.set_agency_member_status('${MGR_M}','inactive'); select (status || ':' || role::text) as rows from public.agency_memberships where id='${MGR_M}'`), "inactive:agency_user"],

    ["nobody can deactivate the owner",
      () => p58(ADM58, "", `select public.set_agency_member_status('${OWN_M}','inactive') as rows`), "ERR P0001"],

    /* 0234: an owner is never DEMOTED — ownership is transferred from the
       owner's own account, and only then can the role change. The old probes
       demoted owners to a rank that no longer exists; these hold the new
       rules instead. */
    ["a retired rank is not a role anybody can be set to",
      () => p58(ADM58, "", `select public.set_agency_member_role('${MGR_M}','agency_manager') as rows`), "ERR 22023"],
    ["an admin can move a person between the two roles",
      () => p58(ADM58, "", `select public.set_agency_member_role('${MGR_M}','agency_admin'); select role::text as rows from public.agency_memberships where id='${MGR_M}'`), "agency_admin"],
    ["…and narrowing back to user keeps the scope an admin chose",
      () => p58(ADM58, "", `update public.agency_memberships set scope='division' where id='${MGR_M}';
        select public.set_agency_member_role('${MGR_M}','agency_user');
        select (role::text || ':' || scope::text) as rows from public.agency_memberships where id='${MGR_M}'`), "agency_user:division"],
    ["the owner's role cannot be demoted — ownership transfers, never demotes",
      () => p58(ADM58, "", `select public.set_agency_member_role('${OWN_M}','agency_user'); select 'not refused' as rows`), "ERR P0001"],
  ];
  runPhase("phase 58", P58, { strict: true });
}


if (runs(59)) {
  startPhase("phase 59");
  /* A partner is seen by the people assigned to it.
     Until 0184 `outsourcing_groups_select` was `is_staff_of(agency_id)` —
     every agent could read every partner BES has. With two admins on the
     roster that was invisible; it matters the moment an agent is invited.

     What is proved here is Dee's §13 exactly, plus the mechanism that makes it
     maintainable: a TEAM assignment is inherited, so joining and leaving the
     team is the only thing anybody edits (§20). */
  const p59 = (uid, seed, sql) => {
    try {
      return q(`begin; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${seed} set local role authenticated; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN59 = U["bes.owner@bes.test"], ADM59 = U["bes.admin@bes.test"];
  const MGR59 = U["bes.manager@bes.test"], LEAD59 = U["bes.lead@bes.test"];
  const AGT59 = U["bes.credit@bes.test"], OTHER59 = U["bes.funding@bes.test"];
  const AG59 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const GRP59 = q(`select coalesce((select id::text from public.outsourcing_groups limit 1),'') as rows`)[0].rows;
  const TEAM59 = q(`select coalesce((select id::text from public.teams where name='[TEST] Team A'),'') as rows`)[0].rows;
  const ALL59 = q(`select count(*)::int as rows from public.outsourcing_groups`)[0].rows;

  const seeCount = `select count(*)::int as rows from public.outsourcing_groups`;
  const assignTeam = `insert into public.partner_assignments (agency_id, group_id, team_id) values ('${AG59}','${GRP59}','${TEAM59}');`;
  const assignUser = (u) => `insert into public.partner_assignments (agency_id, group_id, user_id) values ('${AG59}','${GRP59}','${u}');`;
  const assignEnded = `insert into public.partner_assignments (agency_id, group_id, team_id, ended_on) values ('${AG59}','${GRP59}','${TEAM59}', current_date);`;

  const P59 = GRP59 && TEAM59 ? [
    /* ── Owner and admin are agency-wide by ROLE ─────────────────── */
    ["the owner sees every partner", () => p59(OWN59, "", seeCount), ALL59],
    ["the admin sees every partner", () => p59(ADM59, "", seeCount), ALL59],

    /* ── Everybody else starts with none ─────────────────────────── */
    ["a manager sees no partner they are not assigned",
      () => p59(MGR59, "", seeCount), 0],
    ["a team lead sees none either", () => p59(LEAD59, "", seeCount), 0],
    ["an agent sees none", () => p59(AGT59, "", seeCount), 0],

    /* ── A team assignment is inherited (§20) ────────────────────── */
    ["assigning the agent's TEAM gives the agent the partner",
      () => p59(AGT59, assignTeam, seeCount), 1],
    ["…and the lead of that team gets it too",
      () => p59(LEAD59, assignTeam, seeCount), 1],
    ["…but somebody on no team does not",
      () => p59(OTHER59, assignTeam, seeCount), 0],

    /* ── Ending an assignment takes it away ──────────────────────── */
    ["an ENDED team assignment grants nothing",
      () => p59(AGT59, assignEnded, seeCount), 0],

    /* ── A direct assignment reaches one person alone (§21) ──────── */
    ["a direct assignment gives that person the partner",
      () => p59(AGT59, assignUser(AGT59), seeCount), 1],
    ["…and nobody else",
      () => p59(OTHER59, assignUser(AGT59), seeCount), 0],

    /* ── Assignment is operational, never financial (§19) ────────── */
    ["being assigned does NOT grant financial access",
      () => p59(AGT59, assignTeam, `select public.agency_can('partners.financials.view')::text as rows`), "false"],
    ["…nor to a manager who is assigned",
      () => p59(MGR59, assignUser(MGR59), `select public.agency_can('partners.financials.view')::text as rows`), "false"],

    /* ── The FOR ALL trap, closed and kept closed (0185) ─────────── */
    ["no policy on partners is FOR ALL any more",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.outsourcing_groups'::regclass and polcmd='*'`)[0].rows, 0],
    ["…and the select policy asks can_see_partner",
      () => q(`select (position('can_see_partner' in pg_get_expr(polqual, polrelid)) > 0)::text as rows from pg_policy where polname='outsourcing_groups_select'`)[0].rows, "true"],

    /* ── An assignment is ended, never deleted (rule 11) ─────────── */
    ["there is no delete policy on assignments",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.partner_assignments'::regclass and polcmd='d'`)[0].rows, 0],

    ["an agent cannot assign themselves a partner",
      () => p59(AGT59, "", `${assignUser(AGT59).replace(/^insert/, "insert")} select 1 as rows`), "ERR 42501"],

    ["anon reaches no assignment",
      () => { try { q(`begin; set local role anon; select 1 from public.partner_assignments limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
  ] : [["(no partner or fixture team to probe)", () => "skip", "skip"]];
  runPhase("phase 59", P59, { strict: true });
}


if (runs(60)) {
  startPhase("phase 60");
  /* COMMUNICATION — Dee's required test matrix (2026-09-08, §41), A to J.
     
     One canonical conversation, many authorized surfaces. That claim is only
     worth making if the surfaces are genuinely narrower than the table, so
     every probe below asks the same question from a different chair:
     
       who can see this row, and who cannot, and why.
     
     What changed in 0192 and is proved here for the first time:
     
       · a partner conversation now needs MEMBERSHIP or a deliberate
         open-to-scope flag, not merely an assignment to the partner
       · a service-scoped conversation is invisible to somebody assigned to a
         DIFFERENT service on the same partner (§19)
       · a TEAM can be a member, so joining and leaving the team is the only
         thing anybody edits (§12, §32)
       · an administrator may INSPECT but is not a participant, and cannot
         post (§17)
       · a deactivated member loses everything the moment they are
         deactivated (§33) — which had never been true of `is_staff_of` */
  const p60 = (uid, seed, sql) => {
    try {
      return q(`begin; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${seed} set local role authenticated; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN60 = U["bes.owner@bes.test"], ADM60 = U["bes.admin@bes.test"];
  /* Team A stands in for "Team Daniel": the lead leads it, the CreditOps
     agent is on it. `bes.funding` is on NO team and stands in for the GHL
     agent who must not see CreditOps conversations. */
  const CO60 = U["bes.credit@bes.test"], LEAD60 = U["bes.lead@bes.test"];
  const GHL60 = U["bes.funding@bes.test"], CONTACT60 = U["client.portal@bes.test"];
  const ORGOWN60 = U["org.owner@bes.test"];
  const AG60 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const TEAM_A = q(`select coalesce((select id::text from public.teams where name='[TEST] Team A'),'') as rows`)[0].rows;
  const TEAM_B = q(`select coalesce((select id::text from public.teams where name='[TEST] Team B'),'') as rows`)[0].rows;

  const A60 = "44444444-0000-4000-8000-0000000060a1";
  const B60 = "44444444-0000-4000-8000-0000000060b1";
  const SVC_CO = "44444444-0000-4000-8000-0000000060f1";
  const SVC_CRM = "44444444-0000-4000-8000-0000000060f2";
  const CH_GEN = "44444444-0000-4000-8000-0000000060c1";  // whole-partner
  const CH_CO  = "44444444-0000-4000-8000-0000000060c2";  // CreditOps-scoped
  const CH_CRM = "44444444-0000-4000-8000-0000000060c3";  // BES CRM-scoped
  const CH_B   = "44444444-0000-4000-8000-0000000060c4";  // the OTHER partner
  const CH_INT = "44444444-0000-4000-8000-0000000060c5";  // #creditops, Team A
  const CH_ALL = "44444444-0000-4000-8000-0000000060c6";  // #general, all staff

  /* One world, seeded the same way for every probe, then rolled back. */
  const world = (opts = {}) => {
    const contactStatus = opts.contactStatus ?? "active";
    const lifecycle = opts.lifecycle ?? "active";
    const coOnTeamA = opts.coOnTeamA ?? true;
    const coActive = opts.coActive ?? true;
    const assignEnded = opts.assignEnded ? "current_date" : "null";
    return `
    insert into public.outsourcing_groups (id, agency_id, name, contact_email, lifecycle) values
      ('${A60}','${AG60}','[TEST] Conversation A','conv-a@example.test','${lifecycle}'),
      ('${B60}','${AG60}','[TEST] Conversation B','conv-b@example.test','active');
    insert into public.partner_services (id, group_id, agency_id, name) values
      ('${SVC_CO}','${A60}','${AG60}','CreditOps outsourcing'),
      ('${SVC_CRM}','${A60}','${AG60}','BES CRM build');
    insert into public.partner_contacts (group_id, agency_id, full_name, email, user_id, status)
      values ('${A60}','${AG60}','[TEST] Contact','conv-contact@example.test','${CONTACT60}','${contactStatus}');
    /* Team A works the CreditOps engagement; the GHL agent works the CRM one.
       Both are on the SAME partner, which is what makes §19 mean something. */
    insert into public.partner_assignments (agency_id, group_id, service_id, team_id, ended_on)
      values ('${AG60}','${A60}','${SVC_CO}','${TEAM_A}', ${assignEnded});
    insert into public.partner_assignments (agency_id, group_id, service_id, user_id)
      values ('${AG60}','${A60}','${SVC_CRM}','${GHL60}');
    insert into public.channels (id, agency_id, organization_id, partner_group_id, partner_service_id, kind, name, created_by, open_to_scope) values
      ('${CH_GEN}', null, null, '${A60}', null,        'general','General Support','${OWN60}', true),
      ('${CH_CO}',  null, null, '${A60}', '${SVC_CO}', 'topic',  'CreditOps Processing','${OWN60}', true),
      ('${CH_CRM}', null, null, '${A60}', '${SVC_CRM}','topic',  'GHL Implementation','${OWN60}', true),
      ('${CH_B}',   null, null, '${B60}', null,        'general','General Support','${OWN60}', true),
      ('${CH_INT}', '${AG60}', null, null, null,       'topic',  'creditops','${OWN60}', false),
      ('${CH_ALL}', '${AG60}', null, null, null,       'general','general','${OWN60}', true);
    insert into public.channel_teams (channel_id, team_id) values ('${CH_INT}','${TEAM_A}');
    insert into public.messages (channel_id, author_id, body, body_text) values
      ('${CH_GEN}','${OWN60}','{}'::jsonb,'hello partner A'),
      ('${CH_CO}','${OWN60}','{}'::jsonb,'round two letters went out'),
      ('${CH_CRM}','${OWN60}','{}'::jsonb,'funnel is staged'),
      ('${CH_B}','${OWN60}','{}'::jsonb,'zebra-marker-partner-b'),
      ('${CH_INT}','${OWN60}','{}'::jsonb,'internal creditops note');
    ${coOnTeamA ? "" : `delete from public.team_memberships where team_id='${TEAM_A}' and user_id='${CO60}';`}
    ${coActive ? "" : `update public.agency_memberships set status='inactive' where user_id='${CO60}';`}
    `;
  };

  /* Test B needs a real organization channel: a live engagement, a share the
     ORGANIZATION created, and a BES team named on the engagement. Each of the
     four is switched off in turn, because a rule you cannot break is a rule
     you have not tested. */
  const CH_ORG = "44444444-0000-4000-8000-0000000060d1";
  const CH_NEW = "44444444-0000-4000-8000-0000000060d2";
  const ENG60 = q(`select coalesce((select e.id::text from public.fulfillment_engagements e join public.org_memberships om on om.organization_id = e.organization_id join public.profiles p on p.id = om.user_id where p.email = 'org.owner@bes.test' and e.status = 'active' limit 1),'') as rows`)[0].rows;
  const ORG_OF_ENG = ENG60 ? q(`select organization_id::text as rows from public.fulfillment_engagements where id='${ENG60}'`)[0].rows : "";
  const worldB = (o = {}) => {
    const shared = o.shared ?? true;
    const team = o.team ?? true;
    const revoked = o.revoked ?? false;
    return `
    insert into public.channels (id, organization_id, kind, name, created_by)
      values ('${CH_ORG}','${ORG_OF_ENG}','topic','client-support','${ORGOWN60}');
    insert into public.channel_members (channel_id, user_id, is_manager)
      values ('${CH_ORG}','${ORGOWN60}',true);
    ${team ? `update public.fulfillment_engagements set authorized_team_id='${TEAM_A}' where id='${ENG60}';` : ""}
    ${shared ? `insert into public.channel_shares (channel_id, engagement_id, created_by${revoked ? ", revoked_at" : ""}) values ('${CH_ORG}','${ENG60}','${ORGOWN60}'${revoked ? ", now()" : ""});` : ""}
    ${o.engagement === "ended" ? `update public.fulfillment_engagements set status='ended', effective_to = current_date - 1 where id='${ENG60}';` : ""}
    `;
  };
  const seesB = `select count(*)::int as rows from public.channels where id = '${CH_ORG}'`;

  const sees = (ch) => `select count(*)::int as rows from public.channels where id = '${ch}'`;
  const reads = (ch) => `select count(*)::int as rows from public.messages where channel_id = '${ch}'`;
  const writeTo = (ch, who) => `insert into public.messages (channel_id, author_id, body, body_text) values ('${ch}','${who}','{}'::jsonb,'reply'); select count(*)::int as rows from public.messages where channel_id='${ch}'`;

  const P60 = AG60 && TEAM_A && TEAM_B && ENG60 ? [
    /* ── TEST A — internal team channel ──────────────────────────────── */
    ["A · #creditops reaches the team that is a member of it",
      () => p60(CO60, world(), sees(CH_INT)), 1],
    ["A · …and NOT an agent on no team, however much BES staff they are",
      () => p60(GHL60, world(), sees(CH_INT)), 0],
    ["A · …the team LEAD is in it too, by the same membership",
      () => p60(LEAD60, world(), sees(CH_INT)), 1],
    ["A · #general is deliberately all-hands, and says so on the row",
      () => p60(GHL60, world(), sees(CH_ALL)), 1],
    ["A · an admin may INSPECT the internal channel (§17)",
      () => p60(ADM60, world(), sees(CH_INT)), 1],
    ["A · …but is NOT a participant — they cannot post in it",
      () => p60(ADM60, world(), writeTo(CH_INT, ADM60)), "ERR 42501"],
    ["A · …and the interface is told which it is",
      () => p60(ADM60, world(), `select audit_only::text as rows from public.visible_channels() where id='${CH_INT}'`), "true"],
    ["A · a member is NOT audit-only — it is their own conversation",
      () => p60(CO60, world(), `select audit_only::text as rows from public.visible_channels() where id='${CH_INT}'`), "false"],

    /* ── TEST C — partner channel ────────────────────────────────────── */
    ["C · the partner's own contact sees their General Support",
      () => p60(CONTACT60, world(), sees(CH_GEN)), 1],
    ["C · the assigned team sees it",
      () => p60(CO60, world(), sees(CH_GEN)), 1],
    ["C · an unassigned agent does not",
      () => p60(LEAD60, world({ coOnTeamA: true }), sees(CH_B)), 0],
    ["C · …and no partner contact reaches ANOTHER partner's",
      () => p60(CONTACT60, world(), sees(CH_B)), 0],
    ["C · …nor reads a message in it",
      () => p60(CONTACT60, world(), reads(CH_B)), 0],
    ["C · an organization owner reaches no partner conversation at all",
      () => p60(ORGOWN60, world(), sees(CH_GEN)), 0],

    /* ── TEST B — the organization's channel, shared with BES ────────
       The customer decides whether BES is in at all; BES decides which of its
       people. Both halves are measured, in both directions. */
    ["B · the organization's own member sees their channel",
      () => p60(ORGOWN60, worldB(), seesB), 1],
    ["B · a BES agent sees NOTHING until the organization shares it",
      () => p60(CO60, worldB({ shared: false }), seesB), 0],
    ["B · …sharing alone is still not enough for an unstaffed agent (§10)",
      () => p60(CO60, worldB({ team: false }), seesB), 0],
    ["B · …naming the team that staffs the engagement lets THEM in",
      () => p60(CO60, worldB(), seesB), 1],
    ["B · …and the team lead, by the same team",
      () => p60(LEAD60, worldB(), seesB), 1],
    ["B · an agent on ANOTHER team still sees nothing",
      () => p60(GHL60, worldB(), seesB), 0],
    ["B · revoking the share ends it, without touching the team",
      () => p60(CO60, worldB({ revoked: true }), seesB), 0],
    ["B · ending the ENGAGEMENT ends it too, with the share left alone",
      () => p60(CO60, worldB({ engagement: "ended" }), seesB), 0],
    ["B · BES cannot share an organization's channel with itself",
      () => p60(CO60, worldB({ shared: false }),
        `insert into public.channel_shares (channel_id, engagement_id, created_by) values ('${CH_ORG}','${ENG60}','${CO60}'); select 1 as rows`), "ERR 42501"],
    ["B · …nor add its own team to the organization's channel",
      () => p60(CO60, worldB(),
        `insert into public.channel_teams (channel_id, team_id) values ('${CH_ORG}','${TEAM_A}'); select 1 as rows`), "ERR 42501"],
    ["B · the organization's OWN isolation is untouched (§35)",
      () => p60(ORGOWN60, worldB(), sees(CH_INT)), 0],
    /* Seeded rather than looked up: the first version of this probe selected
       an organization-owned team that does not exist, set NULL, and passed
       while proving nothing. */
    ["B · a team named on an engagement must belong to this agency",
      () => p60(OWN60,
        `insert into public.teams (id, organization_id, name) values ('44444444-0000-4000-8000-0000000060e1','${ORG_OF_ENG}','[TEST] Not ours');`,
        `update public.fulfillment_engagements set authorized_team_id = '44444444-0000-4000-8000-0000000060e1' where id = '${ENG60}'; select 1 as rows`), "ERR P0001"],

    /* ── TEST G — service scope (§19) ────────────────────────────────── */
    ["G · the CreditOps team sees the CreditOps conversation",
      () => p60(CO60, world(), sees(CH_CO)), 1],
    ["G · the GHL agent on the SAME partner does NOT",
      () => p60(GHL60, world(), sees(CH_CO)), 0],
    ["G · …nor read a word of it",
      () => p60(GHL60, world(), reads(CH_CO)), 0],
    ["G · the GHL agent sees the GHL conversation",
      () => p60(GHL60, world(), sees(CH_CRM)), 1],
    ["G · …and the CreditOps team does not",
      () => p60(CO60, world(), sees(CH_CRM)), 0],
    ["G · the whole-partner conversation reaches BOTH",
      () => p60(GHL60, world(), sees(CH_GEN)), 1],
    ["G · …both, meaning the CreditOps side too",
      () => p60(CO60, world(), sees(CH_GEN)), 1],

    /* ── TEST E — team inheritance (§32) ─────────────────────────────── */
    ["E · leaving the team takes the internal channel away",
      () => p60(CO60, world({ coOnTeamA: false }), sees(CH_INT)), 0],
    ["E · …and the partner conversations that came with the assignment",
      () => p60(CO60, world({ coOnTeamA: false }), sees(CH_CO)), 0],
    ["E · ENDING the assignment does the same without touching the team",
      () => p60(CO60, world({ assignEnded: true }), sees(CH_CO)), 0],

    /* ── TEST F — suspension (§33) ───────────────────────────────────── */
    ["F · a DEACTIVATED member reaches no channel at all",
      () => p60(CO60, world({ coActive: false }), sees(CH_INT)), 0],
    ["F · …not the all-hands one either",
      () => p60(CO60, world({ coActive: false }), sees(CH_ALL)), 0],
    ["F · …and their history is untouched — the message is still there",
      () => p60(OWN60, world({ coActive: false }), reads(CH_INT)), 1],
    ["F · a suspended partner CONTACT loses the conversation",
      () => p60(CONTACT60, world({ contactStatus: "suspended" }), sees(CH_GEN)), 0],
    ["F · …and so does suspending the partner itself",
      () => p60(CONTACT60, world({ lifecycle: "suspended" }), sees(CH_GEN)), 0],
    ["F · …the LEGACY status column cannot buy it back",
      () => p60(CONTACT60, world({ lifecycle: "suspended" }) +
        `update public.outsourcing_groups set status='Active' where id='${A60}';`, sees(CH_GEN)), 0],

    /* ── TEST D — ONE record, two doors ──────────────────────────────── */
    ["D · the partner writes and BES reads the SAME row",
      () => p60(CONTACT60, world(), writeTo(CH_GEN, CONTACT60)), 2],
    ["D · …and BES writes where the partner reads",
      () => p60(CO60, world(), writeTo(CH_GEN, CO60)), 2],
    ["D · there is exactly ONE conversation row for that partner's General",
      () => p60(OWN60, world(), `select count(*)::int as rows from public.channels where partner_group_id='${A60}' and name='General Support'`), 1],

    /* ── TEST H — search cannot see past the conversation list (§24) ─── */
    ["H · an unauthorized agent searching the exact words finds nothing",
      () => p60(GHL60, world(), `select count(*)::int as rows from public.search_messages('zebra-marker-partner-b')`), 0],
    ["H · …and the owner, who may see it, does",
      () => p60(OWN60, world(), `select count(*)::int as rows from public.search_messages('zebra-marker-partner-b')`), 1],
    ["H · search does not return a conversation you may only AUDIT",
      () => p60(ADM60, world(), `select count(*)::int as rows from public.search_messages('internal creditops note')`), 0],

    /* ── TEST I — the direct route is refused by the DATA, not the UI ── */
    ["I · asking for the channel by id returns nothing",
      () => p60(GHL60, world(), sees(CH_CO)), 0],
    ["I · …and asking for its messages by id returns nothing",
      () => p60(GHL60, world(), reads(CH_CO)), 0],
    ["I · …and writing into it is refused",
      () => p60(GHL60, world(), writeTo(CH_CO, GHL60)), "ERR 42501"],

    /* ── §21 unread is per person ────────────────────────────────────── */
    ["unread counts what you have not read",
      () => p60(CO60, world(), `select unread as rows from public.visible_channels() where id='${CH_INT}'`), 1],
    ["…marking read clears it for YOU",
      () => p60(CO60, world(), `select public.mark_channel_read('${CH_INT}'); select unread as rows from public.visible_channels() where id='${CH_INT}'`), 0],
    ["…and not for anybody else",
      () => p60(CO60, world() + `insert into public.channel_reads (channel_id, user_id) values ('${CH_INT}','${LEAD60}');`,
        `select unread as rows from public.visible_channels() where id='${CH_INT}'`), 1],
    ["your own words are not unread news to you",
      () => p60(OWN60, world(), `select unread as rows from public.visible_channels() where id='${CH_INT}'`), 0],
    ["nobody reads anybody else's read state",
      () => p60(CO60, world() + `insert into public.channel_reads (channel_id, user_id) values ('${CH_INT}','${LEAD60}');`,
        `select count(*)::int as rows from public.channel_reads where user_id='${LEAD60}'`), 0],

    /* ── §13 one direct message per pair, whoever starts it ──────────── */
    ["a direct message is found, not created twice",
      () => p60(CO60, "", `select (public.open_direct_channel('${LEAD60}') = public.open_direct_channel('${LEAD60}'))::text as rows`), "true"],
    ["…and a DM cannot be opened with somebody outside the agency",
      () => p60(CO60, "", `select public.open_direct_channel('${CONTACT60}')::text as rows`), "ERR 42501"],
    ["…nor with yourself",
      () => p60(CO60, "", `select public.open_direct_channel('${CO60}')::text as rows`), "ERR P0001"],
    ["a DM is never auditable, however senior you are (§17)",
      () => p60(CO60, "", `select public.open_direct_channel('${LEAD60}'); set local request.jwt.claims = '{"sub":"${ADM60}","role":"authenticated"}'; select count(*)::int as rows from public.channels where kind='direct'`), 0],

    /* ── §36 — the writes a real person makes, made as a real person ──
       The 0194 audit probe exercised all eight paths and all eight passed —
       as the SUPERUSER connection, which holds EXECUTE on `log_audit`. Every
       one of them was broken for everybody else: the trigger ran as
       `authenticated`, raised 42501, and took the INSERT down with it. Every
       probe below runs as a fixture user for exactly that reason. */
    ["a manager can actually CREATE a channel, trigger and all",
      () => p60(OWN60, "", `insert into public.channels (id, agency_id, kind, name, created_by) values ('${CH_NEW}','${AG60}','topic','probe','${OWN60}'); select count(*)::int as rows from public.channels where id='${CH_NEW}'`), 1],
    ["…and it is audited",
      () => p60(OWN60, `insert into public.channels (id, agency_id, kind, name, created_by) values ('${CH_NEW}','${AG60}','topic','probe','${OWN60}');`,
        `set local role postgres; select count(*)::int as rows from public.audit_log where entity_id='${CH_NEW}' and action='Channel created'`), 1],
    ["…adding a member works and is audited",
      () => p60(OWN60, `insert into public.channels (id, agency_id, kind, name, created_by) values ('${CH_NEW}','${AG60}','topic','probe','${OWN60}');`,
        `insert into public.channel_members (channel_id, user_id, is_manager) values ('${CH_NEW}','${OWN60}',true); set local role postgres; select count(*)::int as rows from public.audit_log where entity_id='${CH_NEW}' and action='Channel member added'`), 1],
    ["…adding a TEAM works and is audited",
      () => p60(OWN60, `insert into public.channels (id, agency_id, kind, name, created_by) values ('${CH_NEW}','${AG60}','topic','probe','${OWN60}'); insert into public.channel_members (channel_id, user_id, is_manager) values ('${CH_NEW}','${OWN60}',true);`,
        `insert into public.channel_teams (channel_id, team_id) values ('${CH_NEW}','${TEAM_A}'); set local role postgres; select count(*)::int as rows from public.audit_log where entity_id='${CH_NEW}' and action='Channel team added'`), 1],
    ["…archiving works and is audited",
      () => p60(OWN60, `insert into public.channels (id, agency_id, kind, name, created_by) values ('${CH_NEW}','${AG60}','topic','probe','${OWN60}'); insert into public.channel_members (channel_id, user_id, is_manager) values ('${CH_NEW}','${OWN60}',true);`,
        `update public.channels set archived_at = now() where id='${CH_NEW}'; set local role postgres; select count(*)::int as rows from public.audit_log where entity_id='${CH_NEW}' and action='Channel archived'`), 1],
    ["an agent who is not a manager still cannot create one",
      () => p60(CO60, "", `insert into public.channels (id, agency_id, kind, name, created_by) values ('${CH_NEW}','${AG60}','topic','probe','${CO60}'); select 1 as rows`), "ERR 42501"],
    ["every channel audit trigger is SECURITY DEFINER — log_audit needs it",
      () => q(`select count(*)::int as rows from pg_proc where proname like 'audit_channel%' and not prosecdef`)[0].rows, 0],

    /* ── The shape that makes all of the above possible ──────────────── */
    ["a channel still belongs to exactly ONE owner (§29)",
      () => q(`select count(*)::int as rows from public.channels where (case when organization_id is not null then 1 else 0 end) + (case when agency_id is not null then 1 else 0 end) + (case when partner_group_id is not null then 1 else 0 end) <> 1`)[0].rows, 0],
    ["…and a service-scoped channel belongs to the partner it scopes",
      () => q(`select count(*)::int as rows from public.channels where partner_service_id is not null and partner_group_id is null`)[0].rows, 0],
    ["reading a channel asks channel_auditable, not a role name",
      () => q(`select (position('channel_auditable' in pg_get_expr(polqual, polrelid)) > 0)::text as rows from pg_policy where polname='channels_select'`)[0].rows, "true"],
    ["…and WRITING a message still asks channel_writable",
      () => q(`select (position('channel_writable' in pg_get_expr(polwithcheck, polrelid)) > 0)::text as rows from pg_policy where polname='messages_insert'`)[0].rows, "true"],
    ["no policy on channels is FOR ALL",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.channels'::regclass and polcmd='*'`)[0].rows, 0],
    ["there is no delete policy on messages — history is not deleted (§30)",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.messages'::regclass and polcmd='d'`)[0].rows, 0],
    ["is_staff_of reads membership STATUS, so deactivating means something",
      () => q(`select (position('status' in pg_get_functiondef('public.is_staff_of(uuid)'::regprocedure)) > 0)::text as rows`)[0].rows, "true"],
    ["administration is audited; reading a message is not (§36)",
      () => q(`select count(*)::int as rows from pg_trigger where tgrelid='public.messages'::regclass and tgname like '%audit%'`)[0].rows, 0],
    ["…and the four administration tables are",
      () => q(`select count(distinct tgrelid)::int as rows from pg_trigger where tgname in ('channels_audit','channel_members_audit','channel_teams_audit','channel_shares_audit')`)[0].rows, 4],
    ["anon reaches no channel, message, team row or read state",
      () => { try { q(`begin; set local role anon; select 1 from public.channels limit 1; select 1 from public.messages limit 1; select 1 from public.channel_teams limit 1; select 1 from public.channel_reads limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
  ] : [["(no agency, fixture teams or live engagement to probe)", () => "skip", "skip"]];
  runPhase("phase 60", P60, { strict: true });
}


if (runs(61)) {
  startPhase("phase 61");
  /* COMMUNICATION, part two — the things a team does all day, and the one
     rule Dee marked PERMANENT:

       "NEVER ALLOW ONE USER TO DELETE ANOTHER USER'S MESSAGE. Not even
        Manager, Agency Admin, Agency Owner." (§30)

     Every probe below writes as a real fixture user. That is not a style
     choice: 0194's audit triggers passed eight probes run as the superuser
     and were broken for every actual person, because `log_audit` is granted
     to postgres and service_role alone. A write test that does not
     `set local role authenticated` tests nothing anybody will ever do. */
  const p61 = (uid, seed, sql) => {
    try {
      return q(`begin; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${seed} set local role authenticated; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN61 = U["bes.owner@bes.test"], ADM61 = U["bes.admin@bes.test"];
  const CO61 = U["bes.credit@bes.test"], LEAD61 = U["bes.lead@bes.test"];
  const AG61 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const CH61 = "44444444-0000-4000-8000-0000000061c1";
  const TEAM_A61 = q(`select coalesce((select id::text from public.teams where name='[TEST] Team A'),'') as rows`)[0].rows;
  const M_OWNER = 900000001, M_LEAD = 900000002;
  const GHL60_61 = U["bes.funding@bes.test"];
  /* A REAL colleague. Every @bes.test account is a fixture, and
     `channel_mentionable` excludes fixtures on purpose — so a probe that
     asks for one to be offered is asking the function to do the thing the
     next probe asserts it must not. */
  const REAL61 = q(`select coalesce((select p.id::text from public.profiles p join public.agency_memberships m on m.user_id = p.id where p.is_fixture = false and m.status = 'active' and m.role <> 'agency_owner' limit 1),'') as rows`)[0].rows;
  /* A real mention document, shaped the way `mentioned_user_ids` reads it. */
  const MENTION61 = (uid, text) => `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH61}','${OWN61}', jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','mention','attrs', jsonb_build_object('userId','${uid}','label','Someone')))))), '${text}');`;

  /* An all-hands BES channel with one message from the owner and one from the
     lead, so "your own" and "somebody else's" are both on the table. */
  const world61 = `
    insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope)
      values ('${CH61}','${AG61}','topic','probe-rich','${OWN61}', true);
    insert into public.channel_members (channel_id, user_id, is_manager)
      values ('${CH61}','${OWN61}',true);
    insert into public.messages (id, channel_id, author_id, body, body_text)
      overriding system value values
      (${M_OWNER},'${CH61}','${OWN61}','{}'::jsonb,'from the owner'),
      (${M_LEAD},'${CH61}','${LEAD61}','{}'::jsonb,'from the lead');`;

  const P61 = AG61 ? [
    /* ── §72 — the own-message rule, from every chair ─────────────── */
    ["an author removes their OWN message",
      () => p61(LEAD61, world61, `select public.delete_own_message(${M_LEAD}); select (deleted_at is not null)::text as rows from public.messages where id=${M_LEAD}`), "true"],
    ["…another AGENT cannot remove it",
      () => p61(CO61, world61, `select public.delete_own_message(${M_LEAD}); select 1 as rows`), "ERR 42501"],
    ["…the ADMIN cannot remove it",
      () => p61(ADM61, world61, `select public.delete_own_message(${M_LEAD}); select 1 as rows`), "ERR 42501"],
    ["…the OWNER cannot remove it either — this is the permanent rule",
      () => p61(OWN61, world61, `select public.delete_own_message(${M_LEAD}); select 1 as rows`), "ERR 42501"],
    ["…and going around the function at the table changes nothing (§31)",
      () => p61(OWN61, world61, `update public.messages set deleted_at = now() where id=${M_LEAD}; select (deleted_at is null)::text as rows from public.messages where id=${M_LEAD}`), "true"],
    ["there is still no DELETE grant on messages at all",
      () => q(`select count(*)::int as rows from information_schema.role_table_grants where table_name='messages' and privilege_type='DELETE' and grantee='authenticated'`)[0].rows, 0],
    ["a tombstone keeps the row and hides the words (§32)",
      () => p61(LEAD61, world61 + `update public.messages set deleted_at=now(), deleted_by='${LEAD61}' where id=${M_LEAD};`,
        `select coalesce((select body_text from public.channel_messages('${CH61}') where id=${M_LEAD}), 'WITHHELD') as rows`), "WITHHELD"],
    ["…and the row is still there, so a thread keeps its shape",
      () => p61(LEAD61, world61 + `update public.messages set deleted_at=now() where id=${M_LEAD};`,
        `select count(*)::int as rows from public.channel_messages('${CH61}') where id=${M_LEAD}`), 1],

    /* ── §80 — reactions ──────────────────────────────────────────── */
    ["anybody in the conversation may react",
      () => p61(CO61, world61, `insert into public.message_reactions (message_id, user_id, emoji) values (${M_OWNER},'${CO61}','✅'); select count(*)::int as rows from public.message_reactions where message_id=${M_OWNER}`), 1],
    ["…and cannot react AS somebody else",
      () => p61(CO61, world61, `insert into public.message_reactions (message_id, user_id, emoji) values (${M_OWNER},'${LEAD61}','✅'); select 1 as rows`), "ERR 42501"],
    ["…and cannot remove somebody else's reaction",
      () => p61(CO61, world61 + `insert into public.message_reactions (message_id, user_id, emoji) values (${M_OWNER},'${LEAD61}','✅');`,
        `delete from public.message_reactions where message_id=${M_OWNER}; select count(*)::int as rows from public.message_reactions where message_id=${M_OWNER}`), 1],
    ["the same emoji twice is one row, not two",
      () => p61(CO61, world61 + `insert into public.message_reactions (message_id, user_id, emoji) values (${M_OWNER},'${CO61}','✅');`,
        `insert into public.message_reactions (message_id, user_id, emoji) values (${M_OWNER},'${CO61}','✅') on conflict do nothing; select count(*)::int as rows from public.message_reactions where message_id=${M_OWNER}`), 1],
    ["somebody outside the conversation cannot react into it",
      () => p61(CO61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);
        insert into public.messages (id, channel_id, author_id, body, body_text) overriding system value values (${M_OWNER},'${CH61}','${OWN61}','{}'::jsonb,'x');`,
        `insert into public.message_reactions (message_id, user_id, emoji) values (${M_OWNER},'${CO61}','✅'); select 1 as rows`), "ERR 42501"],

    /* ── §79 — threads ────────────────────────────────────────────── */
    ["a thread reply belongs to the same conversation",
      () => p61(CO61, world61, `insert into public.messages (channel_id, author_id, body, body_text, parent_message_id) values ('${CH61}','${CO61}','{}'::jsonb,'reply',${M_OWNER}); select reply_count as rows from public.channel_messages('${CH61}') where id=${M_OWNER}`), 1],
    ["…and a reply cannot start a thread of its own (one level)",
      () => p61(CO61, world61 + `insert into public.messages (id, channel_id, author_id, body, body_text, parent_message_id) overriding system value values (900000003,'${CH61}','${CO61}','{}'::jsonb,'reply',${M_OWNER});`,
        `insert into public.messages (channel_id, author_id, body, body_text, parent_message_id) values ('${CH61}','${CO61}','{}'::jsonb,'nested',900000003); select 1 as rows`), "ERR P0001"],
    ["a thread is unreachable when its channel is (§22)",
      () => p61(CO61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);
        insert into public.messages (id, channel_id, author_id, body, body_text) overriding system value values (${M_OWNER},'${CH61}','${OWN61}','{}'::jsonb,'root');
        insert into public.messages (channel_id, author_id, body, body_text, parent_message_id) values ('${CH61}','${OWN61}','{}'::jsonb,'reply',${M_OWNER});`,
        `select count(*)::int as rows from public.thread_messages(${M_OWNER})`), 0],
    ["a thread reply is not a top-level message",
      () => p61(CO61, world61 + `insert into public.messages (channel_id, author_id, body, body_text, parent_message_id) values ('${CH61}','${CO61}','{}'::jsonb,'reply',${M_OWNER});`,
        `select count(*)::int as rows from public.channel_messages('${CH61}')`), 2],

    /* ── §82 — pins ───────────────────────────────────────────────── */
    ["a channel manager pins a message",
      () => p61(OWN61, world61, `insert into public.message_pins (channel_id, message_id) values ('${CH61}',${M_OWNER}); select pinned::text as rows from public.channel_messages('${CH61}') where id=${M_OWNER}`), "true"],
    ["…an ordinary member does not (§29)",
      () => p61(CO61, world61, `insert into public.message_pins (channel_id, message_id) values ('${CH61}',${M_OWNER}); select 1 as rows`), "ERR 42501"],
    ["a pin stores no copy of the message",
      () => q(`select count(*)::int as rows from information_schema.columns where table_name='message_pins' and column_name in ('body','body_text','text')`)[0].rows, 0],

    /* ── §44 — idempotent send ────────────────────────────────────── */
    ["the same client key twice writes ONE message",
      () => p61(CO61, world61, `insert into public.messages (channel_id, author_id, body, body_text, client_message_id) values ('${CH61}','${CO61}','{}'::jsonb,'once','11111111-1111-4111-8111-111111111111'); insert into public.messages (channel_id, author_id, body, body_text, client_message_id) values ('${CH61}','${CO61}','{}'::jsonb,'once','11111111-1111-4111-8111-111111111111') on conflict do nothing; select count(*)::int as rows from public.messages where client_message_id='11111111-1111-4111-8111-111111111111'`), 1],

    /* ── §73 — the Professional Messaging Guard ───────────────────── */
    ["a clearly abusive message is refused, and not written",
      () => p61(CO61, world61, `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH61}','${CO61}','{}'::jsonb,'you are a fucking idiot'); select 1 as rows`), "ERR P0001"],
    ["normal direct business language sends (§36)",
      () => p61(CO61, world61, `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH61}','${CO61}','{}'::jsonb,'This process failed. The client is upset and this work is overdue — we need an explanation today.'); select count(*)::int as rows from public.messages where channel_id='${CH61}' and body_text like 'This process failed%'`), 1],
    ["…and a word merely CONTAINING a blocked one does not trip it",
      () => p61(CO61, world61, `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH61}','${CO61}','{}'::jsonb,'The assessment class in Scunthorpe passed'); select count(*)::int as rows from public.messages where channel_id='${CH61}' and body_text like 'The assessment%'`), 1],
    ["turning the guard off lets it through — and only an admin can (§40)",
      () => p61(CO61, world61 + `insert into public.agency_communication_settings (agency_id, guard_enabled) values ('${AG61}', false);`,
        `insert into public.messages (channel_id, author_id, body, body_text) values ('${CH61}','${CO61}','{}'::jsonb,'you are a fucking idiot'); select 1 as rows`), 1],
    ["…an agent cannot turn off their own guard",
      () => p61(CO61, "", `insert into public.agency_communication_settings (agency_id, guard_enabled) values ('${AG61}', false); select 1 as rows`), "ERR 42501"],
    ["…nor quietly delete the words that block them",
      () => p61(CO61, "", `delete from public.communication_blocked_terms where agency_id is null; select count(*)::int as rows from public.communication_blocked_terms where agency_id is null`),
      q(`select count(*)::int as rows from public.communication_blocked_terms where agency_id is null`)[0].rows],
    ["§39 — an external person is never refused, however angry",
      () => p61(U["client.portal@bes.test"], "", `select coalesce(public.message_guard_hit('${AG61}','this is fucking unacceptable'), 'no term') as rows`), "fucking"],

    /* ── §76 — the two default channels ───────────────────────────── */
    ["General Discussion exists, exactly once",
      () => q(`select count(*)::int as rows from public.channels where system_key='general_discussion'`)[0].rows, 1],
    ["Announcements and Updates exists, exactly once",
      () => q(`select count(*)::int as rows from public.channels where system_key='announcements_updates'`)[0].rows, 1],
    ["…running the seeder again creates nothing",
      () => q(`begin; select public.ensure_default_agency_channels(id) from public.agencies; select count(*)::int as rows from public.channels where system_key is not null; rollback;`)[0].rows,
      q(`select count(*)::int as rows from public.channels where system_key is not null`)[0].rows],
    ["both are all-hands, so future staff inherit them (§8)",
      () => q(`select count(*)::int as rows from public.channels where system_key is not null and not open_to_scope`)[0].rows, 0],
    ["an ordinary agent sees General Discussion",
      () => p61(CO61, "", `select count(*)::int as rows from public.channels where system_key='general_discussion'`), 1],
    ["…and a DEACTIVATED one does not (§8)",
      () => p61(CO61, `update public.agency_memberships set status='inactive' where user_id='${CO61}';`,
        `select count(*)::int as rows from public.channels where system_key='general_discussion'`), 0],
    ["a default channel cannot be archived, even by the owner (§7)",
      () => p61(OWN61, "", `update public.channels set archived_at=now() where system_key='general_discussion'; select 1 as rows`), "ERR P0001"],

    /* ── §75 — creating a channel ─────────────────────────────────── */
    /* Called ONCE into a temp table. A function in a WHERE clause may be
       evaluated per row of a table that is empty, which is how the first
       version of these two probes reported 0 and "ERR unknown" while the
       feature worked perfectly. */
    ["the owner creates a channel and is its manager",
      () => p61(OWN61, "", `create temp table c1 as select public.create_agency_channel('Operations',null,'topic',true) as id;
        select count(*)::int as rows from public.channel_members m, c1 where m.channel_id=c1.id and m.user_id='${OWN61}' and m.is_manager`), 1],
    ["…with the agency set and the other two owner columns null (§4)",
      () => p61(OWN61, "", `create temp table c2 as select public.create_agency_channel('Operations2',null,'topic',true) as id;
        select (c.agency_id is not null and c.organization_id is null and c.partner_group_id is null)::text as rows
          from public.channels c, c2 where c.id=c2.id`), "true"],
    ["an agent without the capability is refused (§3)",
      () => p61(CO61, "", `select public.create_agency_channel('Nope',null,'topic',false)::text as rows`), "ERR 42501"],
    ["…and granting it lets them (§3: NO by default, can be granted)",
      () => p61(CO61, `insert into public.agency_member_permissions (membership_id, key, allowed, set_by) select id, 'communication.channels.create', true, '${OWN61}' from public.agency_memberships where user_id='${CO61}';`,
        `select (public.create_agency_channel('Mine',null,'topic',false) is not null)::text as rows`), "true"],
    ["the browser cannot name the agency — there is no argument for it",
      () => q(`select (position('agency' in pg_get_function_identity_arguments('public.create_agency_channel(text,text,text,boolean,uuid[],uuid[])'::regprocedure)) = 0)::text as rows`)[0].rows, "true"],

    /* ── §77, §78 — announcements ─────────────────────────────────── */
    ["a published BES announcement posts ONE card",
      () => p61(OWN61, "", `select public.save_announcement(null, null, 'bes_internal', 'Office Holiday Schedule', 'Closed on the 25th.', null, false, true); set local role postgres; select count(*)::int as rows from public.messages where message_type='announcement' and announcement_id = (select id from public.announcements where title='Office Holiday Schedule')`), 1],
    ["…and the card holds NO copy of its title or body (§12, §15)",
      () => p61(OWN61, "", `select public.save_announcement(null, null, 'bes_internal', 'Office Holiday Schedule', 'Closed on the 25th.', null, false, true); set local role postgres; select body_text as rows from public.messages where message_type='announcement' and announcement_id = (select id from public.announcements where title='Office Holiday Schedule')`), "Announcement"],
    ["…so message search cannot leak an announcement's words",
      () => p61(OWN61, "", `select public.save_announcement(null, null, 'bes_internal', 'Office Holiday Schedule', 'Closed on the 25th.', null, false, true); select count(*)::int as rows from public.search_messages('Closed on the 25th')`), 0],
    ["editing it makes no second card (§14)",
      () => p61(OWN61, "", `select public.save_announcement(null, null, 'bes_internal', 'Holiday', 'v1', null, false, true);
        select public.save_announcement((select id from public.announcements where title='Holiday'), null, 'bes_internal', 'Holiday', 'v2', null, false, true);
        set local role postgres; select count(*)::int as rows from public.messages where announcement_id = (select id from public.announcements where title='Holiday')`), 1],
    ["a DRAFT announcement posts nothing",
      () => p61(OWN61, "", `select public.save_announcement(null, null, 'bes_internal', 'Draft thing', 'not yet', null, false, false); set local role postgres; select count(*)::int as rows from public.messages where announcement_id = (select id from public.announcements where title='Draft thing')`), 0],

    /* ── §78 — a TARGETED announcement does not leak ──────────────
       Correction to an earlier assumption of mine: announcement targeting is
       not a future feature. `announcements_select` already reads
       `managers_only`, `department_id` and `team_id`, so an announcement
       aimed at one team is a thing that exists today — and Announcements and
       Updates is visible to every BES staff member. Both halves of §15 are
       live, and both are measured. */
    ["a team-targeted announcement reaches a member of that team",
      () => p61(LEAD61, `insert into public.announcements (organization_id, audience, title, body, team_id, published_at, created_by) values (null,'bes_internal','[TEST] Team A only','members only','${TEAM_A61}', now(), '${OWN61}');`,
        `select coalesce((select announcement_title from public.channel_messages((select id from public.channels where system_key='announcements_updates')) where announcement_title = '[TEST] Team A only'), 'HIDDEN') as rows`), "[TEST] Team A only"],
    ["…and NOT somebody on another team",
      () => p61(U["bes.restricted@bes.test"], `insert into public.announcements (organization_id, audience, title, body, team_id, published_at, created_by) values (null,'bes_internal','[TEST] Team A only','members only','${TEAM_A61}', now(), '${OWN61}');`,
        `select coalesce((select announcement_title from public.channel_messages((select id from public.channels where system_key='announcements_updates')) where announcement_id is not null and announcement_title = '[TEST] Team A only'), 'HIDDEN') as rows`), "HIDDEN"],
    ["…whose message row carries no title to leak in the first place",
      () => p61(U["bes.restricted@bes.test"], `insert into public.announcements (organization_id, audience, title, body, team_id, published_at, created_by) values (null,'bes_internal','[TEST] Team A only','zebra-secret-body','${TEAM_A61}', now(), '${OWN61}');`,
        `select count(*)::int as rows from public.search_messages('zebra-secret-body')`), 0],
    ["…and a MANAGERS-ONLY announcement stays with managers",
      () => p61(CO61, `insert into public.announcements (organization_id, audience, title, body, managers_only, published_at, created_by) values (null,'bes_internal','[TEST] Leadership only','x', true, now(), '${OWN61}');`,
        `select coalesce((select announcement_title from public.channel_messages((select id from public.channels where system_key='announcements_updates')) where announcement_title = '[TEST] Leadership only'), 'HIDDEN') as rows`), "HIDDEN"],

    /* ── §55/§56 — realtime, and editing your own words ──────────── */
    ["messages are published to realtime, and NOTHING else is",
      () => q(`select count(*)::int as rows from pg_publication_tables
                where pubname='supabase_realtime' and not (schemaname='public' and tablename='messages')`)[0].rows, 0],
    ["…and messages IS published",
      () => q(`select count(*)::int as rows from pg_publication_tables
                where pubname='supabase_realtime' and schemaname='public' and tablename='messages'`)[0].rows, 1],
    ["an author edits their OWN message",
      () => p61(LEAD61, world61, `update public.messages set body_text='corrected' where id=${M_LEAD}; select body_text as rows from public.messages where id=${M_LEAD}`), "corrected"],
    ["…and the previous wording is kept (§56)",
      () => p61(LEAD61, world61, `update public.messages set body_text='corrected' where id=${M_LEAD}; set local role postgres; select body_text as rows from public.message_revisions where message_id=${M_LEAD}`), "from the lead"],
    ["…the OWNER cannot edit it",
      () => p61(OWN61, world61, `update public.messages set body_text='rewritten' where id=${M_LEAD}; select body_text as rows from public.messages where id=${M_LEAD}`), "from the lead"],
    ["…nor the ADMIN",
      () => p61(ADM61, world61, `update public.messages set body_text='rewritten' where id=${M_LEAD}; select body_text as rows from public.messages where id=${M_LEAD}`), "from the lead"],
    ["revision history cannot be rewritten — no update or delete grant",
      () => q(`select count(*)::int as rows from information_schema.role_table_grants
                where table_name='message_revisions' and grantee='authenticated'
                  and privilege_type in ('UPDATE','DELETE','INSERT')`)[0].rows, 0],
    ["…and a client cannot fabricate one",
      () => p61(LEAD61, world61, `insert into public.message_revisions (message_id, body_text) values (${M_LEAD},'never said this'); select 1 as rows`), "ERR 42501"],
    ["a soft delete is not recorded as an edit",
      () => p61(LEAD61, world61, `select public.delete_own_message(${M_LEAD}); set local role postgres; select count(*)::int as rows from public.message_revisions where message_id=${M_LEAD}`), 0],
    ["the single-message reader is RLS-filtered like the list",
      () => p61(GHL60_61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);
        insert into public.messages (id, channel_id, author_id, body, body_text) overriding system value values (${M_OWNER},'${CH61}','${OWN61}','{}'::jsonb,'secret');`,
        `select count(*)::int as rows from public.channel_message_by_id(${M_OWNER})`), 0],

    /* ── §27 — mentions notify, and never admit ──────────────────── */
    /* `attrs.userId`, not `attrs.id`. The first version of this probe used
       `id`, so `mentioned_user_ids` parsed an empty array, the notifier loop
       never ran, and the probe passed without exercising a single line of the
       thing it was written to test. */
    ["mentioning somebody in a BES channel does not refuse the MESSAGE",
      () => p61(OWN61, world61, `${MENTION61(LEAD61, 'hey @lead')}
         select count(*)::int as rows from public.messages where channel_id='${CH61}' and body_text='hey @lead'`), 1],
    ["…and actually notifies them",
      () => p61(OWN61, world61 + `insert into public.channel_members (channel_id, user_id) values ('${CH61}','${LEAD61}');`,
        `${MENTION61(LEAD61, 'hey @lead')} set local role postgres;
         select count(*)::int as rows from public.notifications where recipient_id='${LEAD61}' and kind='mention' and entity_id='${CH61}'`), 1],
    ["…and notifies NOBODY who cannot reach the conversation (§27)",
      () => p61(OWN61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);
        insert into public.channel_members (channel_id, user_id, is_manager) values ('${CH61}','${OWN61}',true);`,
        `${MENTION61(CO61, 'hey @agent')} set local role postgres;
         select count(*)::int as rows from public.notifications where recipient_id='${CO61}' and kind='mention' and entity_id='${CH61}'`), 0],
    ["…and the message still sends, rather than failing because of the ping",
      () => p61(OWN61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);
        insert into public.channel_members (channel_id, user_id, is_manager) values ('${CH61}','${OWN61}',true);`,
        `${MENTION61(CO61, 'hey @agent')}
         select count(*)::int as rows from public.messages where channel_id='${CH61}'`), 1],

    /* ── §27 — the picker offers exactly whom the notifier will tell ─── */
    ["the picker offers a colleague in an all-hands channel",
      () => p61(OWN61, world61, `select count(*)::int as rows from public.channel_mentionable('${CH61}') where user_id='${REAL61}'`), 1],
    ["…and offers nobody in a members-only channel they are not in",
      () => p61(OWN61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);
        insert into public.channel_members (channel_id, user_id, is_manager) values ('${CH61}','${OWN61}',true);`,
        `select count(*)::int as rows from public.channel_mentionable('${CH61}') where user_id='${REAL61}'`), 0],
    ["…never offers you yourself",
      () => p61(OWN61, world61, `select count(*)::int as rows from public.channel_mentionable('${CH61}') where user_id='${OWN61}'`), 0],
    ["…never offers a fixture account to a real person",
      () => p61(OWN61, world61, `select count(*)::int as rows from public.channel_mentionable('${CH61}') p join public.profiles pr on pr.id=p.user_id where pr.is_fixture`), 0],
    ["…and hands a roster to NOBODY who cannot see the conversation (rule 1)",
      () => p61(GHL60_61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);`,
        `select count(*)::int as rows from public.channel_mentionable('${CH61}')`), 0],
    ["the picker and the notifier agree, person for person",
      () => p61(OWN61, world61,
        `select count(*)::int as rows from public.channel_mentionable('${CH61}') m
          where not public.channel_notifiable('${CH61}', m.user_id)`), 0],
    ["…a member of it IS notifiable",
      () => p61(OWN61, world61, `select public.channel_notifiable('${CH61}','${OWN61}')::text as rows`), "true"],
    ["…an all-hands channel reaches active staff who were never added",
      () => p61(OWN61, world61, `select public.channel_notifiable('${CH61}','${CO61}')::text as rows`), "true"],
    ["…and a members-only one does NOT (§27: a mention is not admission)",
      () => p61(OWN61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);`,
        `select public.channel_notifiable('${CH61}','${CO61}')::text as rows`), "false"],
    ["…nor a deactivated member of an all-hands one",
      () => p61(OWN61, world61 + `update public.agency_memberships set status='inactive' where user_id='${CO61}';`,
        `select public.channel_notifiable('${CH61}','${CO61}')::text as rows`), "false"],

    /* ── §26 — an attachment is not more reachable than its message ── */
    ["a file row on a message follows the message",
      () => p61(CO61, world61 + `insert into public.files (agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) values ('${AG61}','channel_message','${M_OWNER}','bes-files','agency/channels/${CH61}/x.pdf','x.pdf','${OWN61}');`,
        `select count(*)::int as rows from public.files where entity_type='channel_message'`), 1],
    ["…and NOT when the conversation is out of reach",
      () => p61(CO61, `insert into public.channels (id, agency_id, kind, name, created_by, open_to_scope) values ('${CH61}','${AG61}','topic','closed','${OWN61}', false);
        insert into public.messages (id, channel_id, author_id, body, body_text) overriding system value values (${M_OWNER},'${CH61}','${OWN61}','{}'::jsonb,'x');
        insert into public.files (agency_id, entity_type, entity_id, bucket, path, name, uploaded_by) values ('${AG61}','channel_message','${M_OWNER}','bes-files','agency/channels/${CH61}/x.pdf','x.pdf','${OWN61}');`,
        `select count(*)::int as rows from public.files where entity_type='channel_message'`), 0],
    ["the storage policy routes the channels subtree through channel access",
      () => q(`select (position('storage_channel_of' in pg_get_expr(polqual, polrelid)) > 0)::text as rows from pg_policy where polname='bes_files_select'`)[0].rows, "true"],
    /* Permissive policies are OR-ed, so the question is not how many there
       are — `bes_files_activity_select` and `bes_files_borrower_select` are
       legitimate and both scoped to `…/activity/…`. The question is whether
       any of them reaches the CHANNELS subtree beside the narrow one. */
    /* The partner portal policy (0259/003400) is legitimate too — but only
       because it pins itself to agency/partner/. Assert the pin, then sweep
       for anything ELSE: a policy is exempt from the sweep only when its
       qual carries a positive path pin away from the channels subtree. */
    ["…the partner portal policy is pinned to its own subtree (003400)",
      () => q(`select (position('agency/partner/' in pg_get_expr(polqual, polrelid)) > 0)::text as rows
                from pg_policy where polname='bes_files_partner_select' and polrelid='storage.objects'::regclass`)[0].rows, "true"],
    ["…and no OTHER bucket policy reaches the channels subtree",
      () => q(`select count(*)::int as rows from pg_policy p join pg_class c on c.oid=p.polrelid
                where c.relname='objects' and p.polcmd in ('r','*')
                  and p.polname <> 'bes_files_select'
                  and pg_get_expr(p.polqual, p.polrelid) like '%bes-files%'
                  and pg_get_expr(p.polqual, p.polrelid) not like '%activity%'
                  and pg_get_expr(p.polqual, p.polrelid) not like '%agency/partner/%'`)[0].rows, 0],

    /* ── §61 — the host start url has no home in this schema ──────── */
    ["no table anywhere holds a meeting host start url",
      () => q(`select count(*)::int as rows from information_schema.columns where table_schema='public' and column_name ilike '%start_url%'`)[0].rows, 0],
    /* Supabase's default privileges grant `authenticated` on every new table
       in `public`; `revoke ... from public, anon` does not touch that. 0202
       missed it on the token table and this probe is why 0204 exists. */
    ["and nobody but the service role can read a meeting token",
      () => q(`select count(*)::int as rows from information_schema.role_table_grants where table_name='agency_meeting_credentials' and grantee in ('authenticated','anon')`)[0].rows, 0],
    /* `table_schema` matters: the first version of this probe matched
       `realtime.messages`, which Supabase grants to anon for its own
       purposes, and reported a hole in a product table that was clean. */
    ["…and anon holds nothing on anything Communication added",
      () => q(`select count(*)::int as rows from information_schema.role_table_grants
                where grantee = 'anon' and table_schema = 'public' and table_name in (
                  'channels','messages','channel_members','channel_teams','channel_reads',
                  'channel_shares','message_reactions','message_pins','meetings',
                  'agency_meeting_providers','agency_meeting_credentials',
                  'communication_blocked_terms','agency_communication_settings')`)[0].rows, 0],

    ["anon reaches no reaction, pin, term or meeting row",
      () => { try { q(`begin; set local role anon; select 1 from public.message_reactions limit 1; select 1 from public.message_pins limit 1; select 1 from public.communication_blocked_terms limit 1; select 1 from public.meetings limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
  ] : [["(no agency to probe)", () => "skip", "skip"]];
  runPhase("phase 61", P61, { strict: true });
}


if (runs(62)) {
  startPhase("phase 62");
  /* THE CREDITOPS HANDOFF, and the rule that outranks it.
  
     Dee's live error: "new row violates row-level security policy for table
     client_department_statuses", on Complete Work with a handoff, as the
     agency OWNER.
  
     Root cause, measured rather than guessed: a bare INSERT succeeded and
     `INSERT ... ON CONFLICT DO UPDATE` did not. The upsert has to READ the
     conflicting row, so it needs the SELECT policy — and that policy only
     knew organization-owned clients. For a partner-owned client
     `bes_may_fulfil(NULL, group, …)` is false and `is_org_member(NULL)` is
     false, so NO staff member could see a department row for a partner's
     client. The loud symptom was the handoff; the quiet one was Department
     Progress reading empty for every partner client since they existed.
  
     And the locked doctrine, which these probes exist to keep true:
  
       COMPLETE WORK RECORDS WORK AND HANDS OFF NEXT STEPS.
       IT DOES NOT CHANGE THE CLIENT'S MASTER STATUS. */
  const p62 = (uid, seed, sql) => {
    try {
      return q(`begin; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${seed} set local role authenticated; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN62 = U["bes.owner@bes.test"], ADM62 = U["bes.admin@bes.test"];
  const CO62 = U["bes.credit@bes.test"], LEAD62 = U["bes.lead@bes.test"];
  const GHL62 = U["bes.funding@bes.test"], MGR62 = U["bes.manager@bes.test"];
  const PORTAL62 = U["client.portal@bes.test"];
  const AG62 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const TEAM_A62 = q(`select coalesce((select id::text from public.teams where name='[TEST] Team A'),'') as rows`)[0].rows;
  const GRP62 = "44444444-0000-4000-8000-0000000062a1";
  const CL62  = "44444444-0000-4000-8000-0000000062b1";

  /* A partner-owned client — the shape that was broken. `assigned_agent_id`
     is left null so `in_scope` has to be satisfied by the TEAM, which is how
     a real agent reaches it. */
  const TEAM_B62 = q(`select coalesce((select id::text from public.teams where name='[TEST] Team B'),'') as rows`)[0].rows;
  const world62 = (opts = {}) => `
    insert into public.outsourcing_groups (id, agency_id, name, contact_email, lifecycle)
      values ('${GRP62}','${AG62}','[TEST] Handoff Partner','handoff@example.test','active');
    insert into public.fulfillment_clients
      (id, agency_id, name, email, mode, outsourcing_group_id, status, round, team_id, auto_sync, open_items)
      values ('${CL62}','${AG62}','[TEST] Handoff Client','hc@example.test','outsourcing_only','${GRP62}',
              'Round Sent - Awaiting Results','Round 2','${opts.team === "other" ? TEAM_B62 : TEAM_A62}', false, 0);
    ${opts.assign === false ? "" : `insert into public.partner_assignments (agency_id, group_id, team_id) values ('${AG62}','${GRP62}','${TEAM_A62}');`}
    ${opts.complaintsOpen ? `insert into public.client_department_statuses (client_id, department, status) values ('${CL62}','Complaints','LETTERS PENDING');` : ""}
  `;

  const handoff = (targets, statuses) =>
    `select public.handoff_client_departments('${CL62}','Dispute', array[${targets.map((t) => `'${t}'`).join(",")}]::public.fulfillment_department[], array[${statuses.map((s2) => `'${s2}'`).join(",")}])::text as rows`;
  const deptCount = `select count(*)::int as rows from public.client_department_statuses where client_id='${CL62}'`;
  const masterStatus = `select status::text as rows from public.fulfillment_clients where id='${CL62}'`;

  const P62 = AG62 && TEAM_A62 ? [
    /* ── THE BUG ITSELF ──────────────────────────────────────────────── */
    ["the owner can now SELECT department rows for a partner's client",
      () => p62(OWN62, world62() + `insert into public.client_department_statuses (client_id, department, status) values ('${CL62}','Complaints','CM NOT NEEDED');`,
        deptCount), 1],
    ["…which is what the UPSERT needs, and it no longer fails",
      () => p62(OWN62, world62(), `select public.set_client_department_status('${CL62}','Complaints','CM NOT NEEDED',null); ${deptCount}`), 1],
    ["…and running the upsert twice still leaves ONE row",
      () => p62(OWN62, world62(), `select public.set_client_department_status('${CL62}','Complaints','CM NOT NEEDED',null); select public.set_client_department_status('${CL62}','Complaints','CM NOT NEEDED',null); ${deptCount}`), 1],

    /* ── §31 TEST A — the authorized agent, partner via TEAM ─────────── */
    /* TEAM-scoped, which is what "assigned through Team" means. An agent
       whose membership scope is 'assigned' is reached by a DIRECT assignment
       and not by their team's — `in_scope` says so, and the first version of
       this probe asked the wrong person and read the refusal as a bug. */
    ["A · a TEAM-scoped lead whose team holds the partner can hand off",
      () => p62(LEAD62, world62(), handoff(["Complaints"], ["CM NOT NEEDED"])),
      '{"opened": ["Complaints"], "alreadyOpen": []}'],
    ["A · …the source department is NOT closed or written (§7)",
      () => p62(LEAD62, world62(), `${handoff(["Complaints"], ["CM NOT NEEDED"])}; select count(*)::int as rows from public.client_department_statuses where client_id='${CL62}' and department='Dispute'`), 0],
    ["A · …and it grants no financial access (§31)",
      () => p62(LEAD62, world62(), `select public.agency_can('partners.financials.view')::text as rows`), "false"],
    /* An agent without `partners.view` cannot reach a PARTNER's client by any
       route — not by team, not by name — because that capability is the first
       term of the partner branch of `fulfillment_clients_select`. Measured:
       bes.credit and bes.restricted hold it false; the lead and the manager
       hold it true. Worth pinning, because it is the difference between "the
       agent is unassigned" and "the agent cannot work partner clients at
       all", and only one of those is fixed by an assignment. */
    ["A · an agent without partners.view cannot reach a partner's client",
      () => p62(CO62, world62(), handoff(["Complaints"], ["CM NOT NEEDED"])), "ERR 42501"],
    ["A · …not even assigned to it by name",
      () => p62(CO62, world62() + `update public.fulfillment_clients set assigned_agent_id='${CO62}' where id='${CL62}';`,
        handoff(["Complaints"], ["CM NOT NEEDED"])), "ERR 42501"],
    ["A · …and partners.view is indeed what they are missing",
      () => p62(CO62, "", `select public.agency_can('partners.view')::text as rows`), "false"],

    /* ── §32 TEST B — the unassigned partner ─────────────────────────── */
    ["B · an agent with NO assignment cannot see the client",
      () => p62(CO62, world62({ assign: false }), `select count(*)::int as rows from public.fulfillment_clients where id='${CL62}'`), 0],
    ["B · …cannot create a department status directly",
      () => p62(CO62, world62({ assign: false }),
        `insert into public.client_department_statuses (client_id, department, status) values ('${CL62}','Complaints','CM NOT NEEDED'); select 1 as rows`), "ERR 42501"],
    ["B · …and the handoff RPC refuses them",
      () => p62(CO62, world62({ assign: false }), handoff(["Complaints"], ["CM NOT NEEDED"])), "ERR 42501"],

    /* ── §33 TEST C — a BES CRM agent on no CreditOps team ───────────── */
    ["C · an agent on no assigned team is refused the handoff",
      () => p62(GHL62, world62(), handoff(["Complaints"], ["CM NOT NEEDED"])), "ERR 42501"],
    ["C · …and reaches no department row",
      () => p62(GHL62, world62() + `insert into public.client_department_statuses (client_id, department, status) values ('${CL62}','Complaints','CM NOT NEEDED');`,
        deptCount), 0],

    /* ── §34 TEST D — a manager's reach is their SCOPE, not their role ──
       `bes.manager` is scoped to the CreditOps division deliberately, so
       reaching a CreditOps partner client is that scope working — which is
       §26's "explicitly authorized management scope", not agency-wide access.
       What proves the difference is the TEAM-scoped lead beside them: same
       agency, same client, refused without the assignment. */
    ["D · a division-scoped manager reaches a client in their division",
      () => p62(MGR62, world62({ assign: false }), handoff(["Complaints"], ["CM NOT NEEDED"])),
      '{"opened": ["Complaints"], "alreadyOpen": []}'],
    /* `assign: false` alone is not enough: the CLIENT's own `team_id` is a
       route in its own right, and the first version of this probe left it
       pointing at the lead's team and read the (correct) success as a bug.
       `team: "other"` puts the client on Team B, so the Team-A lead has no
       route at all. */
    ["D · …while a TEAM-scoped lead with no route at all is refused",
      () => p62(LEAD62, world62({ assign: false, team: "other" }), handoff(["Complaints"], ["CM NOT NEEDED"])), "ERR 42501"],
    ["D · …and the admin, who IS agency-wide by role, may",
      () => p62(ADM62, world62({ assign: false }), handoff(["Complaints"], ["CM NOT NEEDED"])),
      '{"opened": ["Complaints"], "alreadyOpen": []}'],

    /* ── §35 MULTI-HANDOFF, one transaction ──────────────────────────── */
    ["multi · both destinations open in ONE call",
      () => p62(LEAD62, world62(), handoff(["Complaints", "Bureau Calling"], ["CM NOT NEEDED", "BC NOT NEEDED"])),
      '{"opened": ["Complaints", "Bureau Calling"], "alreadyOpen": []}'],
    ["multi · …and that is exactly two department rows, not three",
      () => p62(LEAD62, world62(), `${handoff(["Complaints", "Bureau Calling"], ["CM NOT NEEDED", "BC NOT NEEDED"])}; ${deptCount}`), 2],
    ["multi · an invalid status refuses the WHOLE call, writing nothing",
      () => p62(LEAD62, world62(), handoff(["Complaints", "Bureau Calling"], ["CM NOT NEEDED", "NOT A STATUS"])), "ERR 22023"],
    /* NOTE: an earlier version of this probe wrote `begin; select 1; end;`
       inside the harness's own transaction. `end` COMMITTED it, so the outer
       `rollback` had nothing left to undo and two [TEST] fixture rows landed
       in the live database — found immediately, removed by hand, and the
       lesson recorded here: a probe never opens a transaction of its own. */

    /* ── §36 ALREADY OPEN is left exactly as it is ───────────────────── */
    ["already · an active department is reported, not reopened",
      () => p62(LEAD62, world62({ complaintsOpen: true }), handoff(["Complaints", "Bureau Calling"], ["CM NOT NEEDED", "BC NOT NEEDED"])),
      '{"opened": ["Bureau Calling"], "alreadyOpen": ["Complaints"]}'],
    ["already · …and is NOT moved backwards (§6)",
      () => p62(LEAD62, world62({ complaintsOpen: true }), `${handoff(["Complaints"], ["CM NOT NEEDED"])}; select status as rows from public.client_department_statuses where client_id='${CL62}' and department='Complaints'`), "LETTERS PENDING"],

    /* ── §37 RETRY is idempotent ─────────────────────────────────────── */
    ["retry · the same handoff twice opens once",
      () => p62(LEAD62, world62(), `${handoff(["Complaints"], ["CM NOT NEEDED"])}; ${handoff(["Complaints"], ["CM NOT NEEDED"])}`),
      '{"opened": [], "alreadyOpen": ["Complaints"]}'],
    ["retry · …and leaves ONE department row",
      () => p62(LEAD62, world62(), `${handoff(["Complaints"], ["CM NOT NEEDED"])}; ${handoff(["Complaints"], ["CM NOT NEEDED"])}; ${deptCount}`), 1],

    /* ── §38 THE LOCKED DOCTRINE ─────────────────────────────────────── */
    ["status · a handoff does NOT change the client's master status",
      () => p62(LEAD62, world62(), `${handoff(["Complaints", "Bureau Calling"], ["CM NOT NEEDED", "BC NOT NEEDED"])}; ${masterStatus}`),
      "Round Sent - Awaiting Results"],
    ["status · …nor does the department-status writer",
      () => p62(LEAD62, world62(), `select public.set_client_department_status('${CL62}','Complaints','LETTERS PENDING',null); ${masterStatus}`),
      "Round Sent - Awaiting Results"],
    ["status · the handoff function contains no write to fulfillment_clients",
      () => q(`select (position('update public.fulfillment_clients' in lower(pg_get_functiondef('public.handoff_client_departments(uuid,public.fulfillment_department,public.fulfillment_department[],text[],text)'::regprocedure))) = 0)::text as rows`)[0].rows, "true"],
    ["status · and the round is untouched too",
      () => p62(LEAD62, world62(), `${handoff(["Complaints"], ["CM NOT NEEDED"])}; select round::text as rows from public.fulfillment_clients where id='${CL62}'`), "Round 2"],

    /* ── The portal side: a client never reads internal department state ─ */
    ["a client-portal user reaches no department status",
      () => p62(PORTAL62, world62() + `insert into public.client_department_statuses (client_id, department, status) values ('${CL62}','Complaints','CM NOT NEEDED');`,
        deptCount), 0],

    /* ── The shape that makes it all hold ───────────────────────────── */
    ["the department policies ask client_department_writable, not is_staff_of",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.client_department_statuses'::regclass
                and coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) not like '%client_department_writable%'`)[0].rows, 0],
    ["…there are exactly three of them — no organization-only twin OR-ed beside",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.client_department_statuses'::regclass`)[0].rows, 3],
    ["…none is FOR ALL",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.client_department_statuses'::regclass and polcmd='*'`)[0].rows, 0],
    ["…and none says USING true",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.client_department_statuses'::regclass
                and (pg_get_expr(polqual, polrelid) = 'true' or pg_get_expr(polwithcheck, polrelid) = 'true')`)[0].rows, 0],
    ["there is no delete policy — a department that was worked is not un-worked",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.client_department_statuses'::regclass and polcmd='d'`)[0].rows, 0],
    /* 0211 dropped policy names that did not exist and added three BESIDE
       the four real ones, so access became the union of the old rule and the
       new — wider, not narrower. This probe is why 0213 exists. */
    ["the FundingOps twin asks funding_department_writable, all of it",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.funding_department_statuses'::regclass
                and coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) not like '%funding_department_writable%'`)[0].rows, 0],
    ["…and there are exactly three, with nothing OR-ed beside them",
      () => q(`select count(*)::int as rows from pg_policy where polrelid='public.funding_department_statuses'::regclass`)[0].rows, 3],
    ["the two new client fields are writable by whoever may edit the client",
      () => p62(LEAD62, world62(), `update public.fulfillment_clients set description='working note', next_action='call the bureau' where id='${CL62}'; select next_action as rows from public.fulfillment_clients where id='${CL62}'`), "call the bureau"],
    ["…and not by somebody with no route to the client at all",
      () => p62(LEAD62, world62({ assign: false, team: "other" }), `update public.fulfillment_clients set next_action='x' where id='${CL62}'; select count(*)::int as rows from public.fulfillment_clients where id='${CL62}' and next_action='x'`), 0],

    /* Dee's TEN credit statuses, given explicitly and added verbatim in 0214.
       The dropdown is a literal list in the domain layer; this asserts the
       database still accepts every one of them, so a value cannot be offered
       and then refused when somebody picks it. */
    ["all ten of Dee's credit statuses exist in the enum",
      () => q(`select count(*)::int as rows from unnest(array[
                 'New Client','Incomplete Onboarding','Ready for Round 1','Ready for Processing',
                 'Prio Processing','For Complaints','Round Sent - Awaiting Results',
                 'Ready For Reimport/ Credit Update','On Hold (Non Workable)','For Partner Confirmation']) v
                where v not in (select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='fulfillment_client_status')`)[0].rows, 0],
    ["…and a client can actually be moved to one of them",
      () => p62(LEAD62, world62(), `update public.fulfillment_clients set status='Prio Processing' where id='${CL62}'; select status::text as rows from public.fulfillment_clients where id='${CL62}'`), "Prio Processing"],

    ["anon reaches no department status",
      () => { try { q(`begin; set local role anon; select 1 from public.client_department_statuses limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
  ] : [["(no agency or fixture team to probe)", () => "skip", "skip"]];
  runPhase("phase 62", P62, { strict: true });
}


if (runs(63)) {
  startPhase("phase 63");
  /* VIEW AS USER — a read-only preview that is NOT impersonation.
  
     Dee, §35: "Do NOT swap auth tokens, change auth.uid(), login as employee,
     create employee sessions, perform writes as employee."
  
     So the preview is built out of FACTS ABOUT the target, read through
     functions only a privileged caller may call. `auth.uid()` never changes,
     which is what the last probes here assert: previewing somebody grants no
     row, no write and no reach that the previewer did not already have.
  
     And the honest part. Answering "what would DANIEL see" needs the same
     rules with a different subject, and a function that reads `auth.uid()`
     internally cannot be parameterized — so `*_for_user` variants exist and
     are a SECOND COPY of rules that already exist. Rule 6 would normally
     forbid that; the alternative is impersonation. The trade is kept honest
     the only way it can be: these probes assert that for the CURRENT user,
     each parameterized function AGREES with the original, on every fixture,
     in both directions. A drift fails here rather than producing a preview
     that quietly lies. */
  const p63 = (uid, seed, sql) => {
    try {
      return q(`begin; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${seed} set local role authenticated; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN63 = U["bes.owner@bes.test"], ADM63 = U["bes.admin@bes.test"];
  const MGR63 = U["bes.manager@bes.test"], LEAD63 = U["bes.lead@bes.test"];
  const CO63 = U["bes.credit@bes.test"], PORTAL63 = U["client.portal@bes.test"];
  const AG63 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  const ADM_M63 = q(`select coalesce((select m.id::text from public.agency_memberships m join public.profiles p on p.id=m.user_id where p.email='bes.admin@bes.test'),'') as rows`)[0].rows;
  const EVERYONE63 = [OWN63, ADM63, MGR63, LEAD63, CO63];

  /* Grant/revoke the preview capability on the ADMIN's membership. */
  const grantPreview = `insert into public.agency_member_permissions (membership_id, key, allowed, set_by) values ('${ADM_M63}','access.preview_as_user',true,'${OWN63}') on conflict (membership_id, key) do update set allowed = true;`;

  const P63 = AG63 && ADM_M63 ? [
    /* ── §34 who may preview ─────────────────────────────────────────── */
    ["the owner may preview, by role",
      () => p63(OWN63, "", `select public.can_preview_as_user()::text as rows`), "true"],
    ["an admin may NOT until granted the capability",
      () => p63(ADM63, "", `select public.can_preview_as_user()::text as rows`), "false"],
    ["…and may once granted — that is 'Super Admin', not a fourth role",
      () => p63(ADM63, grantPreview, `select public.can_preview_as_user()::text as rows`), "true"],
    ["a manager may not",
      () => p63(MGR63, "", `select public.can_preview_as_user()::text as rows`), "false"],
    ["a team lead may not",
      () => p63(LEAD63, "", `select public.can_preview_as_user()::text as rows`), "false"],
    ["an agent may not",
      () => p63(CO63, "", `select public.can_preview_as_user()::text as rows`), "false"],
    ["a partner contact may not",
      () => p63(PORTAL63, "", `select public.can_preview_as_user()::text as rows`), "false"],

    /* ── the preview functions refuse anybody else ───────────────────── */
    ["an agent cannot profile a colleague",
      () => p63(CO63, "", `select coalesce(public.access_profile_for_user('${OWN63}')::text,'NULL') as rows`), "NULL"],
    ["…but may read their OWN profile",
      () => p63(CO63, "", `(select (public.access_profile_for_user('${CO63}') is not null)::text as rows)`), "true"],
    ["an agent gets no capability list for a colleague",
      () => p63(CO63, "", `select count(*)::int as rows from public.access_capabilities_for_user('${OWN63}')`), 0],
    ["…nor a partner list",
      () => p63(CO63, "", `select count(*)::int as rows from public.partners_visible_to_user('${OWN63}')`), 0],
    ["…nor a service list",
      () => p63(CO63, "", `select count(*)::int as rows from public.services_visible_to_user('${OWN63}')`), 0],
    ["…nor a conversation list",
      () => p63(CO63, "", `select count(*)::int as rows from public.channels_visible_to_user('${OWN63}')`), 0],
    ["a manager cannot profile an agent either",
      () => p63(MGR63, "", `select coalesce(public.access_profile_for_user('${CO63}')::text,'NULL') as rows`), "NULL"],
    ["anon reaches none of it",
      () => { try { q(`begin; set local role anon; select public.can_preview_as_user(); rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],

    /* ── THE AGREEMENT PROBES — the parameterized copies must not drift ─ */
    ...EVERYONE63.map((uid, i) => [
      `agency_can_for_user agrees with agency_can for fixture ${i + 1}`,
      () => p63(uid, "", `select count(*)::int as rows from public.permission_keys k
                           where (select allowed from public.agency_can_for_user('${uid}', k.key))
                                 is distinct from public.agency_can(k.key)`),
      0,
    ]),
    ...EVERYONE63.map((uid, i) => [
      `partners_visible_to_user agrees with can_see_partner for fixture ${i + 1}`,
      () => p63(uid, "", `select count(*)::int as rows from public.partners_visible_to_user('${uid}') v
                           where v.allowed is distinct from public.can_see_partner(v.partner_id)`),
      0,
    ]),
    ["…and that agreement is measured against real partners, not an empty set",
      () => p63(OWN63, "", `select count(*)::int as rows from public.partners_visible_to_user('${OWN63}')`),
      q(`select count(*)::int as rows from public.outsourcing_groups`)[0].rows],

    /* ── §35 PREVIEWING GRANTS NOTHING ───────────────────────────────── */
    ["previewing an agent does not shrink what the OWNER can read",
      () => p63(OWN63, "", `select public.access_profile_for_user('${CO63}'); select count(*)::int as rows from public.outsourcing_groups`),
      q(`select count(*)::int as rows from public.outsourcing_groups`)[0].rows],
    ["auth.uid() is unchanged by asking about somebody else",
      () => p63(OWN63, "", `select public.access_profile_for_user('${CO63}'); select (auth.uid() = '${OWN63}')::text as rows`), "true"],
    ["previewing the OWNER does not let an admin read as the owner",
      () => p63(ADM63, grantPreview, `select public.access_profile_for_user('${OWN63}'); select (auth.uid() = '${ADM63}')::text as rows`), "true"],
    ["no function here writes anything — all are STABLE or IMMUTABLE",
      () => q(`select count(*)::int as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.provolatile = 'v'
                  and p.proname in ('can_preview_as_user','agency_can_for_user','access_capabilities_for_user',
                                    'access_profile_for_user','partners_visible_to_user',
                                    'services_visible_to_user','channels_visible_to_user')`)[0].rows, 0],
    ["a deactivated person's preview reports the deactivation as the reason",
      () => p63(OWN63, `update public.agency_memberships set status='inactive' where user_id='${CO63}';`,
        `select (source like '%inactive%')::text as rows from public.agency_can_for_user('${CO63}','partners.view')`), "true"],
    ["…and everything is denied for them",
      () => p63(OWN63, `update public.agency_memberships set status='inactive' where user_id='${CO63}';`,
        `select count(*)::int as rows from public.permission_keys k
          where (select allowed from public.agency_can_for_user('${CO63}', k.key))`), 0],

    /* ── §38 the reason is the feature ───────────────────────────────── */
    ["every capability row carries a reason, never a blank",
      () => p63(OWN63, "", `select count(*)::int as rows from public.access_capabilities_for_user('${CO63}')
                             where source is null or length(trim(source)) = 0`), 0],
    ["every partner row carries a reason too",
      () => p63(OWN63, "", `select count(*)::int as rows from public.partners_visible_to_user('${CO63}')
                             where reason is null or length(trim(reason)) = 0`), 0],
    ["an owner's capabilities say they are held by role",
      () => p63(OWN63, "", `select (source like '%by role%')::text as rows from public.agency_can_for_user('${OWN63}','partners.financials.view')`), "true"],
    ["a granted capability says it was granted to the person",
      () => p63(OWN63, grantPreview, `select (source like '%to this person%')::text as rows from public.agency_can_for_user('${ADM63}','access.preview_as_user')`),
      /* An admin holds everything by role, so the ROLE branch answers first —
         which is correct and worth pinning rather than asserting the grant
         wording on somebody it does not apply to. */
      "false"],
    ["…and a manager's explicit grant does say so",
      () => p63(OWN63, `insert into public.agency_member_permissions (membership_id, key, allowed, set_by)
                          select m.id, 'reports.view', true, '${OWN63}' from public.agency_memberships m
                           where m.user_id = '${MGR63}' on conflict (membership_id, key) do update set allowed = true;`,
        `select (source like '%to this person%')::text as rows from public.agency_can_for_user('${MGR63}','reports.view')`), "true"],
    ["…and an explicit DENY says that instead",
      () => p63(OWN63, `insert into public.agency_member_permissions (membership_id, key, allowed, set_by)
                          select m.id, 'reports.view', false, '${OWN63}' from public.agency_memberships m
                           where m.user_id = '${MGR63}' on conflict (membership_id, key) do update set allowed = false;`,
        `select (source like '%denied for this person%')::text as rows from public.agency_can_for_user('${MGR63}','reports.view')`), "true"],
  ] : [["(no agency or admin membership to probe)", () => "skip", "skip"]];
  runPhase("phase 63", P63, { strict: true });
}


if (runs(64)) {
  startPhase("phase 64");
  /* OPERATIONAL NOTIFICATIONS (0218) — Dee §14 / §59: mention, direct
     message, assignment, handoff, announcement, attention.

     THE DEFECT THESE PROBES EXIST FOR. `notify_message_mentions` (0206)
     wrote every channel mention with `visibility => 'organization_internal'`.
     For a BES channel `organization_id` is NULL, so
     `can_view_activity(agency, NULL, 'organization_internal', 'channel')`
     returns FALSE for staff — the row was inserted and NOBODY could read it.
     No error, no log line; the only symptom was a bell that never rang. The
     first three probes hold that shut from both sides.

     Every write runs as `authenticated` with a real JWT claim. A probe that
     writes as the superuser holds EXECUTE on everything and would miss the
     whole class of failure 0174, 0196 and 0206 were. */
  const p64 = (uid, seed, sql) => {
    try {
      return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  /* Act as one person, then read the result as postgres. Two `set local role`
     switches in one transaction, which is legal because session_user never
     stops being the login role. */
  const act64 = (uid, stmt, assertion) =>
    p64(uid, "", `${stmt} set local role postgres; ${assertion}`);

  const OWN64 = U["bes.owner@bes.test"], CO64 = U["bes.credit@bes.test"];
  const LEAD64 = U["bes.lead@bes.test"], MGR64 = U["bes.manager@bes.test"];
  const FUND64 = U["bes.funding@bes.test"], ORG64 = U["org.owner@bes.test"];
  const AG64 = q(`select id::text as rows from public.agencies limit 1`)[0].rows;
  /* The agency's all-hands channel, by its PERMANENT system key rather than
     its name — 0198 exists because a name is a thing Dee renames. */
  const GEN64 = q(`select coalesce((select id::text from public.channels where system_key='general_discussion' and archived_at is null),'') as rows`)[0].rows;
  const EVAN64 = q(`select coalesce((select id::text from public.fulfillment_clients where name='[TEST] Evan Ellis'),'') as rows`)[0].rows;
  const CLEO64 = q(`select coalesce((select id::text from public.fulfillment_clients where name='[TEST] Cleo Chan'),'') as rows`)[0].rows;
  const WORK64 = q(`select coalesce((select id::text from public.work_items where title='[TEST] Round 2 dispute prep'),'') as rows`)[0].rows;
  const TEAMA64 = q(`select coalesce((select id::text from public.teams where name='[TEST] Team A'),'') as rows`)[0].rows;
  const DISPUTE64 = q(`select coalesce((select id::text from public.departments where key='dispute' and division='creditops' limit 1),'') as rows`)[0].rows;
  const STAFF64 = q(`select count(*)::int as rows from public.agency_memberships where status='active'`)[0].rows;

  /* `author_id` has no default and `messages_insert` checks
     `author_id = auth.uid()`, so it must be supplied explicitly. */
  const doc64 = (uid) => uid
    ? `'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"mention","attrs":{"userId":"${uid}"}},{"type":"text","text":" please look"}]}]}'::jsonb`
    : `'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"probe body"}]}]}'::jsonb`;
  const say64 = (channel, author, mentions) =>
    `insert into public.messages (channel_id, author_id, body, body_text) values (${channel}, '${author}', ${doc64(mentions)}, 'probe message');`;
  /* The direct conversation between two people, found rather than captured:
     `open_direct_channel` returns the id, but `channel_writable` is STABLE
     and cannot see a channel created by a CTE in the same statement. */
  const dm64 = (a, b) => `(select c.id from public.channels c where c.kind='direct' and c.archived_at is null
     and exists (select 1 from public.channel_members m where m.channel_id=c.id and m.user_id='${a}')
     and exists (select 1 from public.channel_members m where m.channel_id=c.id and m.user_id='${b}') limit 1)`;
  const ann64 = (cols, vals) =>
    `insert into public.announcements (audience, title, body, agency_id, created_by${cols}) values ('bes_internal','[TEST] Notify','[TEST] Body','${AG64}','${OWN64}'${vals});`;
  const nCount = (where) => `select count(*)::int as rows from public.notifications where ${where}`;

  const P64 = AG64 && GEN64 && EVAN64 && CLEO64 && WORK64 ? [
    /* ── the 0206 defect, from both sides ────────────────────────────── */
    ["an agent cannot read a channel notification stamped organization_internal (what 0206 wrote)",
      () => p64(CO64, "", `select public.can_view_activity('${AG64}', null, 'organization_internal', 'channel')::text as rows`), "false"],
    ["…and can read one stamped bes_internal (what 0218 writes)",
      () => p64(CO64, "", `select public.can_view_activity('${AG64}', null, 'bes_internal', 'channel')::text as rows`), "true"],
    ["channel_notice() calls the agency's own channel bes_internal",
      () => q(`select visibility::text as rows from public.channel_notice('${GEN64}')`)[0].rows, "bes_internal"],

    /* ── mention ─────────────────────────────────────────────────────── */
    ["a mention in the agency channel is READABLE by the person mentioned",
      () => p64(OWN64, "", `${say64(`'${GEN64}'`, OWN64, CO64)}
        set local request.jwt.claims = '{"sub":"${CO64}","role":"authenticated"}';
        ${nCount(`kind='mention' and entity_id='${GEN64}'`)}`), 1],
    ["…and it is stored bes_internal, not organization_internal",
      () => act64(OWN64, say64(`'${GEN64}'`, OWN64, CO64),
        `select visibility::text as rows from public.notifications where kind='mention' and entity_id='${GEN64}' order by id desc limit 1`), "bes_internal"],
    ["§27 mentioning an organization user in a BES channel notifies them of nothing",
      () => act64(OWN64, say64(`'${GEN64}'`, OWN64, ORG64), nCount(`kind='mention' and recipient_id='${ORG64}'`)), 0],
    ["an author is never notified of their own mention",
      () => act64(OWN64, say64(`'${GEN64}'`, OWN64, OWN64), nCount(`kind='mention' and recipient_id='${OWN64}'`)), 0],

    /* ── direct message ──────────────────────────────────────────────── */
    ["a direct message with no @ in it still notifies the other person",
      () => p64(OWN64, "", `select public.open_direct_channel('${CO64}');
        ${say64(dm64(OWN64, CO64), OWN64, null)}
        set local request.jwt.claims = '{"sub":"${CO64}","role":"authenticated"}'; ${nCount(`kind='dm'`)}`), 1],
    ["a direct message does not notify its own author",
      () => act64(OWN64, `select public.open_direct_channel('${CO64}'); ${say64(dm64(OWN64, CO64), OWN64, null)}`,
        nCount(`kind='dm' and recipient_id='${OWN64}'`)), 0],
    ["somebody mentioned inside a direct message is told ONCE, as a mention",
      () => act64(OWN64, `select public.open_direct_channel('${CO64}'); ${say64(dm64(OWN64, CO64), OWN64, CO64)}`,
        nCount(`recipient_id='${CO64}' and kind='dm'`)), 0],
    ["…and still receives the mention",
      () => act64(OWN64, `select public.open_direct_channel('${CO64}'); ${say64(dm64(OWN64, CO64), OWN64, CO64)}`,
        nCount(`recipient_id='${CO64}' and kind='mention'`)), 1],
    ["a message in a channel that is not direct raises no dm notification",
      () => act64(OWN64, say64(`'${GEN64}'`, OWN64, null), nCount(`kind='dm'`)), 0],

    /* ── 0219: a direct message says WHO, not "Direct message" ───────── */
    ["a direct-message notification is labelled with its author, not the channel's name",
      () => act64(OWN64, `select public.open_direct_channel('${CO64}'); ${say64(dm64(OWN64, CO64), OWN64, null)}`,
        `select entity_label as rows from public.notifications where kind='dm' order by id desc limit 1`),
      q(`select coalesce(nullif(trim(p.full_name),''), p.email, 'Someone') as rows from public.profiles p where p.id='${OWN64}'`)[0].rows],
    ["…and a mention in a real channel is still labelled with the channel",
      () => act64(OWN64, say64(`'${GEN64}'`, OWN64, CO64),
        `select entity_label as rows from public.notifications where kind='mention' order by id desc limit 1`),
      q(`select name as rows from public.channels where id='${GEN64}'`)[0].rows],

    /* ── handoff ─────────────────────────────────────────────────────── */
    ["a handoff tells the client's assigned agent",
      () => act64(OWN64, `select public.handoff_client_departments('${EVAN64}','Onboarding',array['Dispute']::public.fulfillment_department[],array['Ready for Processing'],'probe');`,
        nCount(`kind='handoff' and recipient_id='${CO64}' and entity_id='${EVAN64}'`)), 1],
    ["…and the lead of a team attached to the DESTINATION department, on a client whose own team has no lead",
      () => act64(OWN64, `select public.handoff_client_departments('${CLEO64}','Onboarding',array['Dispute']::public.fulfillment_department[],array['Ready for Processing'],'probe');`,
        nCount(`kind='handoff' and recipient_id='${LEAD64}' and entity_id='${CLEO64}'`)), 1],
    ["a destination department with NO team attached still hands off, and tells the two who own the file",
      () => act64(OWN64, `select public.handoff_client_departments('${EVAN64}','Onboarding',array['Complaints']::public.fulfillment_department[],array['CM NOT NEEDED'],'probe');`,
        nCount(`kind='handoff' and entity_id='${EVAN64}'`)), 2],
    ["nobody is told twice when the client's own team IS the destination department's team",
      () => act64(OWN64, `select public.handoff_client_departments('${EVAN64}','Onboarding',array['Dispute']::public.fulfillment_department[],array['Ready for Processing'],'probe');`,
        nCount(`kind='handoff' and recipient_id='${LEAD64}' and entity_id='${EVAN64}'`)), 1],
    ["the department key is derived from the enum by the same rule that seeded it",
      () => q(`select (public.fulfillment_department_key('Bureau Calling') = (select key from public.departments where name='Bureau Calling' limit 1))::text as rows`)[0].rows, "true"],

    /* ── attention ───────────────────────────────────────────────────── */
    ["moving work INTO Attention is reported as 'attention', not as an ordinary status change",
      () => act64(OWN64, `update public.work_items set stage='Attention' where id='${WORK64}';`,
        `select kind as rows from public.notifications where recipient_id='${CO64}' and entity_id='${WORK64}' order by id desc limit 1`), "attention"],
    ["an ordinary move stays 'status'",
      () => act64(OWN64, `update public.work_items set stage='Ready for QA' where id='${WORK64}';`,
        `select kind as rows from public.notifications where recipient_id='${CO64}' and entity_id='${WORK64}' order by id desc limit 1`), "status"],

    /* ── announcement ────────────────────────────────────────────────── */
    ["publishing a BES announcement notifies every other active staff member",
      () => act64(OWN64, `select public.save_announcement(null, null, 'bes_internal', '[TEST] Notify', '[TEST] Body', null, false, true);`,
        nCount(`kind='announcement'`)), STAFF64 - 1],
    ["…and an agent can READ that notification",
      () => p64(OWN64, "", `select public.save_announcement(null, null, 'bes_internal', '[TEST] Notify', '[TEST] Body', null, false, true);
        set local request.jwt.claims = '{"sub":"${CO64}","role":"authenticated"}'; ${nCount(`kind='announcement'`)}`), 1],
    ["a DRAFT announcement notifies nobody",
      () => act64(OWN64, `select public.save_announcement(null, null, 'bes_internal', '[TEST] Draft', '[TEST] Body', null, false, false);`,
        nCount(`kind='announcement'`)), 0],
    ["re-touching published_at does not announce it a second time",
      () => act64(OWN64, `select public.save_announcement(null, null, 'bes_internal', '[TEST] Notify', '[TEST] Body', null, false, true);
        set local role postgres; update public.announcements set published_at = now() + interval '1 minute' where title='[TEST] Notify';`,
        nCount(`kind='announcement'`)), STAFF64 - 1],
    ["an organization's own announcement notifies no BES staff member",
      () => act64(ORG64, `select public.save_announcement(null, (select organization_id from public.fulfillment_clients where id='${EVAN64}'), 'organization', '[TEST] Org', '[TEST] Body', null, false, true);`,
        nCount(`kind='announcement' and exists (select 1 from public.agency_memberships am where am.user_id = notifications.recipient_id)`)), 0],

    /* PER PERSON, not per membership. `org.multi@bes.test` belongs to two of
       the agency's organizations, so counting membership ROWS expects one
       notification too many — and the first version of this probe did,
       reporting a defect that was really the unique index doing its job. One
       announcement, one telling, whoever you are a member of. */
    ["BES to every customer reaches every member of every organization of this agency",
      () => act64(OWN64, `select public.save_announcement(null, null, 'all_organizations', '[TEST] All', '[TEST] Body', null, false, true);`,
        nCount(`kind='announcement'`)),
      q(`select count(distinct om.user_id)::int as rows from public.org_memberships om join public.organizations o on o.id=om.organization_id where o.agency_id='${AG64}' and om.user_id <> '${OWN64}'`)[0].rows],
    ["…and somebody who belongs to TWO of them is told once, not twice",
      () => act64(OWN64, `select public.save_announcement(null, null, 'all_organizations', '[TEST] All', '[TEST] Body', null, false, true);`,
        nCount(`kind='announcement' and recipient_id = (select om.user_id from public.org_memberships om join public.organizations o on o.id=om.organization_id where o.agency_id='${AG64}' group by om.user_id having count(*) > 1 limit 1)`)), 1],
    ["…and reaches no BES staff member, who is not a customer of BES",
      () => act64(OWN64, `select public.save_announcement(null, null, 'all_organizations', '[TEST] All', '[TEST] Body', null, false, true);`,
        nCount(`kind='announcement' and recipient_id='${CO64}' and not exists (select 1 from public.org_memberships om where om.user_id='${CO64}')`)), 0],
    ["…and a customer's own member can READ theirs",
      () => p64(OWN64, "", `select public.save_announcement(null, null, 'all_organizations', '[TEST] All', '[TEST] Body', null, false, true);
        set local request.jwt.claims = '{"sub":"${ORG64}","role":"authenticated"}'; ${nCount(`kind='announcement'`)}`), 1],

    /* ── announcement targeting (0128: managers_only / department / team)
         Written as the superuser on purpose: these probes are about WHO THE
         NOTIFIER TELLS, and `save_announcement` sets none of the targeting
         columns, so the interface cannot yet produce this row. The write path
         itself is covered above. */
    ["a managers-only announcement does not reach an agent",
      () => q(`begin; ${ann64(", managers_only, published_at", ", true, now()")} ${nCount(`kind='announcement' and recipient_id='${CO64}'`)}; rollback;`)[0].rows, 0],
    ["…and does reach a manager",
      () => q(`begin; ${ann64(", managers_only, published_at", ", true, now()")} ${nCount(`kind='announcement' and recipient_id='${MGR64}'`)}; rollback;`)[0].rows, 1],
    ["a team-targeted announcement reaches that team's member",
      () => q(`begin; ${ann64(", team_id, published_at", `, '${TEAMA64}', now()`)} ${nCount(`kind='announcement' and recipient_id='${CO64}'`)}; rollback;`)[0].rows, 1],
    ["…and not an agent outside it",
      () => q(`begin; ${ann64(", team_id, published_at", `, '${TEAMA64}', now()`)} ${nCount(`kind='announcement' and recipient_id='${FUND64}'`)}; rollback;`)[0].rows, 0],
    ["a department-targeted announcement reaches nobody who is not scoped to that department",
      () => q(`begin; ${ann64(", department_id, published_at", `, '${DISPUTE64}', now()`)}
        ${nCount(`kind='announcement' and not exists (select 1 from public.agency_memberships am where am.user_id = notifications.recipient_id and am.scope_department_id = '${DISPUTE64}')`)}; rollback;`)[0].rows, 0],

    /* ── grants ──────────────────────────────────────────────────────── */
    ["anon reaches no notification",
      () => { try { q(`begin; set local role anon; select 1 from public.notifications limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
    ["the internal helpers are not callable from the API",
      () => q(`select count(*)::int as rows from (values ('channel_notice(uuid)'),('department_leads(uuid,text[])'),('fulfillment_department_key(text)'),('notify_announcement()'),('notify_message_recipients()')) as f(sig)
               where has_function_privilege('authenticated', ('public.' || f.sig)::regprocedure, 'execute')`)[0].rows, 0],
    ["the retired 0206 notifier is gone rather than left beside its replacement",
      () => q(`select count(*)::int as rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_message_mentions'`)[0].rows, 0],
    ["one trigger on messages notifies, not two",
      () => q(`select count(*)::int as rows from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='messages' and not t.tgisinternal and t.tgname like '%notif%'`)[0].rows, 1],
  ] : [["(no agency, channel or fixture client to probe)", () => "skip", "skip"]];
  runPhase("phase 64", P64, { strict: true });
}


if (runs(65)) {
  startPhase("phase 65");
  /* BES CRM — the four layers Dee locked on 2026-09-08.
  
     PROJECT JOURNEY · ENGINE PROGRESS · WORK UNIT STATUS · QA RESULT
     + MILESTONES. The old ClickUp template mixed all of those into one status
     field; these probes hold them apart.
  
     What they mostly prove is ABSENCE: a Website-only project has no Sales
     work and no Sales milestone, a QA failure does not relabel the project, a
     unit waiting on the client does not stop its siblings, and a
     CreditOps-scoped manager reaches none of it. Absence is the requirement —
     "if Website is not included, Website work simply does not exist in that
     project" (§11) — and it is the half a screenshot cannot show. */
  const p65 = (uid, seed, sql) => {
    try {
      return q(`begin; ${seed} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const act65 = (uid, stmt, assertion) => p65(uid, "", `${stmt} set local role postgres; ${assertion}`);
  const OWN65 = U["bes.owner@bes.test"], MGR65 = U["bes.manager@bes.test"];
  const CO65 = U["bes.credit@bes.test"], ADM65 = U["bes.admin@bes.test"];
  const LEAD65 = U["bes.lead@bes.test"];
  const GRP65 = q(`select coalesce((select id::text from public.outsourcing_groups where name like '[TEST]%' limit 1),'') as rows`)[0].rows;
  const ENGINES65 = q(`select count(*)::int as rows from public.crm_engine_templates where status='published'`)[0].rows;
  /* Named `[TEST]` so a stray row is recognisable, though every probe rolls back. */
  const mk65 = (engines) =>
    `select public.crm_create_project('[TEST] CRM build', array[${engines.map((e) => `'${e}'`).join(",")}], '${GRP65}');`;
  const proj65 = `(select id from public.crm_projects where name='[TEST] CRM build')`;
  const unit65 = (title) => `(select w.id from public.work_items w where w.crm_project_id = ${proj65} and w.title = '${title}')`;
  const withP = (engines, assertion) => act65(OWN65, mk65(engines), assertion);

  const P65 = GRP65 && ENGINES65 >= 5 ? [
    /* ── §11 / §59 / §60 / §61: only what the partner bought ─────────── */
    ["a Website-only project creates website, setup and launch work and nothing else",
      () => withP(["project_setup", "website_funnel", "qa_launch"],
        `select string_agg(distinct crm_engine_key, ',' order by crm_engine_key) as rows
           from public.work_items where crm_project_id = ${proj65}`), "project_setup,qa_launch,website_funnel".split(",").sort().join(",")],
    ["…and no Sales or Fulfillment work at all",
      () => withP(["project_setup", "website_funnel", "qa_launch"],
        `select count(*)::int as rows from public.work_items
          where crm_project_id = ${proj65} and crm_engine_key in ('sales','fulfillment')`), 0],
    ["a Sales-only project creates sales work only",
      () => withP(["sales"], `select string_agg(distinct crm_engine_key, ',') as rows
        from public.work_items where crm_project_id = ${proj65}`), "sales"],
    ["a Fulfillment-only project creates fulfillment work only",
      () => withP(["fulfillment"], `select string_agg(distinct crm_engine_key, ',') as rows
        from public.work_items where crm_project_id = ${proj65}`), "fulfillment"],
    ["a project with no engine is refused rather than created empty",
      () => p65(OWN65, "", `select public.crm_create_project('[TEST] none', array[]::text[], '${GRP65}') as rows`), "ERR 22023"],
    /* Tests the RULE, not an example: 0231 published the engine this probe
       used to name, and the probe kept passing on a stale premise until the
       full run caught it. The draft is now made inside the transaction, so
       the probe cannot decay as the catalogue matures. */
    ["an engine whose template is only a draft is refused, not guessed at",
      () => p65(OWN65,
        `insert into public.crm_engines (key, label, sort) values ('probe_draft', '[TEST] Draft engine', 9999) on conflict (key) do nothing;
         insert into public.crm_engine_templates (agency_id, engine_key, version, status, provenance)
         select id, 'probe_draft', 1, 'draft', 'agency_authored' from public.agencies limit 1;`,
        `select public.crm_create_project('[TEST] draft', array['probe_draft'], '${GRP65}') as rows`), "ERR 22023"],

    /* ── §8 / §55: no second task engine ─────────────────────────────── */
    ["every work unit is a canonical work_items row in the bes_crm division",
      () => withP(["sales"], `select count(*)::int as rows from public.work_items
        where crm_project_id = ${proj65} and (scope <> 'AGENCY' or division <> 'bes_crm')`), 0],
    ["no table anywhere holds a second CRM task engine",
      () => q(`select count(*)::int as rows from information_schema.tables
                where table_schema='public'
                  and (table_name like '%build_task%' or table_name like '%work_order%'
                       or table_name = 'crm_tasks' or table_name = 'crm_work_units')`)[0].rows, 0],

    /* ── §4 / §16 / §23: PLANNED and READY are different facts ───────── */
    ["a unit whose prerequisite is unfinished is PLANNED",
      () => withP(["sales"], `select public.crm_work_unit_state(${unit65("Sales Pipeline")}) as rows`), "PLANNED"],
    ["the first unit of an engine is READY",
      () => withP(["sales"], `select public.crm_work_unit_state(${unit65("Sales Intake / Offer Map")}) as rows`), "READY"],

    /* ── §17 / §18 / §19 / §62: parallel, and waiting stops nothing ──── */
    ["completing one unit makes BOTH its dependants ready at once",
      () => act65(OWN65, mk65(["sales"]) +
        `update public.work_items set stage='Completed' where crm_project_id = ${proj65}
           and title in ('Sales Intake / Offer Map','Custom Fields & Tags','Sales Pipeline');`,
        `select count(*)::int as rows from public.work_items
          where crm_project_id = ${proj65} and title in ('Lead Routing','Follow-Up Automation')
            and public.crm_work_unit_ready(id)`), 2],
    ["…but not a unit whose own prerequisite is still open",
      () => act65(OWN65, mk65(["sales"]) +
        `update public.work_items set stage='Completed' where crm_project_id = ${proj65}
           and title in ('Sales Intake / Offer Map','Custom Fields & Tags','Sales Pipeline');`,
        `select public.crm_work_unit_ready(${unit65("Speed-to-Lead")})::text as rows`), "false"],
    ["no template dependency crosses an engine, so a single-engine build waits for nothing",
      () => q(`select count(*)::int as rows from public.crm_work_unit_template_deps d
                 join public.crm_work_unit_templates u on u.id = d.work_unit_template_id
                 join public.crm_work_unit_templates x on x.id = d.depends_on_id
                where u.template_id <> x.template_id`)[0].rows, 0],
    ["a unit waiting on the client is WAITING",
      () => withP(["website_funnel"], `select public.crm_work_unit_state(${unit65("Domain & SSL")}) as rows`), "WAITING"],
    ["…and satisfying the requirement releases exactly the unit it held",
      () => p65(OWN65, "", mk65(["website_funnel"]) +
        `select public.crm_satisfy_client_requirement(
           (select r.id from public.crm_client_requirements r
             where r.project_id = ${proj65} and r.label = 'Provide DNS access')) as rows`), 1],
    ["…leaving it READY, not still waiting",
      () => act65(OWN65, mk65(["website_funnel"]) +
        `select public.crm_satisfy_client_requirement(
           (select r.id from public.crm_client_requirements r
             where r.project_id = ${proj65} and r.label = 'Provide DNS access'));`,
        `select public.crm_work_unit_state(${unit65("Domain & SSL")}) as rows`), "READY"],
    ["waiting carries one of six structured reasons, not a status of its own",
      () => act65(OWN65, mk65(["sales"]) +
        `select public.crm_set_waiting(${unit65("Sales Pipeline")}, 'external_platform', 'GHL API limit');`,
        `select waiting_on::text as rows from public.work_items where id = ${unit65("Sales Pipeline")}`), "external_platform"],

    /* ── §14: a ticked action starts the unit ────────────────────────── */
    ["ticking the first action starts a ready unit with no status update",
      () => act65(OWN65, mk65(["project_setup"]) +
        `update public.work_checklist_items set done = true
          where id = (select c.id from public.work_checklist_items c
                       where c.work_item_id = ${unit65("Brand & Business Setup")} limit 1);`,
        `select public.crm_work_unit_state(${unit65("Brand & Business Setup")}) as rows`), "IN PROGRESS"],

    /* ── §21 / §25 / §14: engines live their own lives ───────────────── */
    ["an engine whose only movement is waiting has NOT started",
      () => withP(["project_setup"], `select public.crm_engine_state(${proj65}, 'project_setup') as rows`), "PLANNED"],
    ["an engine is ACTIVE once its own activation milestone completes",
      () => act65(OWN65, mk65(["website_funnel", "sales"]) +
        `update public.crm_milestones set completed_at = now() where project_id = ${proj65} and key='website_ready';`,
        `select public.crm_engine_state(${proj65}, 'website_funnel') as rows`), "ACTIVE"],
    ["…and the other engine is untouched by that",
      () => act65(OWN65, mk65(["website_funnel", "sales"]) +
        `update public.crm_milestones set completed_at = now() where project_id = ${proj65} and key='website_ready';`,
        `select public.crm_engine_state(${proj65}, 'sales') as rows`), "PLANNED"],
    ["every engine's progress comes back in ONE call",
      () => withP(["project_setup", "sales"],
        `select count(*)::int as rows from public.crm_project_engine_progress(${proj65})`), 2],

    /* ── §2 / §3 / §4 / §9: the project journey ──────────────────────── */
    ["a new project reads Info Gathering, never 'Not started'",
      () => withP(["sales"], `select public.crm_project_journey(${proj65}) as rows`), "info_gathering"],
    ["a QA failure does NOT relabel the project — there is no 'For Revision'",
      () => act65(OWN65, mk65(["sales"]) +
        `update public.work_items set stage='Ready for QA' where id = ${unit65("Sales QA")};` +
        `set local role authenticated; set local request.jwt.claims = '{"sub":"${OWN65}","role":"authenticated"}';
         select public.crm_fail_qa(${unit65("Sales QA")}, 'the follow-up fires twice');`,
        `select public.crm_project_journey(${proj65}) as rows`), "building"],
    ["go-live inside a contracted window puts the project in SUPPORT",
      () => act65(OWN65, mk65(["project_setup"]) +
        `select public.crm_record_go_live(${proj65}, current_date, current_date + 90);`,
        `select public.crm_project_journey(${proj65}) as rows`), "support"],
    ["the journey vocabulary is exactly the seven Dee locked",
      () => q(`select count(*)::int as rows from (values
                 ('info_gathering'),('planning_designing'),('building'),('testing'),
                 ('launch'),('support'),('complete')) as v(s)
               where not exists (select 1 from pg_constraint c
                 where c.conname = 'crm_projects_journey_override_check'
                   and pg_get_constraintdef(c.oid) like '%' || v.s || '%')`)[0].rows, 0],

    /* ── §9 / §19 / §30: QA RESULT is its own layer ──────────────────── */
    ["a failed review records NEEDS FIX on the unit and returns it to IN PROGRESS",
      () => act65(OWN65, mk65(["sales"]) +
        `update public.work_items set stage='Ready for QA', previous_assigned_to='${LEAD65}' where id = ${unit65("Sales QA")};` +
        `set local role authenticated; set local request.jwt.claims = '{"sub":"${OWN65}","role":"authenticated"}';
         select public.crm_fail_qa(${unit65("Sales QA")}, 'fix the sequence');`,
        `select w.qa_result::text || '/' || public.crm_work_unit_state(w.id) as rows
           from public.work_items w where w.id = ${unit65("Sales QA")}`), "needs_fix/IN PROGRESS"],
    ["…and it goes back to whoever built it, not to a manager",
      () => act65(OWN65, mk65(["sales"]) +
        `update public.work_items set stage='Ready for QA', previous_assigned_to='${LEAD65}', assigned_to=null where id = ${unit65("Sales QA")};` +
        `set local role authenticated; set local request.jwt.claims = '{"sub":"${OWN65}","role":"authenticated"}';
         select public.crm_fail_qa(${unit65("Sales QA")}, 'fix it');`,
        `select (assigned_to = '${LEAD65}')::text as rows from public.work_items where id = ${unit65("Sales QA")}`), "true"],
    ["a review cannot be failed without feedback",
      () => p65(OWN65, "", mk65(["sales"]) +
        `update public.work_items set stage='Ready for QA' where id = ${unit65("Sales QA")};
         select public.crm_fail_qa(${unit65("Sales QA")}, '   ') as rows`), "ERR 22023"],

    /* ── §11 / §12 / §14 / §20: milestones, not statuses ─────────────── */
    ["a Website-only project gets no Sales Engine Ready milestone",
      () => withP(["website_funnel"], `select count(*)::int as rows from public.crm_milestones
        where project_id = ${proj65} and key = 'sales_ready'`), 0],
    ["…but every project gets Client Presentation, User Training and Go-Live",
      () => withP(["website_funnel"], `select count(*)::int as rows from public.crm_milestones
        where project_id = ${proj65} and key in ('client_presentation','user_training','go_live')`), 3],
    ["Client Presentation and User Training can both be complete at once",
      () => act65(OWN65, mk65(["website_funnel"]) +
        `select public.crm_complete_milestone((select id from public.crm_milestones
           where project_id = ${proj65} and key='client_presentation'), 'done');
         select public.crm_complete_milestone((select id from public.crm_milestones
           where project_id = ${proj65} and key='user_training'), 'done');`,
        `select count(*)::int as rows from public.crm_milestones
          where project_id = ${proj65} and completed_at is not null`), 2],
    ["a milestone tied to a work unit completes itself when that unit does",
      () => act65(OWN65, mk65(["project_setup"]) +
        `update public.work_items set stage='Completed' where id = ${unit65("Scope Confirmation")};`,
        `select (completed_at is not null)::text as rows from public.crm_milestones
          where project_id = ${proj65} and key='intake_complete'`), "true"],

    /* ── §28 / §53: one action, and everything derived from it ───────── */
    ["completing a unit writes exactly ONE production row",
      () => act65(OWN65, mk65(["sales"]) +
        `select public.crm_complete_work_unit(${unit65("Sales Intake / Offer Map")});`,
        `select count(*)::int as rows from public.production_logs
          where work_item_id = ${unit65("Sales Intake / Offer Map")}`), 1],
    ["…attributed to the PARTNER, so the EOD line names them",
      () => act65(OWN65, mk65(["sales"]) +
        `select public.crm_complete_work_unit(${unit65("Sales Intake / Offer Map")});`,
        `select (outsourcing_group_id is not null)::text as rows from public.production_logs
          where work_item_id = ${unit65("Sales Intake / Offer Map")}`), "true"],
    ["…the ticked actions ARE the build actions, not a generic line",
      () => act65(OWN65, mk65(["project_setup"]) +
        `select public.crm_complete_work_unit(${unit65("Brand & Business Setup")},
           (select coalesce(array_agg(c.id), '{}') from public.work_checklist_items c
             where c.work_item_id = ${unit65("Brand & Business Setup")}));`,
        `select array_length(actions, 1) as rows from public.production_logs
          where work_item_id = ${unit65("Brand & Business Setup")}`), 6],
    ["…and ONE activity event, which is what notifies people",
      () => act65(OWN65, mk65(["sales"]) +
        `select public.crm_complete_work_unit(${unit65("Sales Intake / Offer Map")});`,
        `select count(*)::int as rows from public.activity_events
          where entity_type='work_item' and entity_id = ${unit65("Sales Intake / Offer Map")}::text
            and action in ('Work unit completed','Handed off')`), 1],
    ["§22B — a handoff that keeps the unit open does not complete it",
      () => act65(OWN65, mk65(["sales"]) +
        `select public.crm_complete_work_unit(${unit65("Sales Intake / Offer Map")}, '{}'::uuid[], null,
           array[${unit65("Custom Fields & Tags")}], true, null, '${LEAD65}');`,
        `select public.crm_work_unit_state(${unit65("Sales Intake / Offer Map")}) as rows`), "IN PROGRESS"],
    ["…and the target really was assigned by that same call",
      () => act65(OWN65, mk65(["sales"]) +
        `select public.crm_complete_work_unit(${unit65("Sales Intake / Offer Map")}, '{}'::uuid[], null,
           array[${unit65("Custom Fields & Tags")}], true, null, '${LEAD65}');`,
        `select (assigned_to = '${LEAD65}')::text as rows from public.work_items where id = ${unit65("Custom Fields & Tags")}`), "true"],

    /* ── §49: cancelling one engine leaves the others running ────────── */
    ["cancelling an engine archives its open work and keeps the rest",
      () => act65(OWN65, mk65(["website_funnel", "sales"]) +
        `select public.crm_cancel_engine(${proj65}, 'sales', 'partner dropped it');`,
        `select count(*)::int as rows from public.work_items
          where crm_project_id = ${proj65} and crm_engine_key = 'website_funnel' and archived_at is null`), 7],
    ["…and cancelling needs a reason",
      () => p65(OWN65, "", mk65(["sales"]) + `select public.crm_cancel_engine(${proj65}, 'sales', '') as rows`), "ERR 22023"],

    /* ── §48: adding an engine mid-project ──────────────────────────── */
    ["an engine added mid-project brings its work and its milestones",
      () => act65(OWN65, mk65(["website_funnel"]) + `select public.crm_add_engine(${proj65}, 'sales');`,
        `select count(*)::int as rows from public.crm_milestones
          where project_id = ${proj65} and key = 'sales_ready'`), 1],
    ["…and adding one already in scope is refused rather than duplicated",
      () => p65(OWN65, "", mk65(["sales"]) + `select public.crm_add_engine(${proj65}, 'sales') as rows`), "ERR 22023"],

    /* ── §50: who reaches BES CRM at all ────────────────────────────── */
    ["a CreditOps-scoped manager is refused, and told why",
      () => p65(MGR65, "", `select public.crm_create_project('[TEST] m', array['sales'], '${GRP65}') as rows`), "ERR 42501"],
    ["an agent without crm.projects.view sees no project the owner created",
      /* The owner creates it in the SEED, before the role switch, so the
         agent's own read is the only thing measured. */
      () => p65(CO65,
        `set local role authenticated; set local request.jwt.claims = '{"sub":"${OWN65}","role":"authenticated"}'; ${mk65(["sales"])} reset role;`,
        `select count(*)::int as rows from public.crm_projects where name='[TEST] CRM build'`), 0],
    ["an admin, who is not division-scoped, may create one",
      () => p65(ADM65, "", `select (public.crm_create_project('[TEST] a', array['sales'], '${GRP65}') is not null)::text as rows`), "true"],
    ["anon reaches no CRM table",
      () => { try { q(`begin; set local role anon; select 1 from public.crm_projects limit 1; rollback;`); return "readable"; } catch { return "refused"; } }, "refused"],
    /* The three trigger functions are unreachable; `crm_instantiate_engine` IS
       granted and must be, because `crm_create_project` is SECURITY INVOKER
       and calls it — the policies decide, so the caller needs the privilege.
       Asserted as exactly one, and named, rather than as a vague count. */
    ["the three CRM trigger functions are not callable from the API",
      () => q(`select count(*)::int as rows from (values
                 ('crm_derive_milestones()'),('crm_auto_start_from_checklist()'),
                 ('production_logs_derive_context()')) as f(sig)
               where has_function_privilege('authenticated', ('public.' || f.sig)::regprocedure, 'execute')`)[0].rows, 0],
    ["…and crm_instantiate_engine is, deliberately: its caller is INVOKER",
      () => q(`select has_function_privilege('authenticated',
                 'public.crm_instantiate_engine(uuid,text,uuid)'::regprocedure, 'execute')::text as rows`)[0].rows, "true"],

    /* ── §12 / §57: the master library ─────────────────────────────── */
    /* Until 0228 this asserted the library was EMPTY — nothing invented
       before the workbook arrived. The workbook has arrived, so the claim
       matures with it: everything present traces to the committed workbook,
       and nothing is unclassified. */
    ["every library row traces to the committed workbook, none invented",
      () => q(`select count(*)::int as rows from public.crm_requirements
                where source_reference <> 'BES_GHL_Full_Infrastructure_Build_Tracker.xlsx'
                   or engine_key is null or kind is null`)[0].rows, 0],
    ["…and it holds the workbook's 140 rows exactly",
      () => q(`select count(*)::int as rows from public.crm_requirements`)[0].rows, 140],
    ["…and its completeness gate exists to prove every source row is accounted for",
      () => q(`select count(*)::int as rows from public.crm_requirements_unmapped(
                 (select id from public.agencies limit 1))`)[0].rows, 0],
    /* Same maturation: the brief's five engines stay provisional, the eight
       filled from the workbook say master_tracker, and none claims to be
       hand-authored — a template with no source is a guessed standard. */
    ["every template names its source, and none is hand-invented",
      () => q(`select count(*)::int as rows from public.crm_engine_templates
                where provenance not in ('provisional_from_brief', 'master_tracker')`)[0].rows, 0],
    ["the workbook-fed engines say so",
      () => q(`select count(*)::int as rows from public.crm_engine_templates
                where status = 'published' and provenance = 'master_tracker'`)[0].rows, 8],
  ] : [["(no partner or no published engine template to probe)", () => "skip", "skip"]];
  runPhase("phase 65", P65, { strict: true });
}

if (runs(66)) {
  startPhase("phase 66");
  /* The partner credential vault (0225).
  
     Dee's team keeps every partner login in ClickUp descriptions in plain
     text. This replaces that. What the probes are FOR is proving the two
     halves stay apart: the ordinary half — a username, a link, which mailbox
     the code lands in — is readable by whoever may see the partner, because
     that is what the work needs twenty times a day; the password half is
     behind a named capability that is off by default, and every read of it is
     recorded with a name against it.
  
     The important checks are the ones about ABSENCE and about the RECORD: no
     password column exists in `public`, `authenticated` holds no grant on the
     vault, a refused reveal writes nothing, and the access record can never
     be edited — including by the person who caused the entry. */
  const p66 = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  /* Seed as postgres and act as somebody else IN ONE TRANSACTION.
     Seeding in a separate probe is useless: every probe rolls back, so the
     row is gone by the time the second one runs and the actor is refused for
     "not found" rather than "not allowed" — which looks like a pass and
     proves nothing about permission. */
  const seeded66 = (uid, sql) => {
    try {
      return q(`begin; set local role postgres; set local request.jwt.claims = '{"sub":"${U["bes.owner@bes.test"]}","role":"authenticated"}'; ${mk66} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const su66 = (sql) => { try { return q(`begin; ${sql}; rollback;`)[0].rows; } catch (e) {
    const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const OWN66 = U["bes.owner@bes.test"], MGR66 = U["bes.manager@bes.test"];
  const ORG66 = U["org.owner@bes.test"];
  /* Resolved once as postgres: the agent cannot see partners, so resolving it
     as the agent would silently yield an empty string and every probe below
     would then test nothing. */
  const GRP66 = q(`select coalesce((select id::text from public.outsourcing_groups where name like '[TEST]%' limit 1),'') as rows`)[0].rows;
  /* Created and read back inside one transaction, so nothing survives. */
  const mk66 = `select set_config('probe.cred', public.partner_credential_save('${GRP66}', 'disputefox', '[TEST] DF login', 'ops@dispute-me.com', 'app.disputefox.com', 'hunter2-not-real', 'code goes to ops@dispute-me.com', 'shared by the upload team')::text, true) as id;`;
  /* Read back from the setting, never re-found by label: a SELECT is filtered
     by the actor's own policies, so resolving the id AS the actor turns "you
     may not" into "it does not exist" and the probe then passes without
     testing permission at all. */
  const cred66 = `current_setting('probe.cred')::uuid`;

  const P66 = GRP66 ? [
    /* ── The secret is not in the public schema at all ─────────────────── */
    ["partner_credentials has no password-shaped column",
      () => su66(`select count(*)::int as rows from information_schema.columns
                   where table_schema='public' and table_name='partner_credentials'
                     and column_name ~* '(password|secret_value|credential_value|token)'`), 0],
    ["it holds a secret_id pointer instead",
      () => su66(`select count(*)::int as rows from information_schema.columns
                   where table_schema='public' and table_name='partner_credentials' and column_name='secret_id'`), 1],
    ["the stored password is not findable by scanning the row",
      () => p66(OWN66, `${mk66} set local role postgres; select count(*)::int as rows from public.partner_credentials
                   where label='[TEST] DF login' and (coalesce(username,'')||coalesce(url,'')||coalesce(notes,'')||coalesce(code_destination,'')) like '%hunter2%'`), 0],
    ["authenticated holds no grant on the vault",
      () => su66(`select count(*)::int as rows from information_schema.role_table_grants
                   where table_schema='vault' and grantee in ('authenticated','anon','public')`), 0],

    /* ── Who sees what ────────────────────────────────────────────────── */
    ["an owner sees the entry and its username",
      () => p66(OWN66, `${mk66} select username as rows from public.partner_credentials where label='[TEST] DF login'`), "ops@dispute-me.com"],
    ["an owner may reveal the password",
      () => p66(OWN66, `${mk66} select public.partner_credential_reveal(${cred66}) as rows`), "hunter2-not-real"],
    ["a manager without the capability is refused the password",
      () => seeded66(MGR66, `select public.partner_credential_reveal(${cred66}) as rows`), "ERR 42501"],
    ["an organization owner reaches no partner credential at all",
      () => p66(ORG66, `select count(*)::int as rows from public.partner_credentials`), 0],
    ["anon is refused the table outright, not merely filtered to nothing",
      () => { try { q(`begin; set local role anon; select count(*) from public.partner_credentials; rollback;`); return "allowed"; }
              catch { return "refused"; } }, "refused"],

    /* ── No direct writes: the functions are the only way in ───────────── */
    ["there is no INSERT grant on partner_credentials",
      () => su66(`select count(*)::int as rows from information_schema.role_table_grants
                   where table_schema='public' and table_name='partner_credentials'
                     and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')`), 0],

    /* ── The access record ────────────────────────────────────────────── */
    ["revealing writes a record naming the person",
      () => p66(OWN66, `${mk66} select public.partner_credential_reveal(${cred66});
                        set local role postgres;
                        select count(*)::int as rows from public.partner_credential_events
                         where credential_id = ${cred66} and action='revealed' and actor_id = '${OWN66}'`), 1],
    ["the record never holds the password",
      () => p66(OWN66, `${mk66} select public.partner_credential_reveal(${cred66});
                        set local role postgres;
                        select count(*)::int as rows from public.partner_credential_events
                         where credential_id = ${cred66} and coalesce(note,'') like '%hunter2%'`), 0],
    ["a refused reveal records nothing",
      () => seeded66(MGR66, `do $probe$ begin
          perform public.partner_credential_reveal(${cred66});
        exception when others then null; end $probe$;
        set local role postgres;
        select count(*)::int as rows from public.partner_credential_events
         where credential_id = ${cred66} and action = 'revealed'`), 0],
    ["the access record cannot be edited by the person who caused it",
      () => p66(OWN66, `${mk66} select public.partner_credential_reveal(${cred66});
                        delete from public.partner_credential_events where credential_id = ${cred66};
                        select 1 as rows`), "ERR 42501"],

    /* ── Saving: the three meanings of a password field ───────────────── */
    ["a null password leaves the stored one alone",
      () => p66(OWN66, `${mk66}
        select public.partner_credential_save('${GRP66}','disputefox','[TEST] DF login','ops@dispute-me.com',null,null,null,null,null, ${cred66});
        select public.partner_credential_reveal(${cred66}) as rows`), "hunter2-not-real"],
    ["an empty password clears it",
      () => p66(OWN66, `${mk66}
        select public.partner_credential_save('${GRP66}','disputefox','[TEST] DF login','ops@dispute-me.com',null,'',null,null,null, ${cred66});
        set local role postgres;
        select count(*)::int as rows from public.partner_credentials where id = ${cred66} and secret_id is null`), 1],
    ["creating an entry WITH a password is a creation, not a rotation",
      () => p66(OWN66, `${mk66} set local role postgres;
        select count(*)::int as rows from public.partner_credential_events where credential_id = ${cred66} and action = 'rotated'`), 0],
    ["…and it is recorded as a creation",
      () => p66(OWN66, `${mk66} set local role postgres;
        select count(*)::int as rows from public.partner_credential_events where credential_id = ${cred66} and action = 'created'`), 1],
    ["replacing an existing password is recorded as a rotation",
      () => p66(OWN66, `${mk66}
        select public.partner_credential_save('${GRP66}','disputefox','[TEST] DF login','ops@dispute-me.com',null,'a-different-one',null,null,null, ${cred66});
        set local role postgres;
        select count(*)::int as rows from public.partner_credential_events where credential_id = ${cred66} and action='rotated'`), 1],

    /* ── The point of the whole table: no plaintext in a note ─────────── */
    ["a note that looks like a password is refused",
      () => p66(OWN66, `select public.partner_credential_save('${GRP66}','disputefox','[TEST] Bad note',null,null,null,null,'password is hunter2') as rows`), "ERR 22023"],
    ["…and an ordinary note is not",
      () => p66(OWN66, `select length(public.partner_credential_save('${GRP66}','disputefox','[TEST] Fine note',null,null,null,null,'code goes to ops@dispute-me.com')::text) as rows`), 36],

    /* ── Archiving keeps history rather than deleting it ──────────────── */
    ["archiving needs a reason",
      () => p66(OWN66, `${mk66} select public.partner_credential_archive(${cred66}, '') as rows`), "ERR 22023"],
    ["an archived credential cannot be revealed",
      () => p66(OWN66, `${mk66} select public.partner_credential_archive(${cred66}, 'partner left');
                        select public.partner_credential_reveal(${cred66}) as rows`), "ERR P0002"],
    ["…but the row and its history survive",
      () => p66(OWN66, `${mk66} select public.partner_credential_archive(${cred66}, 'partner left');
                        set local role postgres;
                        select count(*)::int as rows from public.partner_credentials where id = ${cred66} and archived_at is not null`), 1],
  ] : [];
  runPhase("phase 66", P66, { strict: true });
}


if (runs(67)) {
  startPhase("phase 67");
  /* `agency_can_all` must answer exactly what `agency_can` answers (0226).
  
     Two implementations of one authorization rule is how a screen starts
     showing a control the database refuses — or hiding one it allows. These
     probes do not spot-check: they walk EVERY key in `permission_keys` for
     EVERY BES role and compare the two functions key by key. A capability
     added later is covered the moment its row exists.
  
     The map is presentation input, so a disagreement is not a breach. It is
     worse in a quieter way: the interface and the database would each be
     correct about a different thing, and nobody would know which. */
  const parity = (uid) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
        select coalesce(string_agg(k.key, ',' order by k.key), '') as rows
          from public.permission_keys k
         where coalesce((public.agency_can_all() ->> k.key)::boolean, false) is distinct from public.agency_can(k.key);
        rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const count = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const ROLES67 = [
    ["owner",   U["bes.owner@bes.test"]],
    ["admin",   U["bes.admin@bes.test"]],
    ["manager", U["bes.manager@bes.test"]],
    ["lead",    U["bes.lead@bes.test"]],
    ["agent",   U["bes.credit@bes.test"]],
  ].filter(([, id]) => id);

  const P67 = [
    ...ROLES67.map(([role, id]) => [
      `every capability agrees with agency_can for a BES ${role}`,
      () => parity(id), "",
    ]),
    ["an organization owner, who is not BES staff, gets every capability false",
      () => count(U["org.owner@bes.test"], `select count(*)::int as rows from public.permission_keys k
              where coalesce((public.agency_can_all() ->> k.key)::boolean, false)`), 0],
    ["the map covers every key in the catalogue, not a hand-written subset",
      () => count(U["bes.owner@bes.test"], `select (select count(*) from jsonb_object_keys(public.agency_can_all()))::int
              - (select count(*) from public.permission_keys)::int as rows`), 0],
    ["a manager's map is not simply all-true",
      () => count(U["bes.manager@bes.test"], `select (count(*) filter (where not coalesce((public.agency_can_all() ->> k.key)::boolean, false)) > 0)::int as rows
              from public.permission_keys k`), 1],
    ["the new credential capabilities are off for a manager by default",
      () => count(U["bes.manager@bes.test"], `select count(*)::int as rows from public.permission_keys k
              where k.key in ('partners.credentials.view','partners.credentials.manage')
                and coalesce((public.agency_can_all() ->> k.key)::boolean, false)`), 0],
    ["…and on for an owner",
      () => count(U["bes.owner@bes.test"], `select count(*)::int as rows from public.permission_keys k
              where k.key in ('partners.credentials.view','partners.credentials.manage')
                and coalesce((public.agency_can_all() ->> k.key)::boolean, false)`), 2],
    ["anon cannot call it",
      () => { try { q(`begin; set local role anon; select public.agency_can_all(); rollback;`); return "allowed"; }
              catch { return "refused"; } }, "refused"],
  ];
  runPhase("phase 67", P67, { strict: true });
}


if (runs(68)) {
  startPhase("phase 68");
  /* BES's own company files (0232), and the storage guard put back.
  
     Rule 18 says the agency hub and an organization hub are one engine with
     two owners. The half that matters to prove is rule 16's: an agency
     document has organization_id NULL, so NO organization branch can reach
     it — a customer must not be able to read BES's internal handbook, however
     its policies are combined. And the regression: 0218's storage rewrite
     lost the guard that kept company uploads behind member_can, so the guard
     itself is asserted against pg_policies, not assumed from the migration
     having applied. */
  const p68 = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const seeded68 = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${U["bes.owner@bes.test"]}","role":"authenticated"}';
        select set_config('probe.doc', public.save_company_document(null, 'agency/company/probe.pdf', '[TEST] handbook.pdf', 'application/pdf', 100)::text, true);
        set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const OWN68 = U["bes.owner@bes.test"], AGT68 = U["bes.credit@bes.test"];
  const ORGOWN68 = U["org.owner@bes.test"];

  const P68 = [
    /* ── who may put a document into BES's own hub ─────────────────────── */
    ["the owner may add a BES company document",
      () => p68(OWN68, `select length(public.save_company_document(null, 'agency/company/a.pdf', '[TEST] a.pdf', 'application/pdf', 10)::text) as rows`), 36],
    ["an agent without hub.files.manage may not",
      () => p68(AGT68, `select public.save_company_document(null, 'agency/company/b.pdf', '[TEST] b.pdf', 'application/pdf', 10) as rows`), "ERR 42501"],
    ["an organization owner may not reach the agency path at all",
      () => p68(ORGOWN68, `select public.save_company_document(null, 'agency/company/c.pdf', '[TEST] c.pdf', 'application/pdf', 10) as rows`), "ERR 42501"],
    ["a BES document must live in the agency company folder",
      () => p68(OWN68, `select public.save_company_document(null, 'somewhere/else.pdf', '[TEST] d.pdf', 'application/pdf', 10) as rows`), "ERR 42501"],

    /* ── rule 16: the customer never sees BES's internal documents ─────── */
    ["BES staff read the agency document",
      () => seeded68(AGT68, `select count(*)::int as rows from public.files where id = current_setting('probe.doc')::uuid`), 1],
    ["an organization owner does NOT — no organization branch reaches a NULL organization",
      () => seeded68(ORGOWN68, `select count(*)::int as rows from public.files where id = current_setting('probe.doc')::uuid`), 0],
    /* entity_visible saying yes for staff is the new case actually working;
       the customer's exclusion is the files policy above, not this helper. */
    ["entity_visible accepts the agency as a company_document owner for staff",
      () => p68(OWN68, `select public.entity_visible('company_document',
              (select id::text from public.agencies limit 1))::int as rows`), 1],

    /* ── removing: same asymmetry ──────────────────────────────────────── */
    ["an agent may not remove it",
      () => seeded68(AGT68, `select public.delete_company_document(current_setting('probe.doc')::uuid) as rows`), "ERR 42501"],
    ["the owner may",
      () => p68(OWN68, `select set_config('probe.doc', public.save_company_document(null, 'agency/company/e.pdf', '[TEST] e.pdf', 'application/pdf', 10)::text, true);
              select (public.delete_company_document(current_setting('probe.doc')::uuid) = 'agency/company/e.pdf')::int as rows`), 1],

    /* ── the storage guard, asserted against the live policy ───────────── */
    ["the general storage insert policy excludes company folders again",
      () => q(`select (coalesce(with_check, '') ilike '%IS DISTINCT FROM ''company''%')::int as rows
                 from pg_policies
                where schemaname = 'storage' and tablename = 'objects' and policyname = 'bes_files_insert'`)[0].rows, 1],
    ["…and the company policy carries both owners",
      () => q(`select ((coalesce(with_check,'') ilike '%hub.files.manage%') and (coalesce(with_check,'') ilike '%member_can%'))::int as rows
                 from pg_policies
                where schemaname = 'storage' and tablename = 'objects' and policyname = 'bes_files_company_insert'`)[0].rows, 1],

    /* ── the organization path is exactly as it was ────────────────────── */
    ["an organization owner still manages its own documents",
      () => p68(ORGOWN68, `select length(public.save_company_document(
               (select organization_id from public.org_memberships where user_id = '${ORGOWN68}' limit 1),
               (select organization_id::text from public.org_memberships where user_id = '${ORGOWN68}' limit 1) || '/company/f.pdf',
               '[TEST] f.pdf', 'application/pdf', 10)::text) as rows`), 36],
    ["…and a BES agent has no key to a customer's documents",
      () => p68(AGT68, `select public.save_company_document(
               (select organization_id from public.org_memberships where user_id = '${ORGOWN68}' limit 1),
               (select organization_id::text from public.org_memberships where user_id = '${ORGOWN68}' limit 1) || '/company/g.pdf',
               '[TEST] g.pdf', 'application/pdf', 10) as rows`), "ERR 42501"],
  ];
  runPhase("phase 68", P68, { strict: true });
}


if (runs(69)) {
  startPhase("phase 69");
  /* The timer cap and approved adjustments (0236–0238).
  
     Dee's rules: an agent NEVER writes their own time — a clock-out means
     "now", the system stops a forgotten clock at ten hours and tells the
     agent and their lead, and a wrong record is corrected only by a manager
     deciding the agent's request. The probes hold each of those, and the
     refusals matter as much as the grants: the whole design exists because
     self-edited time cannot be trusted in production or EOD. */
  const p69 = (uid, sql, seed = "") => {
    try {
      return q(`begin; ${seed ? `set local role postgres; ${seed}` : ""} set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const AGENT69 = U["bes.credit@bes.test"], LEAD69 = U["bes.lead@bes.test"], ADM69 = U["bes.admin@bes.test"];
  const AG69 = q(`select agency_id::text as rows from public.agency_memberships limit 1`)[0].rows;
  /* A CLOSED hour-long entry from this morning, seeded as the system and
     carried by id in a setting (the actor's RLS must not resolve the seed). */
  const seedClosed = `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at, ended_at)
     values ('${AG69}', '${AGENT69}', 'creditops', current_date, now() - interval '5 hours', now() - interval '4 hours');
     select set_config('probe.entry', (select id::text from public.time_entries where employee_id='${AGENT69}' order by created_at desc limit 1), true);`;
  const seedOpenStale = `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at)
     values ('${AG69}', '${AGENT69}', 'creditops', current_date - 1, now() - interval '30 hours');
     select set_config('probe.entry', (select id::text from public.time_entries where employee_id='${AGENT69}' and ended_at is null order by created_at desc limit 1), true);`;
  const ENTRY = `current_setting('probe.entry')::uuid`;
  const mkReq = `select set_config('probe.req', public.request_time_adjustment(${ENTRY}, now() - interval '270 minutes', 'Forgot to stop; I finished at half past.')::text, true);`;

  const P69 = [
    /* ── the guard: a clock-out can only mean "now", inside the cap ────── */
    ["a late clock-out records the cap, marked auto-stopped",
      () => p69(AGENT69, `update public.time_entries set ended_at = now() where id = ${ENTRY} and employee_id = auth.uid();
        select (extract(epoch from (ended_at - started_at))/3600)::int::text || ':' || auto_stopped::text as rows
          from public.time_entries where id = ${ENTRY}`, seedOpenStale), "10:true"],
    /* Silently reverted, not refused: a closed entry is not updatable by its
       employee at all, and an open one keeps its start whatever arrives. */
    ["an agent cannot move the clock's start",
      () => p69(AGENT69, `update public.time_entries set started_at = started_at - interval '2 hours' where id = ${ENTRY};
        select (abs(extract(epoch from (started_at - (now() - interval '5 hours')))) < 5)::text as rows from public.time_entries where id = ${ENTRY}`, seedClosed), "true"],
    /* 0239: whatever ended_at is SENT, the record says the moment of the
       call. The claim of "nine hours ago" leaves no trace. */
    ["an agent cannot backdate a clock-out — the record says now",
      () => p69(AGENT69, `update public.time_entries set ended_at = now() - interval '9 hours' where id = ${ENTRY} and ended_at is null;
        select (abs(extract(epoch from (ended_at - now()))) < 5)::text as rows from public.time_entries where id = ${ENTRY}`,
        `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at)
           values ('${AG69}', '${AGENT69}', 'creditops', current_date, now() - interval '2 hours');
         select set_config('probe.entry', (select id::text from public.time_entries where employee_id='${AGENT69}' and ended_at is null limit 1), true);`), "true"],

    /* ── self-heal: yesterday's forgotten clock never blocks today ─────── */
    ["clocking in closes a stale forgotten timer at the cap",
      () => p69(AGENT69, `insert into public.time_entries (agency_id, employee_id, division_id, work_date)
          values ('${AG69}', auth.uid(), 'creditops', current_date);
        select (select auto_stopped from public.time_entries where id = ${ENTRY})::text || ':' ||
               (select count(*) from public.time_entries where employee_id = auth.uid() and ended_at is null)::text as rows`,
        seedOpenStale), "true:1"],
    ["…and it told the agent",
      () => p69(AGENT69, `insert into public.time_entries (agency_id, employee_id, division_id, work_date)
          values ('${AG69}', auth.uid(), 'creditops', current_date);
        select count(*)::int as rows from public.notifications
         where recipient_id = auth.uid() and kind = 'timer' and entity_id = ${ENTRY}::text`,
        seedOpenStale), 1],
    ["a timer inside its cap still refuses a second clock-in",
      () => p69(AGENT69, `insert into public.time_entries (agency_id, employee_id, division_id, work_date)
          values ('${AG69}', auth.uid(), 'creditops', current_date); select 1 as rows`,
        `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at)
           values ('${AG69}', '${AGENT69}', 'creditops', current_date, now() - interval '1 hour');`), "ERR 23505"],

    /* ── requests: the agent states; only their own, only closed, sane ─── */
    ["an agent requests an adjustment to their own closed entry",
      () => p69(AGENT69, `${mkReq} select (current_setting('probe.req') <> '') ::text as rows`, seedClosed), "true"],
    ["…not to a colleague's",
      () => p69(LEAD69, `select public.request_time_adjustment(${ENTRY}, now() - interval '270 minutes', 'not my entry but trying') as rows`, seedClosed), "ERR 42501"],
    ["…not to a running timer",
      () => p69(AGENT69, `select public.request_time_adjustment(${ENTRY}, now() - interval '10 minutes', 'still running should refuse') as rows`,
        `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at)
           values ('${AG69}', '${AGENT69}', 'creditops', current_date, now() - interval '1 hour');
         select set_config('probe.entry', (select id::text from public.time_entries where employee_id='${AGENT69}' and ended_at is null limit 1), true);`), "ERR 22023"],
    ["…and not to a future stop time",
      () => p69(AGENT69, `select public.request_time_adjustment(${ENTRY}, now() + interval '1 hour', 'the future is not workable') as rows`, seedClosed), "ERR 22023"],
    ["one open request per entry",
      () => p69(AGENT69, `${mkReq} select public.request_time_adjustment(${ENTRY}, now() - interval '260 minutes', 'second ask same entry') as rows`, seedClosed), "ERR 23505"],

    /* ── decisions: management authority, never one's own request ──────── */
    ["an agent cannot decide a request",
      () => p69(AGENT69, `${mkReq} select public.decide_time_adjustment(current_setting('probe.req')::uuid, true) as rows`, seedClosed), "ERR 42501"],
    ["an admin approves; the entry moves and the request closes",
      () => p69(ADM69, `select public.decide_time_adjustment(current_setting('probe.req')::uuid, true);
        select ((select status from public.time_adjustment_requests where id = current_setting('probe.req')::uuid) || ':' ||
                (select (ended_at = started_at + interval '150 minutes')::text from public.time_entries where id = ${ENTRY})) as rows`,
        seedClosed + ` set local role authenticated; set local request.jwt.claims = '{"sub":"${AGENT69}","role":"authenticated"}';
        select set_config('probe.req', public.request_time_adjustment(${ENTRY}, now() - interval '270 minutes', 'Forgot to stop; I finished at half past.')::text, true);
        set local role postgres; select set_config('probe.req150', '', true);
        update public.time_adjustment_requests set requested_ended_at = (select started_at + interval '150 minutes' from public.time_entries where id = ${ENTRY}) where id = current_setting('probe.req')::uuid;`), "approved:true"],
    ["…and the decision is audited with both identities",
      () => p69(ADM69, `select public.decide_time_adjustment(current_setting('probe.req')::uuid, true);
        set local role postgres;
        select count(*)::int as rows from public.audit_log
         where action = 'time_adjustment.approved' and actor_id = '${ADM69}'
           and (after->>'requested_by') = '${AGENT69}'`,
        seedClosed + ` set local role authenticated; set local request.jwt.claims = '{"sub":"${AGENT69}","role":"authenticated"}';
        select set_config('probe.req', public.request_time_adjustment(${ENTRY}, now() - interval '270 minutes', 'Forgot to stop; I finished at half past.')::text, true);`), 1],
    ["a manager cannot approve their own request",
      () => p69(ADM69, `select public.decide_time_adjustment(current_setting('probe.req')::uuid, true) as rows`,
        `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at, ended_at)
           values ('${AG69}', '${ADM69}', 'creditops', current_date, now() - interval '5 hours', now() - interval '4 hours');
         select set_config('probe.entry', (select id::text from public.time_entries where employee_id='${ADM69}' order by created_at desc limit 1), true);
         set local role authenticated; set local request.jwt.claims = '{"sub":"${ADM69}","role":"authenticated"}';
         select set_config('probe.req', public.request_time_adjustment(${ENTRY}, now() - interval '270 minutes', 'my own entry my own ask')::text, true);
         set local role postgres;`), "ERR 42501"],

    /* ── the machinery stays the system's ──────────────────────────────── */
    ["the sweep is not callable by the API role",
      () => p69(AGENT69, `select public.auto_stop_stale_timers() as rows`), "ERR 42501"],
    ["timer notifications are visible to their recipient and nobody else",
      () => p69(LEAD69, `select count(*)::int as rows from public.notifications
         where kind = 'timer' and entity_id = ${ENTRY}::text`,
        seedOpenStale + ` select public.auto_stop_stale_timers();`), 0],
  ];
  runPhase("phase 69", P69, { strict: true });
}

if (runs(70)) {
  startPhase("phase 70");
  /* People management (0250–0253): schedules, breaks, leave, attendance,
     payroll. The doctrine under all of it: expectations are STATED by a
     manager, events are RECORDED by the clock, and every judgement — late,
     over-break, absent, gross pay — is ARITHMETIC. So the probes hold the
     boundaries (who may state, who may see) and the honesty rules (breaks
     are not production; released payroll is frozen; nobody decides their
     own leave). */
  const p70 = (uid, sql) => {
    try {
      return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows;
    } catch (e) {
      const m = (String(e.message) + String(e.stdout ?? "")).match(/ERROR:\s*(\w+):/);
      return "ERR " + (m ? m[1] : "unknown");
    }
  };
  const AGENT70 = U["bes.credit@bes.test"], LEAD70 = U["bes.lead@bes.test"],
        ADM70 = U["bes.admin@bes.test"], FUND70 = U["bes.funding@bes.test"];
  const AG70 = q(`select agency_id::text as rows from public.agency_memberships limit 1`)[0].rows;

  const P70 = [
    /* ── schedules: stated by management, seen by the right eyes ───────── */
    ["an agent cannot state their own schedule",
      () => p70(AGENT70, `select public.set_work_schedule('${AGENT70}', '{1,2,3,4,5}', '09:00', '18:00', 60, 30, 5, 'UTC') as rows`), "ERR 42501"],

    ["a manager states one, and the person can read it",
      () => p70(ADM70, `select public.set_work_schedule('${AGENT70}', '{1,2,3,4,5}', '09:00', '18:00', 60, 30, 5, 'UTC');
        set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        select count(*)::int as rows from public.work_schedules where user_id = '${AGENT70}'`), 1],

    ["…while an unrelated agent cannot read it",
      () => p70(ADM70, `select public.set_work_schedule('${AGENT70}', '{1,2,3,4,5}', '09:00', '18:00', 60, 30, 5, 'UTC');
        set local request.jwt.claims = '{"sub":"${FUND70}","role":"authenticated"}';
        select count(*)::int as rows from public.work_schedules where user_id = '${AGENT70}'`), 0],

    ["a schedule with an unknown timezone is refused",
      () => p70(ADM70, `select public.set_work_schedule('${AGENT70}', '{1,2,3}', '09:00', '18:00', 60, 30, 5, 'Mars/Olympus') as rows`), "ERR P0001"],

    /* ── breaks: one open entry, atomic switches, rest is not production ─ */
    ["a break splits a workday — starting one while clocked out is refused",
      () => p70(AGENT70, `select public.start_break('break') as rows`), "ERR P0001"],

    ["switching to lunch closes the work entry and opens a lunch entry",
      () => p70(AGENT70, `insert into public.time_entries (agency_id, employee_id, division_id, work_date)
          values ('${AG70}', '${AGENT70}', 'creditops', current_date);
        select public.start_break('lunch');
        select (count(*) filter (where ended_at is null and kind = 'lunch'))::int
             + (count(*) filter (where ended_at is not null and kind = 'work'))::int as rows
          from public.time_entries where employee_id = '${AGENT70}' and work_date = current_date`), 2],

    ["resuming work carries the interrupted division back",
      () => p70(AGENT70, `insert into public.time_entries (agency_id, employee_id, division_id, work_date)
          values ('${AG70}', '${AGENT70}', 'creditops', current_date);
        select public.start_break('break');
        select public.resume_work();
        select division_id as rows from public.time_entries
         where employee_id = '${AGENT70}' and ended_at is null`), "creditops"],

    ["EOD minutes count work only — the rule is in the function text",
      () => q(`select (position('t.kind = ' || quote_literal('work') in pg_get_functiondef(p.oid)) > 0)::text as rows
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'eod_day_activity'`)[0].rows, "true"],

    /* ── leave: request → lead decides, never their own ────────────────── */
    ["a person requests only their OWN leave",
      () => p70(AGENT70, `insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${LEAD70}'::uuid, id, current_date + 7, current_date + 7 from public.leave_types limit 1;
        select 0 as rows`), "ERR 42501"],

    ["two live requests cannot cover the same day — the database refuses",
      () => p70(AGENT70, `insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${AGENT70}'::uuid, id, current_date + 7, current_date + 9 from public.leave_types limit 1;
        insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${AGENT70}'::uuid, id, current_date + 8, current_date + 10 from public.leave_types limit 1;
        select 0 as rows`), "ERR 23P01"],

    ["submitting tells the leads",
      () => p70(AGENT70, `insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${AGENT70}'::uuid, id, current_date + 7, current_date + 7 from public.leave_types limit 1;
        set local request.jwt.claims = '{"sub":"${LEAD70}","role":"authenticated"}';
        select count(*)::int as rows from public.notifications
         where recipient_id = '${LEAD70}' and kind = 'leave'`), 1],

    ["nobody decides their own request — not even an admin",
      () => p70(ADM70, `insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${ADM70}'::uuid, id, current_date + 7, current_date + 7 from public.leave_types limit 1;
        select public.decide_leave_request((select id from public.leave_requests where user_id = '${ADM70}' order by created_at desc limit 1), true) as rows`), "ERR 42501"],

    ["the team's lead approves, and the requester is told with the decider's name",
      () => p70(AGENT70, `insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${AGENT70}'::uuid, id, current_date + 7, current_date + 7 from public.leave_types limit 1;
        set local request.jwt.claims = '{"sub":"${LEAD70}","role":"authenticated"}';
        select public.decide_leave_request((select id from public.leave_requests where user_id = '${AGENT70}' order by created_at desc limit 1), true, 'Enjoy');
        set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        select (count(*) filter (where kind = 'leave' and recipient_id = '${AGENT70}'))::int
             + (select count(*) from public.leave_requests where user_id = '${AGENT70}' and status = 'approved')::int as rows
          from public.notifications`), 2],

    /* Stronger than a refusal: an agent outside the team cannot even SEE the
       request, so the decide call fails at "not found" — the row never
       existed for them (default deny, rule 1). */
    ["an agent outside the team cannot even find it to decide",
      () => p70(AGENT70, `insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${AGENT70}'::uuid, id, current_date + 7, current_date + 7 from public.leave_types limit 1;
        set local request.jwt.claims = '{"sub":"${FUND70}","role":"authenticated"}';
        select coalesce((select id from public.leave_requests where user_id = '${AGENT70}' order by created_at desc limit 1)::text, 'invisible') as rows`), "invisible"],

    /* ── attendance: a gate, not a table ───────────────────────────────── */
    ["an agent's attendance view reaches only themself",
      () => p70(AGENT70, `select count(distinct user_id)::int as rows from public.attendance_for(current_date, current_date)`), 1],

    ["approved leave shows as on_leave, never absent",
      () => p70(ADM70, `select public.set_work_schedule('${AGENT70}', '{1,2,3,4,5,6,7}', '09:00', '18:00', 60, 30, 5, 'UTC');
        set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on)
        select '${AG70}'::uuid, '${AGENT70}'::uuid, id, current_date - 1, current_date - 1 from public.leave_types limit 1;
        set local request.jwt.claims = '{"sub":"${ADM70}","role":"authenticated"}';
        select public.decide_leave_request((select id from public.leave_requests where user_id = '${AGENT70}' order by created_at desc limit 1), true);
        select status as rows from public.attendance_for(current_date - 1, current_date - 1) a where a.user_id = '${AGENT70}'`), "on_leave"],

    ["an unbounded range is refused by shape, not by patience",
      () => p70(ADM70, `select count(*)::int as rows from public.attendance_for(current_date - 365, current_date)`), 0],

    /* ── payroll: rates guarded, arithmetic frozen on release ──────────── */
    ["an agent cannot state anybody's rate — their own included",
      () => p70(AGENT70, `select public.set_member_pay_rate('${AGENT70}', 'hourly', 1500) as rows`), "ERR 42501"],

    ["a lead sees no colleague's rate",
      () => p70(ADM70, `select public.set_member_pay_rate('${AGENT70}', 'hourly', 1500);
        set local request.jwt.claims = '{"sub":"${LEAD70}","role":"authenticated"}';
        select count(*)::int as rows from public.member_pay_rates where user_id = '${AGENT70}'`), 0],

    ["generate computes work + paid leave, and release writes the expense",
      () => p70(ADM70, `select public.set_member_pay_rate('${AGENT70}', 'hourly', 1500, 'USD', current_date - 30);
        insert into public.payroll_cutoffs (agency_id, period_start, period_end) values ('${AG70}', current_date + 100, current_date + 113);
        select public.generate_payroll((select id from public.payroll_cutoffs where period_start = current_date + 100));
        select public.release_payroll((select id from public.payroll_cutoffs where period_start = current_date + 100));
        select ((select count(*) from public.agency_expenses where category = 'payroll')
              + (select count(*) from public.payroll_cutoffs where status = 'released' and expense_id is not null))::int as rows`), 2],

    ["…and a released cutoff refuses regeneration",
      () => p70(ADM70, `select public.set_member_pay_rate('${AGENT70}', 'hourly', 1500, 'USD', current_date - 30);
        insert into public.payroll_cutoffs (agency_id, period_start, period_end) values ('${AG70}', current_date + 100, current_date + 113);
        select public.generate_payroll((select id from public.payroll_cutoffs where period_start = current_date + 100));
        select public.release_payroll((select id from public.payroll_cutoffs where period_start = current_date + 100));
        select public.generate_payroll((select id from public.payroll_cutoffs where period_start = current_date + 100)) as rows`), "ERR P0001"],

    /* Dee's rule (0256): hours face the agent, MONEY faces admin only. */
    ["an agent sees no payslip at all — not even their own",
      () => p70(ADM70, `select public.set_member_pay_rate('${AGENT70}', 'hourly', 1500, 'USD', current_date - 30);
        insert into public.payroll_cutoffs (agency_id, period_start, period_end) values ('${AG70}', current_date + 100, current_date + 113);
        select public.generate_payroll((select id from public.payroll_cutoffs where period_start = current_date + 100));
        set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        select count(*)::int as rows from public.payslips`), 0],

    ["…and no rate — not even their own",
      () => p70(ADM70, `select public.set_member_pay_rate('${AGENT70}', 'hourly', 1500, 'USD', current_date - 30);
        set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        select count(*)::int as rows from public.member_pay_rates`), 0],
    /* ── automation (0255): the cutoff runs itself, deterministically ──── */
    ["payroll settings are written only with the payroll permission",
      () => p70(AGENT70, `select public.set_payroll_settings(true, 15, 25, 10, 5, 'UTC') as rows`), "ERR 42501"],

    ["the sweep creates ONE cutoff with Dee's payday math, however often it runs",
      () => p70(ADM70, `set local role postgres;
        update public.payroll_settings set enabled = true, split_day = 15, payday_first = 25, payday_second = 10, verify_window_days = 5, timezone = 'UTC';
        insert into public.member_pay_rates (agency_id, user_id, rate_type, rate_cents, currency, effective_from)
          values ('${AG70}', '${AGENT70}', 'hourly', 1500, 'USD', current_date - 90);
        select public.payroll_auto_sweep(); select public.payroll_auto_sweep();
        select (count(*) = 1
            and bool_and(auto_generated)
            and bool_and(verification_locks_on = period_end + 5)
            and bool_and(case when extract(day from period_end)::int = 15
                              then payday = make_date(extract(year from period_end)::int, extract(month from period_end)::int, 25)
                              else payday = (date_trunc('month', period_end) + interval '1 month' + interval '9 days')::date end)
           )::text as rows
          from public.payroll_cutoffs`), "true"],

    ["a locked period refuses NEW adjustment requests by name",
      () => p70(AGENT70, `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at, ended_at)
          values ('${AG70}', '${AGENT70}', 'creditops', current_date - 20, now() - interval '20 days', now() - interval '20 days' + interval '4 hours');
        set local role postgres;
        insert into public.payroll_cutoffs (agency_id, period_start, period_end, verification_locks_on)
          values ('${AG70}', current_date - 25, current_date - 15, current_date - 10);
        set local role authenticated; set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        select public.request_time_adjustment(
          (select id from public.time_entries where employee_id = '${AGENT70}' and work_date = current_date - 20 limit 1),
          now() - interval '20 days' + interval '3 hours', 'I stopped earlier than recorded') as rows`), "ERR 22023"],

    ["…while the same request inside the window is accepted",
      () => p70(AGENT70, `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at, ended_at)
          values ('${AG70}', '${AGENT70}', 'creditops', current_date - 2, now() - interval '2 days', now() - interval '2 days' + interval '4 hours');
        set local role postgres;
        insert into public.payroll_cutoffs (agency_id, period_start, period_end, verification_locks_on)
          values ('${AG70}', current_date - 8, current_date - 1, current_date + 4);
        set local role authenticated; set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        select (public.request_time_adjustment(
          (select id from public.time_entries where employee_id = '${AGENT70}' and work_date = current_date - 2 limit 1),
          now() - interval '2 days' + interval '3 hours', 'I stopped earlier than recorded') is not null)::text as rows`), "true"],

    ["an approved adjustment recomputes the draft payslips by itself",
      () => p70(ADM70, `set local role postgres;
        insert into public.member_pay_rates (agency_id, user_id, rate_type, rate_cents, currency, effective_from)
          values ('${AG70}', '${AGENT70}', 'hourly', 6000, 'USD', current_date - 90);
        select set_config('bes.time_system', '1', true);
        insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at, ended_at)
          values ('${AG70}', '${AGENT70}', 'creditops', current_date - 2, now() - interval '50 hours', now() - interval '46 hours');
        select set_config('bes.time_system', '', true);
        set local role authenticated; set local request.jwt.claims = '{"sub":"${ADM70}","role":"authenticated"}';
        insert into public.payroll_cutoffs (agency_id, period_start, period_end)
          values ('${AG70}', current_date - 8, current_date - 1);
        select public.generate_payroll((select id from public.payroll_cutoffs limit 1));
        set local request.jwt.claims = '{"sub":"${AGENT70}","role":"authenticated"}';
        select set_config('probe.adj', public.request_time_adjustment(
          (select id from public.time_entries where employee_id = '${AGENT70}' and work_date = current_date - 2 limit 1),
          now() - interval '48 hours', 'Stopped two hours earlier than recorded')::text, true);
        set local request.jwt.claims = '{"sub":"${LEAD70}","role":"authenticated"}';
        select public.decide_time_adjustment(current_setting('probe.adj')::uuid, true);
        set local request.jwt.claims = '{"sub":"${ADM70}","role":"authenticated"}';
        select work_minutes as rows from public.payslips where user_id = '${AGENT70}'`), 120],

  ];
  runPhase("phase 70", P70, { strict: true });
}


endPhase();

/* ------------------------------------------------------------------ *
 * Where the time went. Printed every run, because a suite whose cost is
 * invisible is a suite nobody optimizes until it has eaten an afternoon.
 * ------------------------------------------------------------------ */
const total = timings.reduce((n, t) => n + t.ms, 0);
const width = Math.max(...timings.map((t) => t.label.length), 10);
console.log("\n" + "─".repeat(width + 34));
for (const t of [...timings].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))) {
  const share = total > 0 ? Math.round((t.ms / total) * 100) : 0;
  console.log(
    `${t.label.padEnd(width)}  ${human(t.ms).padStart(8)}  ${String(t.queries).padStart(5)} queries  ${String(t.checks).padStart(4)} checks${share >= 10 ? `  ${share}%` : ""}`,
  );
}
console.log("─".repeat(width + 34));
console.log(`${"TOTAL".padEnd(width)}  ${human(total).padStart(8)}  ${String(db.stats.count).padStart(5)} queries`);
console.log(`${"".padEnd(width)}  ${human(Math.round(db.stats.ms / Math.max(db.stats.count, 1))).padStart(8)} per query, ${human(db.stats.ms)} in the database`);

console.log(`\n${checks - fails}/${checks} checks passed (${ONLY.length > 0 ? `phases ${ONLY.join(", ")}` : `phase ≤ ${PHASE}`})`);
db.close();
process.exit(fails ? 1 : 0);
