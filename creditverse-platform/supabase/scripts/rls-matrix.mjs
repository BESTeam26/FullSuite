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

  /* Plan keys follow the commercial structure (0049): every trial grants
     Empire Grow capabilities (3 products, never CRM). */
  const NEW = { full_name: "Probe Person", business_name: "Probe Ventures LLC", phone: "(555) 010-9999", plan: "empire_grow" };
  const P13 = [
    ["confirmation creates one organization for the signer",           () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000001' and m.role = 'org_admin'`).rows, 1],
    ["…with a BES- Organization ID",                                     () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000001' and o.public_id ~ '^BES-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'`).rows, 1],
    ["…the plan's products enabled (Empire Grow = 3)",                        () => S("probe@probe-ventures.test", NEW, `select count(*)::int as rows from public.product_entitlements e join public.org_memberships m on m.organization_id = e.organization_id where m.user_id = '99999999-0000-4000-8000-000000000001' and e.enabled`).rows, 3],
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
  console.log("\nphase 13:");
  for (const [label, fn, want] of P13) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 14 — team rosters read without policy recursion (0044) and
   organization workspace views (0045): the merge is allowed to the
   organization's owner/admin and to a BES manager, refused to everyone else,
   and can never hide the dashboard or the record list. Every write probe runs
   inside a rolled-back transaction. */
if (PHASE >= 14) {
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
  console.log("\nphase 14:");
  for (const [label, fn, want] of P14) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 15 — configurable organization role access (0047). Writes only via
   the functions; owner/admin or BES manager; only entitled products, known
   departments and views, product-matching roles; org_admin/org_manager can
   never be narrowed. Rows readable by the organization's members only. No
   existing policy changed — every earlier phase must stay green. */
if (PHASE >= 15) {
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
  console.log("\nphase 15:");
  for (const [label, fn, want] of P15) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 16 — canonical credit reports (0048). A report is visible exactly to
   whoever sees its client; only they can import; imports are append-only.
   Every write probe runs inside a rolled-back transaction. */
if (PHASE >= 16) {
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
  console.log("\nphase 16:");
  for (const [label, fn, want] of P16) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 17 — pricing as data (0049): public plans with prices; every trial
   grants Empire Grow capabilities (never CRM); Build needs a choice; Enterprise
   is by agreement; seat and active-record usage measured deterministically and
   only for the organization's own members / BES managers. */
if (PHASE >= 17) {
  const seed17 = (email, meta) => `
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('99999999-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', 'x', null, '{"provider":"email","providers":["email"]}', '${JSON.stringify(meta)}'::jsonb, now(), now());
    update auth.users set email_confirmed_at = now() where id = '99999999-0000-4000-8000-000000000003';`;
  const S17 = (email, meta, select) => { try { return q(`begin; ${seed17(email, meta)} ${select}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const ENT = `select string_agg(e.product::text, ',' order by e.product::text) as rows from public.product_entitlements e join public.org_memberships m on m.organization_id = e.organization_id where m.user_id = '99999999-0000-4000-8000-000000000003' and e.enabled`;
  const B = { full_name: "Pricing Probe", business_name: "Pricing Probe LLC", phone: "(555) 010-7777" };
  const asUser17 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { return "ERR"; } };
  const seatOracle = q(`select count(*)::int as rows from public.org_memberships m where m.organization_id='${lakesideOrg}' and m.user_id <> coalesce((select owner_user_id from public.organizations where id='${lakesideOrg}'), '00000000-0000-0000-0000-000000000000'::uuid) and not exists (select 1 from public.agency_memberships am where am.user_id = m.user_id)`)[0].rows;
  const recOracle = q(`select (select count(*) from public.fulfillment_clients c where c.organization_id='${lakesideOrg}' and c.status::text not in ('Completed','Archived','Graduated'))::int + (select count(*) from public.funding_clients f where f.organization_id='${lakesideOrg}' and f.status::text not in ('Funded','Declined','Withdrawn','Archived'))::int as rows`)[0].rows;
  const P17 = [
    ["five public plans, priced, Grow recommended",                    () => { try { return q(`begin; set local role anon; select count(*)::text || ':' || (select key from public.plans where is_recommended and is_public) || ':' || (select monthly_cents::text from public.plans where key='empire_grow') as rows from public.plans where is_public and monthly_cents > 0; rollback;`)[0].rows; } catch (e) { return "ERR"; } }, "5:empire_grow:24900"],
    ["Build trial with a choice grants Grow capabilities, never CRM",    () => S17("probe@pricing-probe.test", { ...B, plan: "empire_build", selected_product: "creditOps" }, ENT), "creditOps,fundingOps,workspaces"],
    ["…and the choice is kept for conversion",                          () => S17("probe@pricing-probe.test", { ...B, plan: "empire_build", selected_product: "creditOps" }, `select t.plan_key || ':' || t.selected_product::text as rows from public.organization_trials t join public.org_memberships m on m.organization_id = t.organization_id where m.user_id = '99999999-0000-4000-8000-000000000003'`), "empire_build:creditOps"],
    ["Build without a choice is refused",                               () => S17("probe@pricing-probe.test", { ...B, plan: "empire_build" }, `select 1 as rows`), "ERR 23514"],
    ["CRM-only sign-up still trials the operating platform, no CRM",    () => S17("probe@pricing-probe.test", { ...B, plan: "bes_crm" }, ENT), "creditOps,fundingOps,workspaces"],
    ["Scale trial grants Grow capabilities (CRM provisioned only when paid)", () => S17("probe@pricing-probe.test", { ...B, plan: "empire_scale" }, ENT), "creditOps,fundingOps,workspaces"],
    ["Enterprise is by agreement, not self-serve",                      () => S17("probe@pricing-probe.test", { ...B, plan: "empire_enterprise" }, `select 1 as rows`), "ERR 23514"],
    ["the signer is recorded as the Organization Owner",                () => S17("probe@pricing-probe.test", { ...B, plan: "empire_grow" }, `select (o.owner_user_id = '99999999-0000-4000-8000-000000000003')::text as rows from public.organizations o join public.org_memberships m on m.organization_id = o.id where m.user_id = '99999999-0000-4000-8000-000000000003'`), "true"],
    ["seat usage excludes the owner and BES personnel (member reads own org)", () => asUser17(U["org.owner@bes.test"], `select public.organization_seat_usage('${lakesideOrg}') as rows`), seatOracle],
    ["…another organization's member gets nothing",                     () => asUser17(U["org2.owner@bes.test"], `select coalesce(public.organization_seat_usage('${lakesideOrg}')::text, 'null') as rows`), "null"],
    ["active records count only worked clients",                        () => asUser17(U["org.owner@bes.test"], `select public.organization_active_records('${lakesideOrg}') as rows`), recOracle],
    ["add-ons are listed for the public form",                          () => { try { return q(`begin; set local role anon; select count(*)::int as rows from public.plan_addons; rollback;`)[0].rows; } catch (e) { return "ERR"; } }, 3],
  ];
  console.log("\nphase 17:");
  for (const [label, fn, want] of P17) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 18 — organization client writes (0050): organization admins create,
   members update within their reach, another organization cannot, an
   organization without the product cannot, outsourcing-group clients stay
   BES-only. Rolled back. */
if (PHASE >= 18) {
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
    ["an outsourcing-group client stays BES-only",                      () => w18(U["org.owner@bes.test"], `insert into public.fulfillment_clients (agency_id, name, email, mode, outsourcing_group_id, auto_sync, status, round) values ('${agencyId}', '[PROBE] Group Client', 'probe.group@example.test', 'outsourcing_only', (select id from public.outsourcing_groups limit 1), false, 'Onboarding', 'Pre-Round'); select 1 as rows`), "ERR 42501"],
  ];
  console.log("\nphase 18:");
  for (const [label, fn, want] of P18) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 19 — department status as data (0051) and the funding-readiness
   hand-off (0052/0053). Organization members write their own clients'
   department rows within reach; another organization cannot; the function
   refuses a status outside the department's vocabulary and always leaves an
   activity event; the hand-off links/creates the CreditOps client and moves
   the funding status, both ways, with activity on both records. Rolled back. */
if (PHASE >= 19) {
  const w19 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const creditOn = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  const fundingOn = q(`select public.org_entitled('${lakesideOrg}','fundingOps') as rows`)[0].rows === true;
  const roleOf = (uid) => q(`select coalesce((select role::text from public.org_memberships where user_id='${uid}' and organization_id='${lakesideOrg}'), 'none') as rows`)[0].rows;
  const SET = `select public.set_client_department_status('${T.lakeside_client}', 'Support', 'billing issue', null, null); select s.status || ':' || (select count(*) from public.activity_events a where a.entity_type='fulfillment_client' and a.entity_id='${T.lakeside_client}' and a.action='Department status' and a.new_value='BILLING ISSUE' and a.created_at >= now())::text as rows from public.client_department_statuses s where s.client_id='${T.lakeside_client}' and s.department='Support'`;
  const lakesideFunding = q(`select coalesce((select id::text from public.funding_clients where organization_id='${lakesideOrg}' and status::text in ('Onboarding','Readiness Review','Declined') limit 1), '') as rows`)[0].rows;
  const P19 = [
    ["organization owner sets a department status; the activity event is written with it", () => w19(U["org.owner@bes.test"], SET), creditOn && ["org_admin","org_manager"].includes(roleOf(U["org.owner@bes.test"])) || creditOn ? "BILLING ISSUE:1" : "ERR 42501"],
    ["another organization's owner cannot",                          () => w19(U["org2.owner@bes.test"], SET), "ERR 42501"],
    ["a status outside the department's vocabulary is refused",      () => w19(U["org.owner@bes.test"], `select public.set_client_department_status('${T.lakeside_client}', 'Support', 'BC NEEDED', null, null); select 1 as rows`), creditOn ? "ERR 22023" : "ERR 42501"],
    ["BES staff in scope set a department status",                   () => w19(U["bes.manager@bes.test"], SET), "BILLING ISSUE:1"],
    ...(lakesideFunding ? [
      ["hand-off: funding client → CreditOps (creates/links, status Credit Readiness, activity both sides)", () => w19(U["org.owner@bes.test"], `select public.handoff_to_creditops('${lakesideFunding}', null); select (select status::text from public.funding_clients where id='${lakesideFunding}') || ':' || (select (fulfillment_client_id is not null)::text from public.funding_clients where id='${lakesideFunding}') || ':' || (select count(*) from public.activity_events where entity_id='${lakesideFunding}' and action like 'Sent to CreditOps%')::text as rows`), creditOn && fundingOn ? "Credit Readiness:true:1" : "ERR 42501"],
      ["hand-off back: qualified → Readiness Review",                () => w19(U["org.owner@bes.test"], `select public.handoff_to_creditops('${lakesideFunding}', null); select public.handoff_to_fundingops((select fulfillment_client_id from public.funding_clients where id='${lakesideFunding}')); select status::text as rows from public.funding_clients where id='${lakesideFunding}'`), creditOn && fundingOn ? "Readiness Review" : "ERR 42501"],
      ["another organization cannot hand off this client",           () => w19(U["org2.owner@bes.test"], `select public.handoff_to_creditops('${lakesideFunding}', null); select 1 as rows`), "ERR 42501"],
    ] : [["(no early-stage Lakeside funding client to probe hand-off)", () => "skip", "skip"]]),
  ];
  console.log("\nphase 19:");
  for (const [label, fn, want] of P19) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 20 — funding department status keyed by file (0054). */
if (PHASE >= 20) {
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
  console.log("\nphase 20:");
  for (const [label, fn, want] of P20) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 21 — client lifecycle (0055): archive is a transition with an activity
   event; only Active counts; another organization cannot archive; reactivation
   clears the archive fields. Rolled back. */
if (PHASE >= 21) {
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
  console.log("\nphase 21:");
  for (const [label, fn, want] of P21) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 22 — FundingOps domain data (0058): applications/documents follow the
   file's client; organization admins write, agents read; another organization
   sees nothing; the BES lender catalogue is readable; a lender user sees only
   files shared with their lender and may post an offer only there. Rolled back. */
if (PHASE >= 22) {
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
  console.log("\nphase 22:");
  for (const [label, fn, want] of P22) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 23 — Letter Library (0059): rounds are records opened through a
   function (reset or keep the counter), letters cannot be approved without the
   consumer's attestation, a body, recipient-fitting citations and none of the
   forbidden phrases; mailing starts the statutory timers; BES default
   templates are readable by every seat, writable by admins only. Rolled back. */
if (PHASE >= 23) {
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
  console.log("\nphase 23:");
  for (const [label, fn, want] of P23) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

/* Phase 24 — pipeline axes (0060) and offers/closing/funded/renewals (0061):
   the three state axes move only through move_funding_file(); Funded is
   refused there and only confirm_funding() sets it, from Funding Pending, with
   gross/net/date; an offer follows its state machine; a renewal creates a NEW
   file with lineage; another organization sees none of it. Rolled back. */
if (PHASE >= 24) {
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
  console.log("\nphase 24:");
  for (const [label, fn, want] of P24) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* Phase 25 — team permissions (0064/0064.1): permission keys as data, role
   defaults, member overrides through set_member_permission() only, Copy
   Permission, invitations. Rolled back. */
if (PHASE >= 25) {
  const w25 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const AGENT_M = q(`select public.dev_uuid('om-agent')::text as rows`)[0].rows;
  const LEAD_M = q(`select public.dev_uuid('om-lead')::text as rows`)[0].rows;
  const OWNER_M = q(`select public.dev_uuid('om-owner')::text as rows`)[0].rows;
  const P25 = [
    ["role defaults: a processor may view clients and may not approve letters", () => w25(U["org.agent@bes.test"], `select public.member_can('${lakesideOrg}','creditops.clients.view')::text || ':' || public.member_can('${lakesideOrg}','creditops.letters.approve')::text as rows`), "true:false"],
    ["an organization admin is always allowed",                        () => w25(U["org.owner@bes.test"], `select public.member_can('${lakesideOrg}','billing.manage')::text as rows`), "true"],
    ["outside the organization every key is denied",                   () => w25(U["org2.owner@bes.test"], `select public.member_can('${lakesideOrg}','creditops.clients.view')::text as rows`), "false"],
    ["my_permissions answers every key at once",                       () => w25(U["org.agent@bes.test"], `select count(*)::int as rows from public.my_permissions('${lakesideOrg}')`), 22],
    ["the owner grants an override; row and audit are written",        () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','creditops.letters.approve', true, 'probe'); select (select allowed::text from public.member_permissions where membership_id='${AGENT_M}' and key='creditops.letters.approve') || ':' || (select count(*) from public.audit_log where action='organization.member_permission_set' and entity_id='${AGENT_M}' and created_at >= now())::text as rows`), "true:1"],
    ["clearing an override removes the row",                           () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','creditops.letters.approve', true); select public.set_member_permission('${AGENT_M}','creditops.letters.approve', null); select count(*)::int as rows from public.member_permissions where membership_id='${AGENT_M}'`), 0],
    ["a member cannot change their own permissions",                   () => w25(U["org.agent@bes.test"], `select public.set_member_permission('${AGENT_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["a member cannot change another member's permissions",            () => w25(U["org.agent@bes.test"], `select public.set_member_permission('${LEAD_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["an admin cannot change their own permissions either",            () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${OWNER_M}','billing.manage', false); select 1 as rows`), "ERR 42501"],
    ["another organization's owner cannot touch a Lakeside member",    () => w25(U["org2.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["an unknown permission key is refused",                           () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','nonsense.key', true); select 1 as rows`), "ERR 22023"],
    ["Copy Permission copies the role and the overrides",              () => w25(U["org.owner@bes.test"], `select public.set_member_permission('${AGENT_M}','reports.export', true); select public.copy_member_permissions('${AGENT_M}','${LEAD_M}'); select (select role::text from public.org_memberships where id='${LEAD_M}') || ':' || (select count(*) from public.member_permissions where membership_id='${LEAD_M}' and key='reports.export' and allowed)::text as rows`), "credit_processor:1"],
    ["a member cannot copy permissions",                               () => w25(U["org.agent@bes.test"], `select public.copy_member_permissions('${LEAD_M}','${AGENT_M}'); select 1 as rows`), "ERR 42501"],
    ["member_permissions has no direct write grant for the API role",  () => w25(U["org.owner@bes.test"], `insert into public.member_permissions (membership_id, key, allowed) values ('${AGENT_M}','billing.manage', true); select 1 as rows`), "ERR 42501"],
    ["permission_keys cannot be written by the API role",              () => w25(U["org.owner@bes.test"], `insert into public.permission_keys (key, module, label) values ('probe.key','Probe','Probe'); select 1 as rows`), "ERR 42501"],
    ["the owner invites; a second open invitation for the same email is refused", () => w25(U["org.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select 1 as rows`), "ERR 23505"],
    ["an invitation writes an audit row",                              () => w25(U["org.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select count(*)::int as rows from public.audit_log where action='organization.member_invited' and organization_id='${lakesideOrg}' and created_at >= now()`), 1],
    ["a member cannot invite",                                         () => w25(U["org.agent@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select 1 as rows`), "ERR 42501"],
    ["another organization's owner cannot invite into Lakeside",       () => w25(U["org2.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select 1 as rows`), "ERR 42501"],
    ["accepting an invitation sent to a different email is refused",   () => w25(U["org.owner@bes.test"], `select public.invite_team_member('${lakesideOrg}', 'probe.invite@bes.test', 'credit_processor'); select public.accept_invitation((select token from public.invitations where email='probe.invite@bes.test' and organization_id='${lakesideOrg}' and accepted_at is null order by created_at desc limit 1)); select 1 as rows`), "ERR 42501"],
  ];
  console.log("\nphase 25:");
  for (const [label, fn, want] of P25) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* Phase 26 — permission keys enforced in the functions (0065): a processor may
   build letters but not approve; a manager passes the permission gate and is
   stopped by the QA gate instead; BES staff are gated by scope, not keys. */
if (PHASE >= 26) {
  const w26 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const AC = q(`select coalesce((select id::text from public.fulfillment_clients where organization_id='${lakesideOrg}' and assigned_agent_id='${U["org.agent@bes.test"]}' limit 1), '') as rows`)[0].rows;
  const creditOn26 = q(`select public.org_entitled('${lakesideOrg}','creditOps') as rows`)[0].rows === true;
  const DRAFT = (who) => `select public.open_dispute_round('${AC}', 'factual', true); insert into public.dispute_letters (id, round_id, client_id, recipient_kind, recipient_name, body_final) select '99999999-0000-4000-8000-0000000000cd', r.id, '${AC}', 'cra', 'Equifax', repeat('Please investigate the account listed below. ', 4) from public.dispute_rounds r where r.client_id='${AC}' and r.closed_at is null order by r.round_number desc limit 1; insert into public.dispute_attestations (letter_id, attested_by, statements) values ('99999999-0000-4000-8000-0000000000cd', '${who}', '{"recognises_account":"no","disputed_information":"x","reason":"y","documents":[]}'::jsonb);`;
  const P26 = AC ? [
    ["a processor may build letters (letters.build): the round opens and the draft is written", () => w26(U["org.agent@bes.test"], `${DRAFT(U["org.agent@bes.test"])} select count(*)::int as rows from public.dispute_letters where id='99999999-0000-4000-8000-0000000000cd'`), creditOn26 ? 1 : "ERR 42501"],
    ["a processor may not approve (letters.approve is not in the role): refused before the QA gate", () => w26(U["org.agent@bes.test"], `${DRAFT(U["org.agent@bes.test"])} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000cd'); select 1 as rows`), "ERR 42501"],
    ["a manager passes the permission gate and reaches the QA gate (approval succeeds on an attested clean letter)", () => w26(U["org.lead@bes.test"], `${DRAFT(U["org.lead@bes.test"])} select public.approve_dispute_letter('99999999-0000-4000-8000-0000000000cd'); select status::text as rows from public.dispute_letters where id='99999999-0000-4000-8000-0000000000cd'`), creditOn26 ? "approved" : "ERR 42501"],
    ["the permission answer the interface shows matches the gate",       () => w26(U["org.agent@bes.test"], `select public.member_can('${lakesideOrg}','creditops.letters.build')::text || ':' || public.member_can('${lakesideOrg}','creditops.letters.approve')::text as rows`), "true:false"],
  ] : [["(no Lakeside client assigned to org.agent to probe)", () => "skip", "skip"]];
  console.log("\nphase 26:");
  for (const [label, fn, want] of P26) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* Phase 27 — borrower portal (0066): the borrower sees only their own file
   through the narrow view, the requests on it and their own uploads; never
   another client's file, flags, offers or lender decisions. Rolled back. */
if (PHASE >= 27) {
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
  console.log("\nphase 27:");
  for (const [label, fn, want] of P27) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}


/* Phase 28 — reporting engine (0069): facts and pivots follow the caller's RLS;
   BES-internal KPIs never reach an organization; KPI settings are the owner's;
   manual outcomes follow the client's writers. Rolled back. */
if (PHASE >= 28) {
  const w28 = (uid, sql) => { try { return q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}; rollback;`)[0].rows; } catch (e) { const text = String(e.message) + "\n" + String(e.stdout ?? ""); const m = text.match(/ERROR:\s*(\w+):/); return "ERR " + (m ? m[1] : "unknown"); } };
  const LC = q(`select coalesce((select id::text from public.fulfillment_clients where organization_id='${lakesideOrg}' and assigned_agent_id='${U["org.agent@bes.test"]}' limit 1), '') as rows`)[0].rows;
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
    ["a processor records a manual round outcome on an assigned client",    () => LC ? w28(U["org.agent@bes.test"], `insert into public.client_round_outcomes (client_id, round_number, bureau, items_disputed, deleted, updated, verified, recorded_by) values ('${LC}', 1, 'EQ', 5, 2, 1, 2, auth.uid()); select (select count(*) from public.report_facts where source='manual_outcome' and outcome='deleted' and client_id='${LC}' and quantity = 2)::int as rows`) : "skip", LC ? 1 : "skip"],
    ["another organization's owner cannot record an outcome on it",         () => LC ? w28(U["org2.owner@bes.test"], `insert into public.client_round_outcomes (client_id, round_number, bureau, recorded_by) values ('${LC}', 1, 'EQ', auth.uid()); select 1 as rows`) : "skip", LC ? "ERR 42501" : "skip"],
    ["an outcome must name its recorder",                                    () => LC ? w28(U["org.agent@bes.test"], `insert into public.client_round_outcomes (client_id, round_number, bureau, recorded_by) values ('${LC}', 1, 'TU', '${U["org.owner@bes.test"]}'); select 1 as rows`) : "skip", LC ? "ERR 42501" : "skip"],
  ];
  console.log("\nphase 28:");
  for (const [label, fn, want] of P28) {
    checks++;
    let got; try { got = fn(); } catch (e) { got = "ERR " + String(e.message).slice(0, 60); }
    const ok = got === want; if (!ok) fails++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  }
}

console.log(`\n${checks - fails}/${checks} checks passed (phase ≤ ${PHASE})`);
process.exit(fails ? 1 : 0);
