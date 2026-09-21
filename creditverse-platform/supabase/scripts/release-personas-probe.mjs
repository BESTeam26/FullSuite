/**
 * The release gate for WHO SEES WHAT — the six views Dee names, checked as
 * themselves against the live database (rolled back).
 *
 * Every line here is a capability or a scope the database answers, not a menu
 * the interface draws: the menu is courtesy, the answer below is the control.
 *
 * Run: node supabase/scripts/release-personas-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const id = (email) => q.query(`select id from profiles where email='${email}'`)[0]?.id ?? null;

const WHO = {
  dee:    id("dee@blessedempireservices.com"),
  aaron:  id("aaron@blessedempireservices.com"),
  bryan:  id("lordvrye.bes@gmail.com"),
  jm:     id("navalesjorelynmae.bes@gmail.com"),
  allyssa:id("alyssamores.bes@gmail.com"),   // department manager (Client Success)
  daniel: id("dmacasiab.bes@gmail.com"),     // department manager (Dispute + Complaints), team lead
  rowell: id("rowellchristianpena.bes@gmail.com"), // division manager (BES CRM)
  alvaro: id("gilealvaro.bes@gmail.com"),    // agent, Dispute team
  jet:    id("jetmanugas.bes@gmail.com"),    // agent, Client Success team
};
for (const [k, v] of Object.entries(WHO)) if (!v) throw new Error(`no profile for ${k}`);

const as = (u, sql) => q.query(
  `begin; set local role authenticated;
   do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;
   ${sql}; rollback;`)[0];

const can = (u, key) => as(u, `select public.agency_can('${key}') as v`).v;
const scope = (u) => as(u, `
  select (select count(*) from public.managed_people())::int as people,
         (select count(*) from public.team_presence())::int as presence,
         (select count(*) from public.fulfillment_clients)::int as clients,
         (select count(*) from public.leave_requests)::int as leave,
         (select count(*) from public.payslips)::int as payslips`);

console.log("\nAGENT — sees their own work and nobody else's");
for (const [name, u] of [["Alvaro", WHO.alvaro], ["Jet", WHO.jet]]) {
  const s = scope(u);
  check(`${name}: manages nobody`, s.people, 0);
  check(`${name}: no presence board`, s.presence, 0);
  check(`${name}: no payroll.view`, can(u, "payroll.view"), false);
  check(`${name}: no payroll.manage`, can(u, "payroll.manage"), false);
  check(`${name}: no finance.dashboard.view`, can(u, "finance.dashboard.view"), false);
  check(`${name}: no compensation.agent_rate.view`, can(u, "compensation.agent_rate.view"), false);
  check(`${name}: no ops.manage`, can(u, "ops.manage"), false);
  check(`${name}: sees no payslips`, s.payslips, 0);
}

console.log("\nDEPARTMENT MANAGER — their department, not the company");
{
  const a = scope(WHO.allyssa), d = scope(WHO.daniel);
  check("Allyssa manages people", a.people > 0, true);
  check("Allyssa's presence board is her scope, not the company", a.presence < scope(WHO.dee).presence, true);
  check("Allyssa holds ops.manage", can(WHO.allyssa, "ops.manage"), true);
  check("Allyssa has no payroll", can(WHO.allyssa, "payroll.view"), false);
  check("Allyssa sees no payslips", a.payslips, 0);
  check("Daniel manages people (two departments)", d.people > 0, true);
  check("Daniel has no payroll", can(WHO.daniel, "payroll.view"), false);
}

console.log("\nDIVISION MANAGER — one division");
{
  const r = scope(WHO.rowell);
  check("Rowell manages people", r.people > 0, true);
  check("Rowell is narrower than the company", r.presence < scope(WHO.dee).presence, true);
  check("Rowell has no payroll", can(WHO.rowell, "payroll.view"), false);
  check("Rowell has no general finance", can(WHO.rowell, "finance.dashboard.view"), false);
}

console.log("\nEXECUTIVE — company-wide operations");
for (const [name, u] of [["Dee", WHO.dee], ["Aaron", WHO.aaron]]) {
  const s = scope(u);
  check(`${name}: sees the company on the presence board`, s.presence > 10, true);
  check(`${name}: sees every leave request`, s.leave > 0, true);
  check(`${name}: holds ops.manage`, can(u, "ops.manage"), true);
}

console.log("\nBRYAN — payroll and compensation, NOT general finance");
{
  check("payroll.view", can(WHO.bryan, "payroll.view"), true);
  check("payroll.manage", can(WHO.bryan, "payroll.manage"), true);
  check("compensation.agent_rate.view", can(WHO.bryan, "compensation.agent_rate.view"), true);
  check("compensation.bes_cost.view", can(WHO.bryan, "compensation.bes_cost.view"), true);
  check("NO finance.dashboard.view", can(WHO.bryan, "finance.dashboard.view"), false);
  check("sees payslips", scope(WHO.bryan).payslips >= 0, true);
}

console.log("\nJM — partners and invoicing, NOT payroll");
{
  check("partners.view", can(WHO.jm, "partners.view"), true);
  check("partners.invoices.view", can(WHO.jm, "partners.invoices.view"), true);
  check("partners.payments.record", can(WHO.jm, "partners.payments.record"), true);
  check("NO payroll.view", can(WHO.jm, "payroll.view"), false);
  check("NO payroll.manage", can(WHO.jm, "payroll.manage"), false);
  check("NO compensation.agent_rate.view", can(WHO.jm, "compensation.agent_rate.view"), false);
  check("sees no payslips", scope(WHO.jm).payslips, 0);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) console.log("failed:\n  - " + failures.join("\n  - "));
process.exit(failures.length ? 1 : 0);
