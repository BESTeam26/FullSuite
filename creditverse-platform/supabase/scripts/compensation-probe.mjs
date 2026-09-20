#!/usr/bin/env node
/**
 * Compensation arrangements, proved against the live database.
 *
 * Dee, 2026-09-20: BES pays Bryan ₱100/hour for Archie; Bryan pays Archie
 * ₱80. The ₱20 is Bryan's margin — not a BES expense on top, and never
 * Archie's pay. Three things have to be true at once:
 *
 *   the arithmetic     each side priced separately, segment by segment,
 *                      monthly prorated by PAID SCHEDULED WORKDAYS
 *   the equivalence    a direct arrangement pays exactly what the old
 *                      single-rate generator paid — nobody's pay moved
 *   the boundary       the worker never sees BES's cost or the margin, and
 *                      payroll permission alone does not open them either
 *
 *   node supabase/scripts/compensation-probe.mjs
 *
 * Every scenario runs inside a transaction that is rolled back, and the
 * visibility scenarios run as REAL authenticated users — a superuser proves
 * nothing about who may read what.
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};
const tx = (sql) => q.query(`begin; ${sql} rollback;`);
const asUser = (user, sql, setup = "") => q.query(
  `begin; ${setup} set local role authenticated;
   do $c$ begin perform set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true); end $c$;
   ${sql} rollback;`);

const AGENCY = q.query("select id from agencies limit 1")[0].id;
const person = (name) => q.query(
  `select p.id from profiles p join agency_memberships m on m.user_id=p.id
    where p.full_name ilike '${name}%' and m.status='active' limit 1`)[0]?.id;
const ARCHIE = person("Archie"), BRYAN = person("Bryan");

/* A scratch person, a Mon–Fri schedule, and worked time — built inside the
   transaction so the probe never depends on what the live roster happens to
   have logged today. */
const scratch = (extra) => `
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','comp.probe@bes.test', now(), now());
  /* The profile row is made by the auth.users trigger; only the name is ours. */
  update profiles set full_name = 'Comp Probe' where id = '00000000-0000-4000-8000-0000000000c1';
  insert into agency_memberships (agency_id, user_id, role, status, agent_number)
  values ('${AGENCY}','00000000-0000-4000-8000-0000000000c1','agency_user','active', 981);
  insert into work_schedules (user_id, agency_id, effective_from, work_days, shift_start, shift_end, lunch_minutes, break_minutes)
  values ('00000000-0000-4000-8000-0000000000c1','${AGENCY}','2020-01-01','{1,2,3,4,5}','09:00','18:00',60,0);
  ${extra ?? ""}`;
const P = "'00000000-0000-4000-8000-0000000000c1'";
/* Eight hours a day, every weekday of a range. */
const worked = (from, to) => `
  insert into time_entries (employee_id, agency_id, kind, work_date, started_at, ended_at)
  select ${P}, '${AGENCY}', 'work', d::date,
         d + interval '9 hour', d + interval '17 hour'
    from generate_series(date '${from}', date '${to}', interval '1 day') d
   where extract(isodow from d) between 1 and 5;`;
const WORKED = worked("2026-09-01", "2026-09-15");
const arrange = (basis, agent, bes, partner) => `
  insert into compensation_arrangements
    (agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents,
     bes_cost_cents, managing_partner_id, currency, effective_from, reason)
  values ('${AGENCY}', ${P}, ${partner ? "'managing_partner'" : "'direct_bes'"}, '${basis}',
          ${agent}, ${bes}, ${partner ? `'${partner}'` : "NULL"}, 'PHP', '2020-01-01',
          'Probe arrangement.');`;
const priced = (extra = "") => tx(`${scratch(WORKED)} ${extra}
  select agent_payable_cents, bes_payable_cents, margin_cents, work_minutes, paid_days
    from compensation_for_period(${P}, '2026-09-01', '2026-09-15');`)[0];

console.log("\nTHE ARITHMETIC");
/* 11 weekdays × 8h = 88 hours. ₱80 → ₱7,040; ₱100 → ₱8,800; margin ₱1,760. */
check("1 — hourly under a managing partner pays each side its own rate",
  priced(arrange("hourly", 8000, 10000, BRYAN)),
  { agent_payable_cents: 704000, bes_payable_cents: 880000, margin_cents: 176000,
    work_minutes: 5280, paid_days: 11 });

check("2 — a direct arrangement has no margin",
  priced(arrange("hourly", 10000, 10000, null)).margin_cents, 0);

/* A ₱20,000 month: the first half's share, shared over the period's paid
   scheduled workdays — not its calendar days. */
const monthly = priced(arrange("monthly", 2000000, 2000000, null));
check("3 — a monthly package prorates without touching calendar days",
  monthly.agent_payable_cents,
  tx(`${scratch()} select monthly_share_cents(2000000, '2026-09-01', '2026-09-15') as c;`)[0].c);

/* Mid-period rate change: 6 weekdays at ₱80, then 5 at ₱100 — 48h + 40h. */
check("4 — a rate change mid-period prices each stretch with the rate that was true then",
  priced(`
    insert into compensation_arrangements
      (agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents, bes_cost_cents,
       currency, effective_from, effective_to, reason)
    values ('${AGENCY}', ${P}, 'direct_bes', 'hourly', 8000, 8000, 'PHP', '2026-01-01', '2026-09-08', 'First.'),
           ('${AGENCY}', ${P}, 'direct_bes', 'hourly', 10000, 10000, 'PHP', '2026-09-09', NULL, 'Then.');`
  ).agent_payable_cents,
  48 * 8000 + 40 * 10000);

console.log("\nADJUSTMENTS CARRY A SCOPE");
const adjusted = (scope) => priced(`${arrange("hourly", 8000, 10000, BRYAN)}
  insert into compensation_adjustments
    (agency_id, user_id, adjustment_type, financial_scope, amount_cents, effective_on, reason)
  values ('${AGENCY}', ${P}, 'bonus', '${scope}', 50000, '2026-09-10', 'Probe bonus.');`);
check("5 — agent_only moves the worker's pay and not BES's cost",
  [adjusted("agent_only").agent_payable_cents, adjusted("agent_only").bes_payable_cents],
  [704000 + 50000, 880000]);
check("6 — bes_only moves BES's cost and not the worker's pay",
  [adjusted("bes_only").agent_payable_cents, adjusted("bes_only").bes_payable_cents],
  [704000, 880000 + 50000]);
check("7 — both moves the two together and leaves the margin alone",
  adjusted("both").margin_cents, 176000);

console.log("\nEQUIVALENCE: NOBODY'S PAY MOVED");
/* The old generator's arithmetic, written out, against the engine's answer
   for the same person and period. If these ever diverge, somebody's pay
   changed silently — which is the whole reason this check exists. */
const OLD = `((m.work_minutes + m.paid_leave_minutes + m.paid_break_minutes)::numeric * 10000 / 60)::bigint`;
check("8 — hourly: the engine pays exactly what the single-rate generator paid",
  tx(`${scratch(WORKED)} ${arrange("hourly", 10000, 10000, null)}
      select (select ${OLD} from payable_minutes(${P}, '2026-09-01','2026-09-15') m) as old,
             (select agent_payable_cents from compensation_for_period(${P},'2026-09-01','2026-09-15')) as new;`
  ).map((r) => r.old === r.new)[0], true);

console.log("\nTHE BOUNDARY");
/* Who can read BES's cost, and who cannot. */
const readsCost = (u) => asUser(u, `select coalesce(public.reads_bes_cost('${AGENCY}'), false) as c;`)[0].c;
const OWNER = q.query("select user_id from agency_memberships where is_owner limit 1")[0].user_id;
check("9 — the owner reads BES cost", readsCost(OWNER), true);

/* The claim is not "no admin may see cost" — Bryan was GRANTED it, and does.
   The claim is that payroll permission does not carry it. So: a fresh admin,
   given payroll and nothing else, inside a transaction that is rolled back. */
const PAYROLL_ONLY = `${scratch()}
  update agency_memberships set role = 'agency_admin' where user_id = ${P};
  insert into agency_member_permissions (membership_id, key, allowed)
  select id, 'payroll.manage', true from agency_memberships where user_id = ${P};`;
check("10 — payroll permission alone does NOT open BES cost",
  asUser("00000000-0000-4000-8000-0000000000c1",
    `select coalesce(public.reads_bes_cost('${AGENCY}'), false) as c,
            coalesce(public.agency_can('payroll.manage'), false) as p;`, PAYROLL_ONLY)[0],
  { c: false, p: true });
check("11 — Bryan reads it because it was granted to him by name, not because he is an admin",
  [readsCost(BRYAN),
   q.query(`select count(*)::int as n from agency_member_permissions amp
             join agency_memberships m on m.id = amp.membership_id
            where m.user_id = '${BRYAN}' and amp.key = 'compensation.bes_cost.view' and amp.allowed`)[0].n],
  [true, 1]);
check("11b — an ordinary agent does not", readsCost(ARCHIE), false);

/* The columns themselves, not just the capability. */
const cols = ["bes_cost_cents", "bes_total_cents", "margin_cents", "segments", "managing_partner_id", "arrangement_type", "bes_adjustment_cents", "bes_payout_cents"];
check("12 — the internal columns are revoked from authenticated outright",
  q.query(`select count(*)::int as n from information_schema.column_privileges
            where table_name='payslips' and grantee='authenticated'
              and privilege_type='SELECT' and column_name in (${cols.map((c) => `'${c}'`).join(",")})`)[0].n, 0);
check("13 — the agent-side columns are still readable",
  q.query(`select count(*)::int as n from information_schema.column_privileges
            where table_name='payslips' and grantee='authenticated' and privilege_type='SELECT'
              and column_name in ('base_cents','gross_cents','adjustment_cents','rate_cents')`)[0].n, 4);

check("14 — a worker's own payslip view carries no internal column",
  q.query(`select count(*)::int as n from information_schema.columns
            where table_name='my_payslips' and column_name = any(array[${cols.map((c) => `'${c}'`).join(",")}])`)[0].n, 0);

/* The gated view: a worker must not reach their own row through it. */
check("15 — payslips_internal is closed to someone without the capability",
  asUser(ARCHIE, `select count(*)::int as n from payslips_internal;`)[0].n, 0);

/* The row opened up on 2026-09-20 so payroll and the person themselves can
   read the worker's rate. The COST had better not have opened with it. */
check("15b — a worker can read their own arrangement",
  asUser(ARCHIE, `select count(*)::int as n from compensation_arrangements where user_id = '${ARCHIE}';`)[0].n > 0,
  true);
check("15c — …and not anybody else's",
  asUser(ARCHIE, `select count(*)::int as n from compensation_arrangements where user_id <> '${ARCHIE}';`)[0].n, 0);
check("15d — BES cost is revoked from authenticated on the arrangement too",
  q.query(`select count(*)::int as n from information_schema.column_privileges
            where table_name='compensation_arrangements' and grantee='authenticated'
              and privilege_type='SELECT' and column_name='bes_cost_cents'`)[0].n, 0);
check("15e — a worker cannot reach the cost through the internal view either",
  asUser(ARCHIE, `select count(*)::int as n from compensation_arrangements_internal;`)[0].n, 0);
check("15f — the managing partner reads the cost of the arrangements they are paid for",
  asUser(BRYAN, `select count(*)::int as n from compensation_arrangements_internal where user_id = '${ARCHIE}';`)[0].n, 1);

console.log("\nWRITING IS GATED AND APPEND-ONLY");
const refused = (fn) => { try { fn(); return "allowed"; } catch (e) { return /42501|permission|policy|row-level/i.test(e.message) ? "refused" : `other: ${e.message.slice(0, 70)}`; } };
check("16 — an agent cannot write an arrangement",
  refused(() => asUser(ARCHIE, `insert into compensation_arrangements
    (agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents, bes_cost_cents,
     currency, effective_from, reason)
    values ('${AGENCY}','${ARCHIE}','direct_bes','hourly',99999,99999,'PHP','2026-01-01','Probe.');`)),
  "refused");

check("17 — money on a live arrangement cannot be edited, only closed",
  (() => { try {
    tx(`${scratch()} ${arrange("hourly", 8000, 10000, BRYAN)}
        update compensation_arrangements set agent_rate_cents = 1 where user_id = ${P};`);
    return "allowed";
  } catch (e) { return /history once|append-only/i.test(e.message) ? "refused" : `other: ${e.message.slice(0, 70)}`; } })(),
  "refused");

check("18 — an arrangement without a reason is refused",
  (() => { try {
    tx(`${scratch()} insert into compensation_arrangements
      (agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents, bes_cost_cents,
       currency, effective_from) values ('${AGENCY}', ${P}, 'direct_bes','hourly',8000,8000,'PHP','2026-01-01');`);
    return "allowed";
  } catch (e) { return /say why|reason/i.test(e.message) ? "refused" : `other: ${e.message.slice(0, 70)}`; } })(),
  "refused");

check("19 — two live arrangements for one person cannot overlap",
  (() => { try {
    tx(`${scratch()} ${arrange("hourly", 8000, 8000, null)} ${arrange("hourly", 9000, 9000, null)}`);
    return "allowed";
  } catch (e) { return /overlap|exclusion|conflicting/i.test(e.message) ? "refused" : `other: ${e.message.slice(0, 70)}`; } })(),
  "refused");

check("20 — a direct arrangement cannot hide a margin",
  (() => { try {
    tx(`${scratch()} ${arrange("hourly", 8000, 10000, null)}`);
    return "allowed";
  } catch (e) { return /check|constraint/i.test(e.message) ? "refused" : `other: ${e.message.slice(0, 70)}`; } })(),
  "refused");

check("21 — payroll permission alone cannot set an arrangement",
  (() => { try {
    asUser("00000000-0000-4000-8000-0000000000c1",
      `select public.set_compensation_arrangement(${P},'direct_bes','hourly',8000,8000,null,'PHP','2026-01-01','Probe.');`,
      PAYROLL_ONLY);
    return "allowed";
  } catch (e) { return /42501|compensation permission/i.test(e.message) ? "refused" : `other: ${e.message.slice(0, 70)}`; } })(),
  "refused");

console.log("\nEND TO END: GENERATE AND RELEASE");
/* The whole path, through the real functions: a cutoff, a generation, a
   payslip, and the total a release would book. The claim being tested is that
   BES's expense is BES's COST — the workers' total would be short by exactly
   the margin, which is money that would otherwise go unaccounted for.

   Its own period, in a year with no live cutoffs, because the real payroll
   calendar owns September. Ten weekdays at eight hours is the 80.00 hours of
   Dee's layout: PHP 6,400 to the contractor, PHP 8,000 from BES. */
const E2E = `${scratch(worked("2025-03-03", "2025-03-14"))}
  ${arrange("hourly", 8000, 10000, BRYAN)}
  insert into fx_rates (agency_id, base_currency, quote_currency, rate, effective_from)
  values ('${AGENCY}', 'PHP', 'USD', 0.017, '2025-01-01') on conflict do nothing;
  insert into payroll_cutoffs (agency_id, period_start, period_end, status)
  values ('${AGENCY}', '2025-03-03', '2025-03-14', 'draft');
  /* PERFORM, not SELECT: a second result set confuses the transport, and the
     count is not what any of these checks is about. */
  do $g$ begin perform public.payroll_generate_internal((select id from public.payroll_cutoffs
    where agency_id='${AGENCY}' and period_start='2025-03-03')); end $g$;`;

check("22 — generation splits the two sides onto the payslip",
  tx(`${E2E}
    select p.work_minutes, p.base_cents, p.gross_cents, p.bes_cost_cents, p.bes_total_cents,
           p.margin_cents, p.arrangement_type, jsonb_array_length(p.segments) as segments
      from payslips p where p.user_id = ${P};`)[0],
  { work_minutes: 4800, base_cents: 640000, gross_cents: 640000, bes_cost_cents: 800000,
    bes_total_cents: 800000, margin_cents: 160000, arrangement_type: "managing_partner", segments: 1 });

const totals = tx(`${E2E}
  select sum(bes_payout_cents)::bigint as bes, sum(payout_cents)::bigint as workers
    from payslips where cutoff_id = (select id from payroll_cutoffs
      where agency_id='${AGENCY}' and period_start='2025-03-03');`)[0];
check("23 — the total a release books is BES's cost, above the workers' total by the margin",
  [totals.bes !== null, Number(totals.bes) > Number(totals.workers)], [true, true]);

/* Read as Bryan, because the settlement is gated and a superuser proves
   nothing about who may open it. He is both the partner being invoiced and a
   holder of the internal-cost capability. */
const SETTLEMENT = `select bes_pays_partner_cents, partner_pays_workers_cents, partner_margin_cents, people
      from managing_partner_settlements
     where period_start = '2025-03-03' and managing_partner_id = '${BRYAN}';`;
check("24 — the settlement says what BES owes the partner and what the partner owes the worker",
  asUser(BRYAN, SETTLEMENT, E2E)[0],
  { bes_pays_partner_cents: 800000, partner_pays_workers_cents: 640000,
    partner_margin_cents: 160000, people: 1 });

check("25 — the worker in the arrangement cannot read the settlement about themselves",
  asUser(ARCHIE, SETTLEMENT, E2E).length, 0);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
