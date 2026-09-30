#!/usr/bin/env node
/**
 * The CreditOps latency gate: every real user path, timed in the live
 * database AS a real executive AND AS a real agent, with RLS on.
 *
 * Dee, 2026-09-30: "performance should be measured from an actual agent
 * account, not only Dee/admin… admin could look acceptable while agents were
 * waiting 10–13 seconds. That difference must never slip through again."
 *
 * Every path has a threshold — a REGRESSION guard with headroom over the
 * measured median (live numbers move ±100 ms with the day's load), not the
 * target. Targets are Dee's: ~300 ms for counts and Activity, ~500 ms for a
 * list or queue. A path over its threshold fails the probe, and
 * the probe is part of the release gate — so a future change cannot quietly
 * take agents back from 200 ms to 10 s. Superuser timings are meaningless
 * here: the policies are most of the work, which is why each statement runs
 * as the authenticated role with the person's JWT claim.
 *
 *   node supabase/scripts/creditops-latency-probe.mjs            # gate
 *   node supabase/scripts/creditops-latency-probe.mjs --report   # table only
 *
 * The accounts are chosen by ROLE from the live roster — the first active
 * agency_admin and the first active CreditOps agent on a live team — never
 * by name, so a roster change does not turn the gate red.
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const reportOnly = process.argv.includes("--report");

const pick = (where, order = "p.full_name") => q.query(`select m.user_id, coalesce(p.full_name,p.email) as name
  from agency_memberships m join profiles p on p.id=m.user_id
  where m.status='active' and not coalesce(p.is_fixture,false) and (${where}) order by ${order} limit 1`)[0];
const onCreditOpsTeam = `exists (select 1 from team_memberships tm join teams t on t.id=tm.team_id and t.archived_at is null join departments d on d.id=t.department_id where tm.user_id=m.user_id and d.division='creditops')`;
const seat = (kind) => `exists (select 1 from management_seats s where s.user_id=m.user_id and s.seat='${kind}' and seat_is_live(s.effective_from, s.effective_to))`;
const exec     = pick(`m.role='agency_admin'`, "m.is_owner desc nulls last, p.full_name");
const division = pick(seat("division_manager"));
const departmt = pick(seat("department_manager"));
const lead     = pick(`m.role='agency_user' and exists (select 1 from team_memberships tm join teams t on t.id=tm.team_id and t.archived_at is null join departments d on d.id=t.department_id where tm.user_id=m.user_id and tm.is_lead and d.division='creditops')`,
  `(case when ${seat("department_manager")} or ${seat("division_manager")} then 1 else 0 end), p.full_name`);
const agent    = pick(`m.role='agency_user' and m.can_receive_production_work and ${onCreditOpsTeam} and not exists (select 1 from team_memberships tm where tm.user_id=m.user_id and tm.is_lead) and not exists (select 1 from management_seats s where s.user_id=m.user_id and seat_is_live(s.effective_from, s.effective_to))`);
const outsider = pick(`m.role='agency_user' and not ${onCreditOpsTeam} and not exists (select 1 from management_seats s left join divisions dv on dv.id=s.division_id left join departments sd on sd.id=s.department_id where s.user_id=m.user_id and seat_is_live(s.effective_from, s.effective_to) and (dv.service='creditops' or sd.division='creditops')) and not exists (select 1 from partner_assignments pa where pa.user_id=m.user_id and pa.ended_on is null)`);
if (!exec || !agent) { console.error("no executive or no CreditOps agent on the roster"); process.exit(2); }

/* A real file each person can see, with the most activity, so the timeline
   paths measure a real load. The visible set is read AS the person (cheap:
   the client policy is set-based); the activity count is read as the probe
   itself, because counting events under RLS for every client is exactly the
   per-row cost this probe exists to catch. */
const busiest = (uid) => {
  const visible = q.query(`begin; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}', true);
    select fc.id from fulfillment_clients fc where fc.archived_at is null and not fc.is_fixture; rollback;`).map((r) => r.id);
  if (visible.length === 0) return null;
  return q.query(`select a.entity_id as id from activity_events a
     where a.entity_type = 'fulfillment_client' and a.entity_id in (${visible.map((v) => `'${v}'`).join(",")})
     group by 1 order by count(*) desc limit 1`)[0]?.id ?? visible[0];
};

const timeAs = (uid, sql) => {
  const rows = q.query(`begin; set local role authenticated; set local statement_timeout='60s';
    select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}', true);
    explain (analyze, format json) ${sql}; rollback;`);
  const raw = rows[0]["QUERY PLAN"]; const plan = (typeof raw === "string" ? JSON.parse(raw) : raw)[0];
  return { ms: Math.round(plan["Execution Time"]), rows: plan.Plan["Actual Rows"] };
};

/* The paths, as the app issues them (PostgREST embeds approximated by joins). */
const PATHS = (fc, uid) => [
  /* [label, GUARD ms (fails the gate), TARGET ms (reported as "slow"), sql] —
     guards are ~2× the quiet-hour median so a 20% load swing on the live
     database does not flap the gate, while 10× does fail it. */
  ["open CreditOps · partners",          250,  150, `select g.* from outsourcing_groups g where g.archived_at is null order by g.name`],
  ["open CreditOps · queue counts",      800,  300, `select * from public.creditops_queue_counts()`],
  ["main client list (1,000 rows)",      500,  300, `select fc.*, o.name, g.name, p.full_name, p.email from fulfillment_clients fc left join organizations o on o.id=fc.organization_id left join outsourcing_groups g on g.id=fc.outsourcing_group_id left join profiles p on p.id=fc.assigned_agent_id where fc.archived_at is null and fc.is_fixture=false order by fc.name limit 1000`],
  ["department rows · scope (Vanquish)",  800,  500, `select * from public.creditops_department_rows((select id from outsourcing_groups where name='Vanquish Ventures'))`],
  ["department statuses (200 ids)",      800,  500, `select s.*, p.full_name, p.email from client_department_statuses s left join profiles p on p.id=s.assignee_id where s.client_id in (select id from fulfillment_clients where archived_at is null and not is_fixture order by name limit 200) order by s.client_id`],
  ["open queue · Dispute",               800,  500, `select * from creditops_department_queue where department='Dispute' order by due_at nulls last limit 500`],
  ["My Work / next client",              600,  300, `select client_id, client_name, department, due_at from creditops_my_work where assignee_id='${uid}' order by due_at nulls first limit 100`],
  ["open Client Workspace · file",       500,  200, `select fc.*, o.name, g.name, p.full_name from fulfillment_clients fc left join organizations o on o.id=fc.organization_id left join outsourcing_groups g on g.id=fc.outsourcing_group_id left join profiles p on p.id=fc.assigned_agent_id where fc.id='${fc}'`],
  ["open Client Workspace · departments",800,  300, `select s.*, p.full_name from client_department_statuses s left join profiles p on p.id=s.assignee_id where s.client_id='${fc}'`],
  ["open Client Workspace · files count",300,  200, `select count(*) from files where entity_type='fulfillment_client' and entity_id='${fc}'`],
  ["Activity · client_feed",             400,  300, `select * from public.client_feed('${fc}'::uuid)`],
  ["Activity · timeline (RLS)",          400,  300, `select * from activity_events where entity_type='fulfillment_client' and entity_id='${fc}' order by created_at desc limit 200`],
  ["History tab · client_history",       500,  300, `select * from public.client_history('${fc}'::uuid)`],
  ["Identity & Access · secrets list",   300,  200, `select id, kind, label, provider, username, url, secret_id, last_rotated_at from client_secrets where client_id=(select client_id from fulfillment_clients where id='${fc}') and archived_at is null order by kind`],
  ["search · name filter",               500,  300, `select fc.id, fc.name from fulfillment_clients fc where fc.archived_at is null and not fc.is_fixture and fc.name ilike '%mar%' order by fc.name limit 50`],
  /* ── Whole app (FullSuite audit, 2026-09-30) ─────────────────────────── */
  ["bell · unread notifications (every page, every minute)", 1500, 300, `select id from notifications where read_at is null`],
  ["Clients directory (1,000 rows)",     1000,  500, `select c.* from clients c order by c.full_name limit 1000`],
  ["Partners page · partner list",        400,  300, `select g.* from outsourcing_groups g where g.archived_at is null order by g.name`],
  ["Home · attention",                    800,  500, `select * from work_attention`],
  ["Home · creditops exceptions",         800,  500, `select * from creditops_exceptions`],
  ["People · attendance (7 days)",        800,  500, `select * from public.attendance_for(current_date - 6, current_date)`],
  ["Communication · visible channels",    600,  300, `select * from public.visible_channels()`],
  ["EOD · my report",                     800,  500, `select public.eod_my_report(current_date)`],
  ["Finance · overview",                  600,  300, `select * from public.finance_overview(6)`],
  ["BES CRM · project board",            1500, 1000, `select * from public.crm_project_board('active')`],
  ["Reporting · pivot (division, 6 months)", 2000, 1000, `select * from public.report_pivot('division', array['time.minutes'], '{}'::jsonb, (date_trunc('month', current_date) - interval '5 months')::date, current_date)`],
  ["Reporting · scope options",          2000, 1000, `select * from public.report_scope_options((date_trunc('month', current_date) - interval '5 months')::date, current_date, null)`],
  ["Activity · 180-day status scan (facts arm)", 1000, 300, `select count(*) from activity_events where created_at >= now() - interval '180 days' and action = 'Status changed'`],
];

let failed = 0;
const table = [];
for (const [who, p] of [["OWNER / EXECUTIVE", exec], ["DIVISION MANAGER", division], ["DEPARTMENT MANAGER", departmt], ["TEAM LEAD", lead], ["AGENT", agent], ["NON-CREDITOPS", outsider]]) {
  if (!p) { console.log(`\n${who}: nobody on the roster fits — skipped`); continue; }
  const fc = busiest(p.user_id);
  console.log(`\n${who}: ${p.name}${fc ? "" : " (sees no client — file paths skipped)"}`);
  if (who === "NON-CREDITOPS") {
    /* Both halves of Dee's rule: nothing visible, and nothing expensive
       about proving it. */
    const runs = [];
    for (let i = 0; i < (reportOnly ? 1 : 3); i++) runs.push(timeAs(p.user_id, `select (select count(*) from fulfillment_clients) as clients, (select count(*) from creditops_department_queue) as queue, (select count(*) from client_department_statuses) as rows`));
    runs.sort((a, b) => a.ms - b.ms);
    const seen = runs[Math.floor(runs.length / 2)];
    const counts = q.query(`begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${p.user_id}","role":"authenticated"}', true);
      select (select count(*)::int from fulfillment_clients) as clients, (select count(*)::int from creditops_department_queue) as queue, (select count(*)::int from client_department_statuses) as rows; rollback;`)[0];
    const leak = counts.clients > 0 || counts.queue > 0 || counts.rows > 0;
    if (leak && !reportOnly) failed++;
    console.log(`${(leak ? "LEAK " : "  ok ") + "sees nothing: clients/queue/department rows".padEnd(33)} ${`${counts.clients}/${counts.queue}/${counts.rows}`.padStart(6)} ${(seen.ms + "ms").padStart(8)} ${"0 rows".padStart(7)}`);
    /* Target 300 ms; guard 600 ms (the three zero-row scans each pay one policy-set build). */
    if (seen.ms > 600 && !reportOnly) { failed++; console.log("OVER  proving 'nothing' cost more than 600ms"); }
    else if (seen.ms > 300) console.log("slow  proving 'nothing' is over the 300ms target");
  }
  console.log(`${"PATH".padEnd(38)} ${"ROWS".padStart(6)} ${"TIME".padStart(8)} ${"TARGET/GUARD".padStart(12)}`);
  for (const [label, limit, target, sql] of PATHS(fc, p.user_id)) {
    if (!fc && sql.includes("'null'")) continue;
    /* No client to open: the workspace paths do not apply. */
    if (!fc && /Workspace|Activity|History|Identity/.test(label)) continue;
    /* The gate takes the MEDIAN of three runs: the live database serves the
       team while this runs, and one 690 ms spike on a 230 ms path must not
       turn the gate red — while a path that is slow three times in a row
       must. Report mode runs once. */
    let r;
    try {
      const runs = [];
      for (let i = 0; i < (reportOnly ? 1 : 3); i++) runs.push(timeAs(p.user_id, sql));
      runs.sort((a, b) => a.ms - b.ms);
      r = runs[Math.floor(runs.length / 2)];
      /* The ceiling applies to the WORST single run, not the median. */
      if (runs[runs.length - 1].ms > 10_000) r = runs[runs.length - 1];
    } catch (e) {
      /* A capability refusal (42501) is the right answer for this role, not
         a slow one: the path does not exist for them. Anything else is an error. */
      if (/42501/.test(String(e))) { console.log(`  n/a  ${label.padEnd(33)} ${"denied".padStart(6)}`); continue; }
      r = { ms: Infinity, rows: "ERR " + String(e).slice(0, 40) };
    }
    /* Dee, 2026-09-30: every action, click, load and navigation under 10 s —
       an absolute ceiling on any single measurement, whatever the guard. */
    const HARD_CEILING_MS = 10_000;
    const over = r.ms > limit || r.ms > HARD_CEILING_MS;
    const slow = !over && r.ms > target;
    if (over && !reportOnly) failed++;
    table.push({ who, label, ms: r.ms, limit });
    console.log(`${(over ? "OVER " : slow ? "slow " : "  ok ") + label.padEnd(33)} ${String(r.rows).padStart(6)} ${(r.ms + "ms").padStart(8)} ${(target + "/" + limit + "ms").padStart(10)}`);
  }
}
const worst = [...table].sort((a, b) => b.ms - a.ms)[0];
console.log(`\nslowest: ${worst.who} · ${worst.label} · ${worst.ms}ms`);
if (failed > 0) { console.log(`\nLATENCY GATE FAILED: ${failed} path(s) over threshold`); process.exit(1); }
console.log("\nLATENCY GATE PASSED");
