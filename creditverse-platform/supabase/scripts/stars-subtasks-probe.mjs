/**
 * Stars and subtasks (migration 20260921005000), as the people who use them.
 *
 *   • a star is private: I read mine, never a colleague's
 *   • I can only star work I can already see — the work_items policy decides
 *   • a subtask is a work item with a parent in the same workspace
 *   • an item cannot be its own parent
 *
 * Every case runs inside a transaction that is rolled back.
 * Run: node supabase/scripts/stars-subtasks-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];
const session = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER = one(`select user_id from agency_memberships where agency_id='${AGENCY}' and is_owner limit 1`).user_id;
const AGENT = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id where m.agency_id='${AGENCY}' and m.role='agency_user' and m.status='active' and p.email='probe.agent@bes.test' limit 1`)?.user_id
  ?? one(`select user_id from agency_memberships where agency_id='${AGENCY}' and role='agency_user' and status='active' limit 1`).user_id;
const ITEM = one(`select w.id, w.workspace_id from work_items w join workspaces ws on ws.id=w.workspace_id where ws.agency_id='${AGENCY}' and ws.organization_id is null and w.archived_at is null and w.parent_id is null order by w.created_at limit 1`);
if (!ITEM) { console.log("no BES-owned workspace item to probe against"); process.exit(1); }

console.log("Stars");
{
  const r = q.query(`begin; ${session(OWNER)}
    insert into work_item_stars (user_id, work_item_id) values ('${OWNER}', '${ITEM.id}');
    select count(*)::int n from work_item_stars where work_item_id='${ITEM.id}';
    rollback;`);
  check("1 · the owner stars an item they can see, and reads it back", r[0]?.n, 1);
}
{
  const r = q.query(`begin; set local role postgres;
    insert into work_item_stars (user_id, work_item_id) values ('${OWNER}', '${ITEM.id}');
    ${session(AGENT)}
    select count(*)::int n from work_item_stars where work_item_id='${ITEM.id}';
    rollback;`);
  check("2 · a colleague does not see the owner's star", r[0]?.n, 0);
}
{
  let err = null;
  try { q.query(`begin; ${session(AGENT)} insert into work_item_stars (user_id, work_item_id) values ('${OWNER}', '${ITEM.id}'); rollback;`); } catch (e) { err = String(e.message ?? e); }
  check("3 · nobody can star on somebody else's behalf", /row-level security|violates/.test(err ?? ""), true);
}
{
  const ghost = "00000000-0000-0000-0000-00000000dead";
  let err = null;
  try { q.query(`begin; ${session(OWNER)} insert into work_item_stars (user_id, work_item_id) values ('${OWNER}', '${ghost}'); rollback;`); } catch (e) { err = String(e.message ?? e); }
  check("4 · starring work that does not exist (or is not visible) is refused", !!err, true);
}

console.log("Subtasks");
{
  const r = q.query(`begin; ${session(OWNER)}
    insert into work_items (agency_id, scope, organization_id, related_type, title, stage, priority, workspace_id, board_id, status_id, parent_id)
    select agency_id, scope, organization_id, related_type, 'Probe subtask', stage, priority, workspace_id, board_id, status_id, id from work_items where id='${ITEM.id}';
    select count(*)::int n from work_items where parent_id='${ITEM.id}' and title='Probe subtask';
    rollback;`);
  check("5 · a subtask is a canonical work item with a parent", r[0]?.n, 1);
}
{
  let err = null;
  try { q.query(`begin; set local role postgres; update work_items set parent_id=id where id='${ITEM.id}'; rollback;`); } catch (e) { err = String(e.message ?? e); }
  check("6 · an item cannot be its own parent", /work_items_not_own_parent/.test(err ?? ""), true);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
