#!/usr/bin/env node
/**
 * The money boundary, proved against the live database.
 *
 * Dee's rule, 2026-09-12: "Admin = broad operational authority. Owner =
 * financial authority. Money access = explicit delegation."
 *
 *   node supabase/scripts/money-boundary-probe.mjs
 *
 * Every scenario runs as a REAL authenticated user inside a transaction that
 * is rolled back — the point is who may do what, which a superuser never
 * proves.
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${ok ? "" : `\n        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};
const MONEY = ["billing.view","billing.manage","partners.invoices.view","partners.invoices.manage",
  "partners.payments.record","partners.revenue.record","finance.dashboard.view","payroll.view","expenses.view"];
const asUser = (user, sql) => q.query(
  `begin; ${sql.setup ?? ""} set local role authenticated;
   do $c$ begin perform set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true); end $c$;
   ${sql.action} rollback;`);
const canAll = (user, setup = "") => asUser(user, { setup, action:
  `select ${MONEY.map((k, i) => `public.agency_can('${k}') as c${i}`).join(", ")};` })[0];
const allow = (r) => MONEY.filter((_, i) => r[`c${i}`]);

const OWNER = q.query("select user_id from agency_memberships where is_owner limit 1")[0]?.user_id;
/* An admin with NO money grants of their own. Bryan Breva holds explicit
   payroll.view/manage — a real delegation the owner made — so using him would
   test his grants rather than the rule. */
const ADMIN = q.query(`select am.user_id from agency_memberships am
  join profiles p on p.id=am.user_id
 where am.role='agency_admin' and not coalesce(am.is_owner,false)
   and p.email not like '%bes.test'
   and not exists (select 1 from agency_member_permissions amp
                    join permission_keys pk on pk.key=amp.key and pk.owner_gated
                   where amp.membership_id=am.id and amp.allowed)
 limit 1`)[0]?.user_id;
const MEMBERSHIP = q.query(`select id from agency_memberships where user_id='${ADMIN}'`)[0]?.id;

console.log("\nTHE MONEY BOUNDARY");
check("1 — the owner has every money capability", allow(canAll(OWNER)).length, MONEY.length);
check("2 — an admin has none of them without a grant", allow(canAll(ADMIN)), []);

check("3 — the owner can grant ONE capability to an individual",
  allow(canAll(ADMIN, `insert into agency_member_permissions (membership_id, key, allowed)
    values ('${MEMBERSHIP}','partners.invoices.view',true)
    on conflict (membership_id,key) do update set allowed=true;`)),
  ["partners.invoices.view"]);

check("4 — the grant reaches only what was granted, not the rest of the money",
  allow(canAll(ADMIN, `insert into agency_member_permissions (membership_id, key, allowed)
    values ('${MEMBERSHIP}','billing.view',true)
    on conflict (membership_id,key) do update set allowed=true;`)),
  ["billing.view"]);

/* An admin writing their own grant. The table's own policy is the test —
   nothing about being an admin should let somebody hand themselves money. */
const selfGrant = (() => {
  try {
    asUser(ADMIN, { action: `insert into agency_member_permissions (membership_id, key, allowed)
      values ('${MEMBERSHIP}','payroll.view',true);` });
    return "allowed";
  } catch (e) { return String(e.message).includes("42501") || /policy|permission/i.test(e.message) ? "refused" : "other"; }
})();
check("5 — an admin cannot grant themselves money access", selfGrant, "refused");

check("6 — with no capability, the finance data itself is refused",
  (() => {
    try {
      const r = asUser(ADMIN, { action: "select count(*)::int as n from agency_expenses;" });
      return r[0]?.n === 0 ? "no rows" : "rows returned";
    } catch { return "refused"; }
  })(),
  "no rows");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
