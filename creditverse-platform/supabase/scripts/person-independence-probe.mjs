/**
 * Nothing in this platform may work because of WHO somebody is.
 *
 * Dee, 2026-09-13: "No operational behavior should depend on a person's name
 * or email… Dee is Owner because the database says she is Owner. Not because
 * the code knows who Dee is."
 *
 * ── WHY A PROBE AND NOT A ONE-OFF AUDIT ─────────────────────────────────────
 *
 * An audit is true on the day it is run. This rule has to survive every future
 * change, including the tempting three-line fix at 2am that special-cases one
 * account. So it is a gate: it reads the LIVE catalogue and fails if any
 * function body or policy expression mentions a real person, and it proves the
 * role-driven behaviours actually behave that way by swapping who holds them.
 *
 * Every behavioural scenario runs as a REAL authenticated user inside a
 * transaction that is rolled back.
 *
 * Run: node supabase/scripts/person-independence-probe.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

/* `supabase/scripts/` → the app root, which is where `src/` lives. */
const ROOT = new URL("../../", import.meta.url).pathname;
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

let pass = 0;
const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

/**
 * The people to look for.
 *
 * Read from the DATABASE, not typed here — a hard-coded roster in the probe
 * that guards against hard-coded rosters would be its own joke, and it would
 * go stale the first time somebody is hired.
 */
const staff = q.query(`
  select distinct p.full_name, p.email::text as email
    from public.profiles p
   where coalesce(p.is_fixture, false) = false
     and (exists (select 1 from public.agency_memberships m where m.user_id = p.id)
          or exists (select 1 from public.partner_contacts c where c.user_id = p.id))`);

/* Surnames and local-parts are what a shortcut would actually use. */
const needles = new Set();
for (const s of staff) {
  for (const word of String(s.full_name ?? "").split(/\s+/)) {
    if (word.length >= 5) needles.add(word.toLowerCase());
  }
  const local = String(s.email ?? "").split("@")[0];
  if (local.length >= 5) needles.add(local.toLowerCase());
}
const pattern = [...needles].map((n) => n.replace(/[^a-z0-9]/g, "")).filter(Boolean).join("|");

console.log(`\nPerson independence — ${staff.length} real people, ${needles.size} name fragments\n`);

console.log("Nothing in the database decides by a person");
{
  const fns = q.query(`
    select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ~* '(${pattern})' order by 1`);
  check("no function body mentions a real person", fns.map((f) => f.name), []);

  const pols = q.query(`
    select tablename || '.' || policyname as name from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~* '(${pattern})' or coalesce(with_check, '') ~* '(${pattern})')
     order by 1`);
  check("no policy expression mentions a real person", pols.map((p) => p.name), []);

  const checks = q.query(`
    select conname as name from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~* '(${pattern})' order by 1`);
  check("no check constraint mentions a real person", checks.map((c) => c.name), []);
}

console.log("\nNor does the application's authorization code");
{
  /* Only files that could carry an authorization decision. Tests, fixtures,
     seed data and the archive are display, and Dee's rule says names are fine
     as labels. */
  const scan = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "_archive" || entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { scan(full, out); continue; }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
    return out;
  };
  const re = new RegExp(
    `(email|full_?name|displayName|username)\\s*(===|==|!==|!=)\\s*["'\`]|` +
    `["'\`][^"'\`]*(${pattern})[^"'\`]*["'\`]\\s*(===|==|!==|!=)`, "i");
  const hits = scan(join(ROOT, "src"))
    .filter((f) => re.test(readFileSync(f, "utf8")))
    .map((f) => relative(ROOT, f));
  check("no source file branches on a name or an email", hits, []);
}

/* ── The behaviours, proven by swapping who holds them ─────────────────── */

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER  = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
const AGENT  = one(`select m.user_id from agency_memberships m join profiles p on p.id = m.user_id
                     where m.role = 'agency_user' and m.status = 'active'
                       and not m.is_owner and coalesce(p.is_fixture, false) = false limit 1`).user_id;

const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* already gone */ }
    return { ok: false, message: String(e.message ?? e) };
  }
};

console.log("\nTeam Lead is a row, so replacing one needs no deploy");
{
  const TEAM = "(select id from teams where name='CreditOps Dispute Processing Team')";
  const r = as(AGENT, `
    delete from team_memberships where team_id = ${TEAM};
    insert into team_memberships (team_id, user_id, is_lead) values (${TEAM}, '${AGENT}', true);`,
    `select exists (select 1 from team_memberships m join teams t on t.id = m.team_id
                     where t.name = 'CreditOps Dispute Processing Team'
                       and m.user_id = auth.uid() and m.is_lead) as i_am_lead;`);
  check("whoever holds the row is the lead", r.ok ? r.rows[0]?.i_am_lead : "error", true);

  const r2 = as(AGENT, `
    delete from team_memberships where team_id = ${TEAM};
    insert into team_memberships (team_id, user_id, is_lead) values (${TEAM}, '${OWNER}', true);`,
    `select exists (select 1 from team_memberships m join teams t on t.id = m.team_id
                     where t.name = 'CreditOps Dispute Processing Team'
                       and m.user_id = auth.uid() and m.is_lead) as i_am_lead;`);
  check("hand the row to somebody else and it moves with it", r2.ok ? r2.rows[0]?.i_am_lead : "error", false);
}

console.log("\nOwner is a flag, not an identity");
{
  const r = as(OWNER, "", `select public.agency_can('partners.invoices.view') as may_see_money;`);
  check("the owner reaches owner-gated money", r.ok ? r.rows[0]?.may_see_money : "error", true);

  /* The heart of Dee's rule: the SAME account, same name, same email — with
     the flag taken away. If money still opened, something knew who she was. */
  const r2 = as(OWNER, `update agency_memberships set is_owner = false where user_id = '${OWNER}';`,
    `select public.agency_can('partners.invoices.view') as may_see_money;`);
  check("take the flag away and the same person is refused", r2.ok ? r2.rows[0]?.may_see_money : "error", false);

  const r3 = as(AGENT, `update agency_memberships set is_owner = true where user_id = '${AGENT}';`,
    `select public.agency_can('partners.invoices.view') as may_see_money;`);
  check("give it to anybody else and they are allowed", r3.ok ? r3.rows[0]?.may_see_money : "error", true);

  const r4 = as(AGENT, "", `select public.agency_can('partners.invoices.view') as may_see_money;`);
  check("an admin alone is NOT financial access", r4.ok ? r4.rows[0]?.may_see_money : "error", false);
}

console.log("\nPartner scope follows the assignment row");
{
  const group = one(`select g.id, g.name from outsourcing_groups g
                      where g.archived_at is null
                        and not exists (select 1 from partner_assignments a
                                         where a.group_id = g.id and a.user_id = '${AGENT}' and a.ended_on is null)
                      limit 1`);
  const before = as(AGENT, "", `select public.can_see_partner('${group.id}') as sees;`);
  check(`an unassigned partner is not theirs to see`, before.ok ? before.rows[0]?.sees : "error", false);

  const after = as(AGENT, `
    insert into partner_assignments (agency_id, group_id, user_id, assignment_role, started_on, created_by)
    values ('${AGENCY}', '${group.id}', '${AGENT}', 'assigned', current_date, '${OWNER}');`,
    `select public.can_see_partner('${group.id}') as sees;`);
  check("add the row and it becomes theirs", after.ok ? after.rows[0]?.sees : "error", true);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
