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
 *   node supabase/scripts/rls-matrix.mjs --phase 3  # include later phases
 *
 * Exit code is non-zero on any failed check in the requested phases. Run from
 * creditverse-platform/ (the CLI resolves the linked project from there).
 */
import { execFileSync } from "node:child_process";

const PHASE = Number((process.argv.find((a) => a.startsWith("--phase")) ?? "--phase=1").split("=")[1] ?? 1);

const q = (sql) => {
  const out = execFileSync("npx", ["--yes", "supabase@latest", "db", "query", sql, "--linked"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 24,
  });
  const m = out.match(/"rows": (\[[\s\S]*?\n  \])/);
  if (!m) throw new Error("no rows in: " + out.slice(0, 400));
  return JSON.parse(m[1]);
};
const asUser = (uid, selectList) =>
  q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; select ${selectList}; rollback;`)[0];

/* ---------------- truth (admin role, bypasses RLS) ---------------- */
const users = Object.fromEntries(q(`select email, id from public.profiles where email like '%@bes.test'`).map((r) => [r.email, r.id]));
const T = q(`select
  (select count(*) from public.work_items)::int as work_total,
  (select count(*) from public.work_attention)::int as attention_total,
  (select count(*) from public.fulfillment_clients)::int as fclients_total,
  (select count(*) from public.funding_clients)::int as fund_total,
  -- division ceiling ∪ own assignments: "assignment always counts, whatever the ceiling"
  (select count(*) from public.work_items where division='creditops' or assigned_to=(select id from public.profiles where email='bes.manager@bes.test'))::int as work_creditops,
  (select count(*) from public.work_attention where division='creditops' or assigned_to=(select id from public.profiles where email='bes.manager@bes.test'))::int as attention_creditops,
  (select id from public.fulfillment_clients where name='[TEST] Evan Ellis') as lakeside_client,
  (select id from public.fulfillment_clients where organization_id=(select id from public.organizations where name='[TEST] Cedar Financial') limit 1) as cedar_client,
  (select id from public.teams where name like 'CreditOps%Team A%' limit 1) as team_a,
  (select id from public.teams where name like 'CreditOps%Team B%' limit 1) as team_b
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

const E = {
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
  "org.owner@bes.test":  { work: 1, attention: 0, fclients: 2, fund: 1, lakeside_by_id: 1, cedar_by_id: 0, can_update_cedar: 0 },
  "org2.owner@bes.test": { work: 1, attention: 0, fclients: 2, fund: 0, lakeside_by_id: 0, cedar_by_id: 0, can_update_lakeside: 0, can_update_cedar: 0 },
  "probe.agent@bes.test":{ work: 0, attention: 0, fclients: 0, fund: 0, lakeside_by_id: 0, cedar_by_id: 0, can_update_lakeside: 0, can_update_cedar: 0 },
};

let fails = 0, checks = 0;
for (const [email, expected] of Object.entries(E)) {
  const uid = U[email];
  if (!uid) { console.log(`?? ${email} not found`); continue; }
  const got = { ...asUser(uid, S), ...asUserUpdate(uid) };
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

console.log(`\n${checks - fails}/${checks} checks passed (phase ≤ ${PHASE})`);
process.exit(fails ? 1 : 0);
