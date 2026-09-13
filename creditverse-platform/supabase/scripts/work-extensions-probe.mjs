/**
 * The shared work-item extensions, asserted against the live database.
 *
 * `start_at`, `estimated_minutes` and labels were designed ONCE at the generic
 * layer (migration 0338) because TalentOps and BES CRM both need them and two
 * implementations of one idea is how one truth becomes several.
 *
 * What is worth asserting is not that the columns exist — a migration proves
 * that — but that the RULES hold: a start cannot follow its own due date, an
 * estimate cannot be absurd, actual time is never stored beside a sum that
 * derives it, and a label can never become a side door onto work.
 *
 * Run: node supabase/scripts/work-extensions-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const fails = [];
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${n}`); } else { fails.push(n); console.log(`  FAIL ${n}\n       want ${JSON.stringify(want)} got ${JSON.stringify(got)}`); } };
const attempt = (sql) => { try { q.query(`begin; ${sql} rollback;`); return { ok: true }; }
  catch (e) { try { q.query("rollback;"); } catch { /* gone */ } return { ok: false, m: String(e.message) }; } };

const item = q.query("select id from work_items where archived_at is null limit 1")[0].id;

console.log("\nShared work-item extensions\n");
check("a start after its own due date is refused",
  attempt(`update work_items set start_at = now() + interval '10 days', due_at = now() where id = '${item}';`).ok, false);
check("a start before its due date is fine",
  attempt(`update work_items set due_at = now() + interval '10 days', start_at = now() where id = '${item}';`).ok, true);
check("a negative estimate is refused",
  attempt(`update work_items set estimated_minutes = -5 where id = '${item}';`).ok, false);
check("an absurd estimate is refused",
  attempt(`update work_items set estimated_minutes = 60*24*400 where id = '${item}';`).ok, false);
check("a sane estimate is accepted",
  attempt(`update work_items set estimated_minutes = 90 where id = '${item}';`).ok, true);

const t = q.query(`begin; update work_items set estimated_minutes = 90 where id = '${item}';
  select estimated_minutes, actual_minutes from work_item_time('${item}'); rollback;`);
check("work_item_time returns the estimate", t[0]?.estimated_minutes, 90);
check("and actual as a number, never null", typeof t[0]?.actual_minutes, "number");

const dup = attempt(`
  insert into work_labels (agency_id, name) values ((select id from agencies limit 1), 'Onboarding');
  insert into work_labels (agency_id, name) values ((select id from agencies limit 1), 'onboarding');`);
check("the same label in two cases is refused", dup.ok, false);

const rls = q.query(`select relrowsecurity from pg_class where relname in ('work_labels','work_item_labels') order by relname`);
check("both label tables have RLS", rls.map((r) => r.relrowsecurity), [true, true]);
const del = q.query(`select count(*)::int n from pg_policies where tablename='work_labels' and cmd='DELETE'`);
check("a label is archived, never deleted", del[0].n, 0);

console.log(`\n${pass} passed, ${fails.length} failed\n`);
if (fails.length) process.exit(1);
