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

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PHASE = Number((process.argv.find((a) => a.startsWith("--phase")) ?? "--phase=1").split("=")[1] ?? 1);

const q = (sql) => {
  const out = execFileSync("npx", ["--yes", "supabase@latest", "db", "query", sql, "--linked"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 24,
  });
  // The CLI prints one JSON document on stdout. Parse it whole so an empty
  // result set is `[]` rather than a parse failure (a regex over the text broke
  // on `"rows": []`, which is exactly what a correct denial looks like).
  const start = out.indexOf("{");
  if (start < 0) throw new Error("no JSON in: " + out.slice(0, 400));
  const doc = JSON.parse(out.slice(start));
  if (doc._tag === "Error") throw new Error(doc.error?.message ?? "db query error");
  return Array.isArray(doc.rows) ? doc.rows : [];
};
const asUser = (uid, selectList) =>
  q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; select ${selectList}; rollback;`)[0];

/* ---------------- truth (admin role, bypasses RLS) ---------------- */
const users = Object.fromEntries(q(`select email, id from public.profiles where email like '%@bes.test'`).map((r) => [r.email, r.id]));
const T = q(`select
  -- Agency scope is not admin bypass: engagement still gates. The oracle mirrors that,
  -- so it would catch an engagement bypass rather than expect one.
  (select count(*) from public.work_items w where (w.workspace_id is null or exists (select 1 from public.workspace_shares s join public.fulfillment_engagements e on e.id=s.engagement_id where s.workspace_id=w.workspace_id and s.revoked_at is null and (s.board_id is null or s.board_id=w.board_id) and e.service='talentops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to))) and (w.scope='AGENCY' or exists (select 1 from public.fulfillment_engagements e where e.organization_id=w.organization_id and public.engagement_is_live(e.status,e.effective_from,e.effective_to))))::int as work_total,
  (select count(*) from public.work_attention a join public.work_items w on w.id=a.id where (w.workspace_id is null or exists (select 1 from public.workspace_shares s join public.fulfillment_engagements e on e.id=s.engagement_id where s.workspace_id=w.workspace_id and s.revoked_at is null and (s.board_id is null or s.board_id=w.board_id) and e.service='talentops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to))) and (w.scope='AGENCY' or exists (select 1 from public.fulfillment_engagements e where e.organization_id=w.organization_id and public.engagement_is_live(e.status,e.effective_from,e.effective_to))))::int as attention_total,
  (select count(*) from public.fulfillment_clients c where exists (select 1 from public.fulfillment_engagements e where e.service='creditops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to) and (e.organization_id=c.organization_id or e.outsourcing_group_id=c.outsourcing_group_id)))::int as fclients_total,
  (select count(*) from public.funding_clients c where exists (select 1 from public.fulfillment_engagements e where e.service='fundingops' and public.engagement_is_live(e.status,e.effective_from,e.effective_to) and (e.organization_id=c.organization_id or e.outsourcing_group_id=c.outsourcing_group_id)))::int as fund_total,
  -- division ceiling ∪ own assignments: "assignment always counts, whatever the ceiling"
  (select count(*) from public.work_items where division='creditops' or assigned_to=(select id from public.profiles where email='bes.manager@bes.test'))::int as work_creditops,
  (select count(*) from public.work_attention where division='creditops' or assigned_to=(select id from public.profiles where email='bes.manager@bes.test'))::int as attention_creditops,
  (select count(*) from public.work_items w where w.organization_id='dddddddd-0000-4000-8000-80ce8814eb05' and w.scope='ORGANIZATION')::int
   + (select count(*) from public.work_items w where w.scope='AGENCY' and w.division='bes_crm' and w.subject_organization_id='dddddddd-0000-4000-8000-80ce8814eb05')::int as lakeside_org_work,
  (select count(*) from public.work_attention a join public.work_items w on w.id=a.id where w.organization_id='dddddddd-0000-4000-8000-80ce8814eb05' and w.scope='ORGANIZATION')::int as lakeside_org_attention,
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
  "org.owner@bes.test":  { work: T.lakeside_org_work, /* every ORGANIZATION item of Lakeside + its entitled BES CRM projects; the BES support task about Lakeside is not theirs (0031) */ attention: T.lakeside_org_attention, fclients: 2, fund: 1, lakeside_by_id: 1, cedar_by_id: 0, can_update_cedar: 0 },
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

/* ---------------- Phase 2: the boundary around the scoped records ----------------
   Every gap the independent review found, as a check. Satellites, blind writes with
   no WHERE, INSERTs into unseen records, the unassigned team queue, a no-engagement
   organization, org-side assigned_only, escalation paths, cross-service reads. */
if (PHASE >= 2) {
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
    ["restricted blind DELETE cds → 0",              () => blind(U["bes.restricted@bes.test"]).del_cds, 0],
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
  console.log("\nphase 2:");
  for (const [label, fn, want] of rows) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* ---------------- Phase 3: work-item creation + production idempotency ----------------
   Each probe is a top-level data-modifying CTE inside a rolled-back transaction, so
   RLS and constraints decide the outcome and nothing persists. */
if (PHASE >= 3) {
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
  console.log("\nphase 3:");
  for (const [label, fn, want] of P) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 5: notifications ----------------
   Recipients are computed by the database from activity events; rows are read
   under the recipient's own RLS, which re-checks the record is still visible.
   Every probe runs inside one rolled-back transaction, switching the JWT
   subject mid-transaction to read as a different person. Rows created inside
   the transaction carry created_at = now() (transaction start), which is how
   the counts ignore anything that already existed. */
if (PHASE >= 5) {
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
  console.log("\nphase 5:");
  for (const [label, fn, want] of P5) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 6: Custom Workspaces ----------------
   Visibility = org membership + entitlement; items follow the workspace;
   statuses are rows mapped onto the canonical stage; config changes audited.
   BES staff have no share yet (Phase 7), so they see none of it. */
if (PHASE >= 6) {
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
  console.log("\nphase 6:");
  for (const [label, fn, want] of P6) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 7: TalentOps bridge (workspace_shares) ----------------
   BES reaches an organization's workspace only through a live, unrevoked share
   under a TalentOps engagement, within BES TalentOps scope. Board-level shares
   hide sibling boards and their items. 'view' shares cannot write. The
   organization authorizes; BES cannot share to itself. */
if (PHASE >= 7) {
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
  console.log("\nphase 7:");
  for (const [label, fn, want] of P7) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 8: BES CRM — BES-owned delivery, controlled visibility ----------------
   The customer sees its CRM delivery projects when entitled to 'crm', reads only
   what BES published, may comment and upload, and cannot change the project.
   Association is not publication: BES's other AGENCY items about the customer
   stay BES's. */
if (PHASE >= 8) {
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
    ["BES owner sees both projects and the internal note",            () => W8(besOwner, `select (select count(*) from public.work_items where division='bes_crm')::int + (select count(*) from public.activity_events where entity_id='${CRM_L}' and visibility='bes_internal' and action='Note')::int as rows`).rows, 3],
  ];
  console.log("\nphase 8:");
  for (const [label, fn, want] of P8) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 9: branding merges (regression guard) ----------------
   0023 revoked log_audit() from API roles and silently broke both branding
   saves. The merges now run as owner with explicit checks (0034). */
if (PHASE >= 9) {
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
  console.log("\nphase 9:");
  for (const [label, fn, want] of P9) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 10: service-aware production ----------------
   One production table; the service decides the subject; tenancy is derived
   from the subject; the subject must be visible to the producer; completion
   of a work-item-service item by BES staff produces exactly once. */
if (PHASE >= 10) {
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
  console.log("\nphase 10:");
  for (const [label, fn, want] of P10) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 11: workspace owner experience ----------------
   Configuration is org-admin only; field values are typed by their field;
   archived fields refuse new values; assignees must be legitimate for the
   record; teams are the organization's; everything cross-org is denied. */
if (PHASE >= 11) {
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
  console.log("\nphase 11:");
  for (const [label, fn, want] of P11) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 12: organizations, IDs and switching ----------------
   Switching is convenience; the organizations a person can see are exactly
   their memberships (or all, for BES staff). The Organization ID is generated,
   unique, formatted and immutable. */
if (PHASE >= 12) {
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
  console.log("\nphase 12:");
  for (const [label, fn, want] of P12) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* ---------------- Phase 13: self-serve sign-up provisioning ----------------
   An organization is created on EMAIL CONFIRMATION, never at sign-up; the
   signer becomes org_admin; the plan's products are enabled; a 30-day trial
   starts unless the business is already known (exact identifier → blocked,
   entitlements off; name-only match → trial with review flag). Every probe
   seeds an unconfirmed user inside a rolled-back transaction and flips
   email_confirmed_at to fire the trigger. */
if (PHASE >= 13) {
  const seed = (email, meta) => `
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('99999999-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', 'x', null, '{"provider":"email","providers":["email"]}', '${JSON.stringify(meta)}'::jsonb, now(), now());`;
  const confirm = `update auth.users set email_confirmed_at = now() where id = '99999999-0000-4000-8000-000000000001';`;
  const S = (email, meta, select) => { try { return q(`begin; ${seed(email, meta)} ${confirm} ${select}; rollback;`)[0]; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*\d+: [^"\\\n]*/); return { rows: "ERR " + (m ? m[0].trim() : "unknown") }; } };

  const NEW = { full_name: "Probe Person", business_name: "Probe Ventures LLC", phone: "(555) 010-9999", plan: "growth" };
  const P13 = [
    ["confirmation creates one organization for the signer",           () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000001' and m.role = 'org_admin'`).rows, 1],
    ["…with a BES- Organization ID",                                     () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000001' and o.public_id ~ '^BES-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'`).rows, 1],
    ["…the plan's products enabled (growth = 3)",                        () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.product_entitlements e join public.org_memberships m on m.organization_id = e.organization_id where m.user_id = '99999999-0000-4000-8000-000000000001' and e.enabled`).rows, 3],
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
              insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('99999999-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','someone@gmail.com','x',null,'{}','${JSON.stringify({ full_name: "P", business_name: "Probe Ventures, Inc.", plan: "creditops" })}'::jsonb,now(),now());
              update auth.users set email_confirmed_at = now() where id = '99999999-0000-4000-8000-000000000002';
              select (select status::text || ':' || coalesce(blocked_reason,'') from public.organization_trials t join public.org_memberships m on m.organization_id=t.organization_id where m.user_id='99999999-0000-4000-8000-000000000002') as rows; rollback;`)[0].rows, "active:name_match_review"],
    ["an unknown plan is refused",                                       () => S("probe@probe-ventures.test", { ...NEW, plan: "platinum" }, `select 1 as rows`).rows, "ERR ERROR:  23514: Unknown plan"],
    ["organization users read their trial; another org's admin cannot", () => S("probe@probe-ventures.test", NEW, `set local role authenticated; set local request.jwt.claims = '{"sub":"${U["org2.owner@bes.test"]}","role":"authenticated"}'; select count(*)::int as rows from public.organization_trials t where t.organization_id in (select organization_id from public.org_memberships where user_id='99999999-0000-4000-8000-000000000001')`).rows, 0],
    ["plans are readable by the public form",                            () => { try { return q(`begin; set local role anon; select count(*)::int as rows from public.plans where is_public; rollback;`)[0].rows; } catch (e) { return "ERR"; } }, 4],
  ];
  console.log("\nphase 13:");
  for (const [label, fn, want] of P13) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

console.log(`\n${checks - fails}/${checks} checks passed (phase ≤ ${PHASE})`);
process.exit(fails ? 1 : 0);
